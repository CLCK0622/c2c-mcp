import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StateManager } from "../state/manager.js";

export function registerResources(server: McpServer, state: StateManager): void {
  server.resource(
    "peers",
    "c2c://peers",
    { description: "List of all connected peers with status and unread message count" },
    async () => {
      const peers = state.getPeers();
      const unreadCount = state.getUnreadCount();

      const data = {
        peers: peers.map((p) => ({
          nodeId: p.nodeId,
          nodeName: p.nodeName,
          status: p.status,
          currentTask: p.currentTask,
          lastSeen: p.lastSeen,
        })),
        unreadMessages: unreadCount,
      };

      return {
        contents: [
          {
            uri: "c2c://peers",
            mimeType: "application/json",
            text: JSON.stringify(data, null, 2),
          },
        ],
      };
    }
  );

  server.resource(
    "inbox",
    "c2c://inbox",
    { description: "Unread messages from peers" },
    async () => {
      const messages = state.getUnreadMessages();

      return {
        contents: [
          {
            uri: "c2c://inbox",
            mimeType: "application/json",
            text: JSON.stringify(messages, null, 2),
          },
        ],
      };
    }
  );
}
