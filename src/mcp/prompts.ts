import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StateManager } from "../state/manager.js";

export function registerPrompts(server: McpServer, state: StateManager): void {
  server.prompt(
    "c2c-collaboration",
    "Collaboration guidance when peers are connected",
    async () => {
      const peers = state.getConnectedPeers();
      const unread = state.getUnreadCount();

      if (peers.length === 0) {
        return {
          messages: [
            {
              role: "user" as const,
              content: {
                type: "text" as const,
                text: "No c2c peers are currently connected.",
              },
            },
          ],
        };
      }

      const peerList = peers
        .map((p) => `- ${p.nodeName} (${p.nodeId.slice(0, 8)}...): ${p.currentTask || "idle"}`)
        .join("\n");

      const instructions = [
        "## c2c Collaboration Active",
        "",
        `You are connected to ${peers.length} peer(s):`,
        peerList,
        "",
        unread > 0 ? `⚠ You have ${unread} unread message(s). Call \`check_messages\` now.` : "",
        "",
        "### Protocol",
        "1. At the start of each task, call `check_messages` to read peer messages.",
        "2. Before starting work, call `set_plan` to announce your intent.",
        "3. Before modifying API interfaces, routes, or request/response structures, call `sync_with_peer` to check the latest peer state.",
        "4. If you receive a question from a peer, consider it in your current context and reply via `ask_peer` if needed.",
      ].filter(Boolean).join("\n");

      return {
        messages: [
          {
            role: "user" as const,
            content: {
              type: "text" as const,
              text: instructions,
            },
          },
        ],
      };
    }
  );
}
