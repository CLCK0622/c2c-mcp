import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { v4 as uuid } from "uuid";
import { StateManager } from "../state/manager.js";
import { WebSocketManager } from "../network/websocket.js";
import {
  createPlanUpdate,
  createMessage,
  createSyncRequest,
  createPairResponse,
} from "../network/protocol.js";
import { addTrustedPeer, removeTrustedPeer, loadTrustedPeers } from "../state/trusted-peers.js";

export function registerTools(
  server: McpServer,
  state: StateManager,
  wsManager: WebSocketManager
): void {
  server.tool(
    "set_plan",
    "Report your current task/intent to all connected peers",
    { task: z.string().describe("What you are currently working on") },
    async ({ task }) => {
      const plan = state.setPlan(task);
      const packet = createPlanUpdate(plan.nodeId, plan.nodeName, task);
      wsManager.broadcast(packet);
      return {
        content: [
          {
            type: "text" as const,
            text: `Plan updated: "${task}". Broadcasted to ${state.getConnectedPeers().length} peer(s).`,
          },
        ],
      };
    }
  );

  server.tool(
    "ask_peer",
    "Send an async message to a specific peer",
    {
      peerId: z.string().describe("The nodeId of the peer to message"),
      message: z.string().describe("The message content"),
    },
    async ({ peerId, message }) => {
      const peer = state.getPeer(peerId);
      if (!peer || peer.status !== "connected") {
        return {
          content: [{ type: "text" as const, text: `Peer ${peerId} is not connected.` }],
          isError: true,
        };
      }

      const plan = state.getPlan();
      const msgId = uuid();
      const packet = createMessage(plan.nodeId, msgId, plan.nodeId, peerId, message);
      const sent = wsManager.send(peerId, packet);

      return {
        content: [
          {
            type: "text" as const,
            text: sent
              ? `Message sent to ${peer.nodeName} (${peerId}).`
              : `Failed to send message to ${peer.nodeName}.`,
          },
        ],
        isError: !sent,
      };
    }
  );

  server.tool(
    "check_messages",
    "Read all unread messages from peers",
    {},
    async () => {
      const messages = state.readAllMessages();
      if (messages.length === 0) {
        return {
          content: [{ type: "text" as const, text: "No unread messages." }],
        };
      }

      const formatted = messages
        .map(
          (m) =>
            `[${new Date(m.timestamp).toLocaleTimeString()}] From ${m.from}: ${m.content}`
        )
        .join("\n\n");

      return {
        content: [{ type: "text" as const, text: formatted }],
      };
    }
  );

  server.tool(
    "sync_with_peer",
    "Pull current plan and recent file changes from a peer",
    {
      peerId: z
        .string()
        .optional()
        .describe("Specific peer nodeId, or omit for all peers"),
    },
    async ({ peerId }) => {
      const plan = state.getPlan();
      const targets = peerId
        ? [state.getPeer(peerId)].filter(Boolean)
        : state.getConnectedPeers();

      if (targets.length === 0) {
        return {
          content: [{ type: "text" as const, text: "No connected peers to sync with." }],
        };
      }

      for (const peer of targets) {
        if (!peer) continue;
        const packet = createSyncRequest(plan.nodeId);
        wsManager.send(peer.nodeId, packet);
      }

      return {
        content: [
          {
            type: "text" as const,
            text: `Sync requested from ${targets.length} peer(s). Results will appear in resources.`,
          },
        ],
      };
    }
  );

  server.tool(
    "list_peers",
    "List all known peer nodes and their status",
    {},
    async () => {
      const peers = state.getPeers();
      if (peers.length === 0) {
        return {
          content: [{ type: "text" as const, text: "No peers discovered." }],
        };
      }

      const lines = peers.map(
        (p) =>
          `- ${p.nodeName} [${p.nodeId}]: ${p.status}${p.currentTask ? ` | Task: ${p.currentTask}` : ""}`
      );

      const hasPending = peers.some((p) => p.status === "pair_pending");
      const output = lines.join("\n") +
        (hasPending
          ? "\n\n⚠️ SECURITY WARNING: You have pending pairing requests. Before approving, confirm with the user that they recognize and trust the requesting device. Approving a peer allows the remote Claude instance to read your current plan, file changes, and exchange messages with you. Do NOT approve unknown or untrusted devices."
          : "");

      return {
        content: [{ type: "text" as const, text: output }],
      };
    }
  );

  server.tool(
    "approve_peer",
    "Accept a pairing request from a discovered peer. IMPORTANT: Before calling this tool, you MUST warn the user about the security implications and get explicit confirmation.",
    { peerId: z.string().describe("The nodeId of the peer to approve") },
    async ({ peerId }) => {
      const peer = state.getPeer(peerId);
      if (!peer) {
        return {
          content: [{ type: "text" as const, text: `Unknown peer: ${peerId}` }],
          isError: true,
        };
      }

      if (peer.status !== "pair_pending") {
        return {
          content: [{ type: "text" as const, text: `Peer ${peer.nodeName} is not in pair_pending state (current: ${peer.status}).` }],
          isError: true,
        };
      }

      state.updatePeerStatus(peerId, "connected");
      addTrustedPeer(peerId, peer.nodeName);

      const plan = state.getPlan();
      const packet = createPairResponse(plan.nodeId, true);
      wsManager.send(peerId, packet);

      return {
        content: [
          {
            type: "text" as const,
            text: `✅ Peer "${peer.nodeName}" [${peerId}] approved and trusted.\n\nThis peer can now:\n- Read your current plan and task intent\n- See your recent file changes\n- Send you messages\n\nFuture connections from this peer will auto-accept. Use \`untrust_peer\` to revoke trust.`,
          },
        ],
      };
    }
  );

  server.tool(
    "reject_peer",
    "Reject a pairing request from a discovered peer",
    { peerId: z.string().describe("The nodeId of the peer to reject") },
    async ({ peerId }) => {
      const peer = state.getPeer(peerId);
      if (!peer) {
        return {
          content: [{ type: "text" as const, text: `Unknown peer: ${peerId}` }],
          isError: true,
        };
      }

      const plan = state.getPlan();
      const packet = createPairResponse(plan.nodeId, false);
      wsManager.send(peerId, packet);
      state.removePeer(peerId);
      wsManager.disconnect(peerId);

      return {
        content: [
          {
            type: "text" as const,
            text: `Peer ${peer.nodeName} rejected and removed.`,
          },
        ],
      };
    }
  );

  server.tool(
    "untrust_peer",
    "Revoke trust from a previously approved peer. They will need re-approval on next connection.",
    { peerId: z.string().describe("The nodeId of the peer to untrust") },
    async ({ peerId }) => {
      const trusted = loadTrustedPeers();
      const found = trusted.find((p) => p.nodeId === peerId);

      if (!found) {
        return {
          content: [{ type: "text" as const, text: `Peer ${peerId} is not in the trusted list.` }],
          isError: true,
        };
      }

      removeTrustedPeer(peerId);

      const connectedPeer = state.getPeer(peerId);
      if (connectedPeer) {
        state.removePeer(peerId);
        wsManager.disconnect(peerId);
      }

      return {
        content: [
          {
            type: "text" as const,
            text: `Trust revoked for "${found.nodeName}" [${peerId}]. Connection closed. They will need re-approval to connect again.`,
          },
        ],
      };
    }
  );

  server.tool(
    "list_trusted",
    "List all trusted peers that will auto-connect without approval",
    {},
    async () => {
      const trusted = loadTrustedPeers();
      if (trusted.length === 0) {
        return {
          content: [{ type: "text" as const, text: "No trusted peers. All new connections will require approval." }],
        };
      }

      const lines = trusted.map(
        (p) =>
          `- ${p.nodeName} [${p.nodeId}] (trusted since ${new Date(p.trustedAt).toLocaleDateString()})`
      );

      return {
        content: [
          {
            type: "text" as const,
            text: `Trusted peers (auto-connect without approval):\n${lines.join("\n")}\n\nUse \`untrust_peer\` to revoke trust from any peer.`,
          },
        ],
      };
    }
  );
}
