# c2c: LAN-based Claude Code Collaboration via MCP

## Overview

An MCP Server plugin that enables multiple Claude Code instances on different physical machines to share intent, file changes, and async messages over a local network. One Node.js process per machine handles MCP communication (stdio), LAN discovery (mDNS), and peer-to-peer data exchange (WebSocket).

## Core Problem

When multiple developers use Claude Code simultaneously on the same project (e.g., frontend on Machine A, backend on Machine B), their Agents operate in isolation. Frontend Agent changes API call patterns without Backend Agent knowing, causing misalignment. c2c solves this by making each Agent's intent and recent changes visible to its peers.

## Architecture

Single-process design. One Node.js process serves three roles:

1. **MCP Server (stdio)** — interfaces with local Claude Code
2. **WebSocket Server** — accepts connections from peer nodes
3. **mDNS Broadcaster/Scanner** — discovers peers on LAN automatically

```
┌─────────────────────────────────────────┐
│              Machine A                  │
│                                         │
│  ┌─────────────┐    stdio    ┌────────────────────────────┐
│  │ Claude Code │◄──────────►│      c2c MCP Server        │
│  └─────────────┘             │                            │
│                              │  ┌──────────────────────┐  │
│                              │  │ MCP Layer (stdio)    │  │
│                              │  │  - Tools & Resources │  │
│                              │  ├──────────────────────┤  │
│                              │  │ State Manager        │  │
│                              │  │  - plan, messages,   │  │
│                              │  │    file changes      │  │
│                              │  ├──────────────────────┤  │
│                              │  │ Network Layer        │  │
│                              │  │  - mDNS discovery    │  │
│                              │  │  - WebSocket server  │  │
│                              │  │  - Peer connections  │  │
│                              │  ├──────────────────────┤  │
│                              │  │ File Watcher         │  │
│                              │  │  - chokidar          │  │
│                              │  └──────────────────────┘  │
│                              └────────────────────────────┘
│                                           │
└───────────────────────────────────────────┘
                                            │ WebSocket
                                            ▼
┌───────────────────────────────────────────┐
│              Machine B                    │
│         (identical c2c MCP Server)        │
└───────────────────────────────────────────┘
```

Process lifecycle is tied to the Claude Code session — starts when Claude Code launches, exits when it ends.

## State Model

### Plan State

```typescript
interface PlanState {
  nodeId: string;          // UUID, generated on first launch
  nodeName: string;        // human-readable name (e.g., "frontend-alice")
  currentTask: string;     // reported by Claude via set_plan tool
  updatedAt: number;
}
```

### File Changes

```typescript
interface FileChange {
  id: string;
  filePath: string;        // relative to project root
  changeType: 'add' | 'modify' | 'delete';
  timestamp: number;
  diffSummary: string;     // output of git diff, or first 200 lines for untracked files
  fetchedBy: Set<string>;  // nodeIds of peers that have consumed this record
}
```

Cleanup policy: a FileChange is removed when all connected peers have fetched it (`fetchedBy.size >= connectedPeers.length`), or after 30 minutes as a safety cap. Cleanup scan runs every 30 seconds.

### Message Queue

```typescript
interface PeerMessage {
  id: string;
  from: string;            // sender nodeId
  to: string;              // receiver nodeId
  content: string;
  timestamp: number;
  status: 'pending' | 'read';
}
```

Each node maintains an inbox. `ask_peer` pushes messages to the target node's inbox via WebSocket. The receiver reads them via `check_messages`.

### Data Sync Model

Pull-based, not continuous sync:
- `sync_with_peer()` requests the target's current PlanState + recent FileChanges via WebSocket
- Messages are pushed to the receiver's inbox but read on-demand
- No conflict resolution needed — each node owns its own state

## MCP Interface

### Tools

| Tool | Parameters | Description |
|------|-----------|-------------|
| `set_plan` | `task: string` | Report current intent/task, broadcast to all connected peers |
| `ask_peer` | `peerId: string, message: string` | Send async message to a specific peer's inbox |
| `check_messages` | (none) | Read all unread inbox messages, mark as read |
| `sync_with_peer` | `peerId?: string` | Pull current plan + recent file changes from specified peer (or all peers) |
| `list_peers` | (none) | List all paired/connected peer nodes |
| `approve_peer` | `peerId: string` | Accept a first-time pairing request |
| `reject_peer` | `peerId: string` | Reject a pairing request |

### Resources

| URI | Description |
|-----|-------------|
| `c2c://peers` | All connected peers with status and unread message count |
| `c2c://peers/{peerId}/plan` | Specified peer's current plan |
| `c2c://peers/{peerId}/changes` | Specified peer's recent file changes |
| `c2c://inbox` | Current node's unread messages |

### Prompts

| Name | Condition | Content |
|------|-----------|---------|
| `c2c-collaboration` | Peers online | Guides Claude to check_messages at start, set_plan before work, sync_with_peer before API changes |

## Network Discovery & Pairing

### mDNS

Broadcast via `bonjour-service` (pure JS, no native dependencies):
- Service type: `_c2c._tcp.local`
- TXT record: `nodeId`, `nodeName`, `wsPort`

### Pairing Flow

```
Machine A                          Machine B
    │                                   │
    │◄──── mDNS discovers B ───────────│
    │                                   │
    │── WebSocket connect to B ───────►│
    │── pair_request {nodeId, name} ──►│
    │                                   │
    │   B receives approve_peer prompt  │
    │   User/Claude confirms            │
    │                                   │
    │◄── pair_response {accepted} ─────│
    │                                   │
    │   Bidirectional connection ready   │
    │◄═══════════ PAIRED ══════════════►│
```

### Trusted Peers

After first-time pairing, the peer's `nodeId` is persisted to `~/.c2c/trusted_peers.json`. Subsequent discoveries of the same `nodeId` auto-connect without confirmation.

### Reconnection

Disconnected peers are retained for 60 seconds. If mDNS rediscovers them within that window, auto-reconnect (skip confirmation if trusted). After 60 seconds, mark as offline and remove from `c2c://peers`.

## File Watching

### Mechanism

`chokidar` watches the project working directory for `add`, `change`, `unlink` events.

### Ignore Patterns

Default ignores: `node_modules/`, `.git/`, `dist/`, `build/`, `*.lock`, `*.map`. Custom patterns via `--ignore` startup flag.

### Diff Generation

On file change, run `git diff -- <filePath>`. For untracked files, read first 200 lines. Result stored as `diffSummary` in the FileChange record.

### Project Root Detection

Received via startup argument `--project`. Fallback: walk up the directory tree looking for `.git`.

## Companion Skill: c2c-protocol

A Claude Code skill that guides Claude's behavior when peers are connected.

### Behavior Rules

1. **Start of each conversation turn**: call `check_messages` for unread peer messages
2. **Before starting a new task**: call `set_plan` to broadcast current intent
3. **Before API-related changes** (interface definitions, routes, request/response structures): call `sync_with_peer` to check peer's latest state
4. **When receiving peer messages**: incorporate message content into current context; reply via `ask_peer` if needed

### What the Skill Does NOT Do

- Does not make decisions for the user — only ensures information flows
- Does not modify peer's code
- Does not block the current workflow

## WebSocket Protocol

Peer-to-peer messages are JSON over WebSocket:

```typescript
interface PeerPacket {
  type: 'pair_request' | 'pair_response' | 'plan_update'
      | 'message' | 'sync_request' | 'sync_response';
  fromNode: string;
  payload: any;
  timestamp: number;
}
```

- `pair_request` / `pair_response`: pairing handshake
- `plan_update`: broadcast after `set_plan`
- `message`: deliver `ask_peer` message to peer's inbox
- `sync_request` / `sync_response`: pull peer's state snapshot

## Project Structure

```
c2c/
├── src/
│   ├── index.ts              # entry point: start MCP Server + network
│   ├── mcp/
│   │   ├── tools.ts          # tool definitions and handlers
│   │   ├── resources.ts      # resource definitions and handlers
│   │   └── prompts.ts        # prompt templates
│   ├── state/
│   │   └── manager.ts        # State Manager (plan, changes, inbox)
│   ├── network/
│   │   ├── discovery.ts      # mDNS broadcast and scanning
│   │   ├── websocket.ts      # WebSocket server/client management
│   │   └── protocol.ts       # PeerPacket encoding and message routing
│   ├── watcher/
│   │   └── file-watcher.ts   # chokidar file watching + diff generation
│   └── types.ts              # shared type definitions
├── skill/
│   └── c2c-protocol.md       # Claude Code skill file
├── package.json
├── tsconfig.json
└── README.md
```

## Dependencies

| Package | Purpose |
|---------|---------|
| `@modelcontextprotocol/sdk` | MCP Server SDK |
| `bonjour-service` | mDNS discovery (pure JS, cross-platform) |
| `ws` | WebSocket implementation |
| `chokidar` | File watching |
| `uuid` | Node ID and message ID generation |

Package manager: **pnpm**

## Installation & Setup

```bash
pnpm install
pnpm run build
claude mcp add c2c -- node dist/index.js --project /path/to/project
```
