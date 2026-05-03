import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { v4 as uuid } from "uuid";
import { StateManager } from "./state/manager.js";
import { WebSocketManager } from "./network/websocket.js";
import { DiscoveryService, DiscoveredNode } from "./network/discovery.js";
import { FileWatcher } from "./watcher/file-watcher.js";
import { registerTools } from "./mcp/tools.js";
import { registerResources } from "./mcp/resources.js";
import { registerPrompts } from "./mcp/prompts.js";
import { isTrusted, addTrustedPeer } from "./state/trusted-peers.js";
import {
  createPairRequest,
  createSyncResponse,
} from "./network/protocol.js";
import {
  PairRequestPayload,
  PairResponsePayload,
  PlanUpdatePayload,
  MessagePayload,
  SyncRequestPayload,
  PeerPacket,
} from "./types.js";

function parseArgs(): { project: string; name: string; port: number; ignore: string[] } {
  const args = process.argv.slice(2);
  let project = process.cwd();
  let name = `node-${uuid().slice(0, 4)}`;
  let port = 9100;
  const ignore: string[] = [];

  for (let i = 0; i < args.length; i++) {
    switch (args[i]) {
      case "--project":
        project = args[++i];
        break;
      case "--name":
        name = args[++i];
        break;
      case "--port":
        port = parseInt(args[++i], 10);
        break;
      case "--ignore":
        ignore.push(args[++i]);
        break;
    }
  }

  return { project, name, port, ignore };
}

async function main() {
  const config = parseArgs();
  const nodeId = uuid();

  const state = new StateManager(nodeId, config.name);
  const wsManager = new WebSocketManager(config.port);
  const discovery = new DiscoveryService(nodeId, config.name, config.port);
  const fileWatcher = new FileWatcher(config.project, state, config.ignore);

  const mcpServer = new McpServer({
    name: "c2c",
    version: "0.1.0",
  });

  registerTools(mcpServer, state, wsManager);
  registerResources(mcpServer, state);
  registerPrompts(mcpServer, state);

  wsManager.on("packet", (packet: PeerPacket) => {
    handlePacket(packet, state, wsManager, nodeId);
  });

  wsManager.on("disconnected", (peerId: string) => {
    const peer = state.getPeer(peerId);
    if (peer) {
      state.updatePeerStatus(peerId, "offline");
      setTimeout(() => {
        const current = state.getPeer(peerId);
        if (current?.status === "offline") {
          state.removePeer(peerId);
        }
      }, 60_000);
    }
  });

  discovery.on("discovered", async (node: DiscoveredNode) => {
    if (state.getPeer(node.nodeId)) return;

    state.addPeer({
      nodeId: node.nodeId,
      nodeName: node.nodeName,
      status: "discovered",
      wsPort: node.wsPort,
      host: node.host,
      currentTask: "",
      lastSeen: Date.now(),
    });

    try {
      await wsManager.connectToPeer(node.nodeId, node.host, node.wsPort);
    } catch {
      return;
    }

    if (isTrusted(node.nodeId)) {
      state.updatePeerStatus(node.nodeId, "connected");
      addTrustedPeer(node.nodeId, node.nodeName);
    } else {
      state.updatePeerStatus(node.nodeId, "pair_pending");
      const packet = createPairRequest(nodeId, config.name);
      wsManager.send(node.nodeId, packet);
    }
  });

  discovery.on("lost", (lostNodeId: string) => {
    const peer = state.getPeer(lostNodeId);
    if (peer) {
      state.updatePeerStatus(lostNodeId, "offline");
    }
  });

  const cleanupInterval = setInterval(() => {
    state.cleanupFileChanges();
  }, 30_000);

  await wsManager.startServer();
  await fileWatcher.start();
  discovery.publish();
  discovery.browse();

  const transport = new StdioServerTransport();
  await mcpServer.connect(transport);

  const shutdown = async () => {
    clearInterval(cleanupInterval);
    discovery.stop();
    await fileWatcher.stop();
    wsManager.stop();
    process.exit(0);
  };

  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
}

function handlePacket(
  packet: PeerPacket,
  state: StateManager,
  wsManager: WebSocketManager,
  selfNodeId: string
): void {
  switch (packet.type) {
    case "pair_request": {
      const payload = packet.payload as PairRequestPayload;
      if (isTrusted(payload.nodeId)) {
        state.updatePeerStatus(payload.nodeId, "connected");
        addTrustedPeer(payload.nodeId, payload.nodeName);
        const response = createPairRequest(selfNodeId, state.getPlan().nodeName);
        wsManager.send(payload.nodeId, response);
      } else {
        state.addPeer({
          nodeId: payload.nodeId,
          nodeName: payload.nodeName,
          status: "pair_pending",
          wsPort: 0,
          host: "",
          currentTask: "",
          lastSeen: Date.now(),
        });
      }
      break;
    }

    case "pair_response": {
      const payload = packet.payload as PairResponsePayload;
      if (payload.accepted) {
        state.updatePeerStatus(packet.fromNode, "connected");
        addTrustedPeer(packet.fromNode, state.getPeer(packet.fromNode)?.nodeName || "unknown");
      } else {
        state.removePeer(packet.fromNode);
        wsManager.disconnect(packet.fromNode);
      }
      break;
    }

    case "plan_update": {
      const payload = packet.payload as PlanUpdatePayload;
      state.updatePeerTask(payload.nodeId, payload.currentTask);
      break;
    }

    case "message": {
      const payload = packet.payload as MessagePayload;
      state.addMessage({
        id: payload.id,
        from: payload.from,
        to: payload.to,
        content: payload.content,
        timestamp: Date.now(),
        status: "pending",
      });
      break;
    }

    case "sync_request": {
      const payload = packet.payload as SyncRequestPayload;
      const plan = state.getPlan();
      const changes = state.getFileChangesForPeer(payload.requesterId);
      state.markChangesFetchedBy(payload.requesterId);

      const serializedChanges = changes.map((c) => ({
        id: c.id,
        filePath: c.filePath,
        changeType: c.changeType,
        timestamp: c.timestamp,
        diffSummary: c.diffSummary,
      }));

      const response = createSyncResponse(selfNodeId, plan, serializedChanges);
      wsManager.send(packet.fromNode, response);
      break;
    }

    case "sync_response": {
      const payload = packet.payload as { plan: PlanUpdatePayload };
      if (payload.plan) {
        state.updatePeerTask(payload.plan.nodeId, payload.plan.currentTask);
      }
      break;
    }
  }
}

main().catch((err) => {
  console.error("c2c failed to start:", err);
  process.exit(1);
});
