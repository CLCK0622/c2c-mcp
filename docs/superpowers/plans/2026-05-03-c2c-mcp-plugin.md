# c2c MCP Plugin Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build an MCP Server that enables multiple Claude Code instances on a LAN to share intent, file changes, and async messages via mDNS discovery and WebSocket.

**Architecture:** Single Node.js process serving as MCP Server (stdio), WebSocket server (peer-to-peer), and mDNS broadcaster/scanner. Internal modules: State Manager (in-memory state), Network Layer (discovery + WebSocket), File Watcher (chokidar + git diff), MCP Layer (tools, resources, prompts).

**Tech Stack:** TypeScript, Node.js, pnpm, `@modelcontextprotocol/sdk`, `bonjour-service`, `ws`, `chokidar`, `uuid`, `vitest` for testing.

---

## File Structure

```
c2c/
├── src/
│   ├── index.ts              — entry point: parse args, wire modules, start server
│   ├── types.ts              — all shared interfaces and type definitions
│   ├── mcp/
│   │   ├── tools.ts          — register MCP tools on the server instance
│   │   ├── resources.ts      — register MCP resources on the server instance
│   │   └── prompts.ts        — register MCP prompts on the server instance
│   ├── state/
│   │   └── manager.ts        — StateManager class: plan, inbox, file changes, peers
│   ├── network/
│   │   ├── discovery.ts      — DiscoveryService: mDNS publish/browse via bonjour-service
│   │   ├── websocket.ts      — WebSocketManager: server + client connections, send/receive
│   │   └── protocol.ts       — createPacket(), parsePacket(), type-safe packet factory
│   └── watcher/
│       └── file-watcher.ts   — FileWatcher: chokidar + git diff summary generation
├── skill/
│   └── c2c-protocol.md       — Claude Code skill for collaboration behavior
├── tests/
│   ├── state/
│   │   └── manager.test.ts
│   ├── network/
│   │   └── protocol.test.ts
│   └── watcher/
│       └── file-watcher.test.ts
├── package.json
├── tsconfig.json
└── vitest.config.ts
```

---

### Task 1: Project Scaffolding

**Files:**
- Create: `package.json`
- Create: `tsconfig.json`
- Create: `vitest.config.ts`
- Create: `src/types.ts`

- [ ] **Step 1: Initialize pnpm project**

```bash
cd /Users/clck/Desktop/Workspace/c2c
pnpm init
```

- [ ] **Step 2: Install dependencies**

```bash
pnpm add @modelcontextprotocol/sdk bonjour-service ws chokidar uuid
pnpm add -D typescript @types/node @types/ws @types/uuid vitest tsx
```

- [ ] **Step 3: Create tsconfig.json**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "Node16",
    "moduleResolution": "Node16",
    "outDir": "dist",
    "rootDir": "src",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "declaration": true,
    "sourceMap": true
  },
  "include": ["src"],
  "exclude": ["node_modules", "dist", "tests"]
}
```

- [ ] **Step 4: Create vitest.config.ts**

```typescript
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    globals: true,
    environment: "node",
  },
});
```

- [ ] **Step 5: Add scripts to package.json**

Add to `package.json`:

```json
{
  "type": "module",
  "scripts": {
    "build": "tsc",
    "dev": "tsx src/index.ts",
    "test": "vitest run",
    "test:watch": "vitest"
  }
}
```

- [ ] **Step 6: Create src/types.ts with all shared types**

```typescript
export interface PlanState {
  nodeId: string;
  nodeName: string;
  currentTask: string;
  updatedAt: number;
}

export interface FileChange {
  id: string;
  filePath: string;
  changeType: "add" | "modify" | "delete";
  timestamp: number;
  diffSummary: string;
  fetchedBy: Set<string>;
}

export interface PeerMessage {
  id: string;
  from: string;
  to: string;
  content: string;
  timestamp: number;
  status: "pending" | "read";
}

export type PeerStatus = "discovered" | "pair_pending" | "connected" | "offline";

export interface PeerInfo {
  nodeId: string;
  nodeName: string;
  status: PeerStatus;
  wsPort: number;
  host: string;
  currentTask: string;
  lastSeen: number;
}

export type PeerPacketType =
  | "pair_request"
  | "pair_response"
  | "plan_update"
  | "message"
  | "sync_request"
  | "sync_response";

export interface PeerPacket {
  type: PeerPacketType;
  fromNode: string;
  payload: unknown;
  timestamp: number;
}

export interface PairRequestPayload {
  nodeId: string;
  nodeName: string;
}

export interface PairResponsePayload {
  accepted: boolean;
}

export interface PlanUpdatePayload {
  nodeId: string;
  nodeName: string;
  currentTask: string;
}

export interface MessagePayload {
  id: string;
  from: string;
  to: string;
  content: string;
}

export interface SyncRequestPayload {
  requesterId: string;
}

export interface SyncResponsePayload {
  plan: PlanState;
  changes: Array<{
    id: string;
    filePath: string;
    changeType: "add" | "modify" | "delete";
    timestamp: number;
    diffSummary: string;
  }>;
}
```

- [ ] **Step 7: Verify TypeScript compiles**

Run: `pnpm build`
Expected: Compiles with no errors (empty output since no index.ts yet, but types.ts should compile)

Note: Build will warn about no input files since index.ts doesn't exist yet. That's expected. The important thing is types.ts compiles without type errors. Verify with: `npx tsc --noEmit src/types.ts`

- [ ] **Step 8: Commit**

```bash
git init
echo "node_modules/\ndist/\n*.map" > .gitignore
git add .
git commit -m "chore: scaffold project with types, deps, and build config"
```

---

### Task 2: State Manager — Plan & Peers

**Files:**
- Create: `src/state/manager.ts`
- Create: `tests/state/manager.test.ts`

- [ ] **Step 1: Write failing tests for plan and peer state**

Create `tests/state/manager.test.ts`:

```typescript
import { describe, it, expect, beforeEach } from "vitest";
import { StateManager } from "../src/state/manager.js";

describe("StateManager — Plan", () => {
  let state: StateManager;

  beforeEach(() => {
    state = new StateManager("node-1", "alice");
  });

  it("returns initial plan state", () => {
    const plan = state.getPlan();
    expect(plan.nodeId).toBe("node-1");
    expect(plan.nodeName).toBe("alice");
    expect(plan.currentTask).toBe("");
  });

  it("updates current task", () => {
    state.setPlan("implementing login API");
    const plan = state.getPlan();
    expect(plan.currentTask).toBe("implementing login API");
    expect(plan.updatedAt).toBeGreaterThan(0);
  });
});

describe("StateManager — Peers", () => {
  let state: StateManager;

  beforeEach(() => {
    state = new StateManager("node-1", "alice");
  });

  it("adds a discovered peer", () => {
    state.addPeer({
      nodeId: "node-2",
      nodeName: "bob",
      status: "discovered",
      wsPort: 9100,
      host: "192.168.1.10",
      currentTask: "",
      lastSeen: Date.now(),
    });
    const peers = state.getPeers();
    expect(peers).toHaveLength(1);
    expect(peers[0].nodeId).toBe("node-2");
  });

  it("updates peer status", () => {
    state.addPeer({
      nodeId: "node-2",
      nodeName: "bob",
      status: "discovered",
      wsPort: 9100,
      host: "192.168.1.10",
      currentTask: "",
      lastSeen: Date.now(),
    });
    state.updatePeerStatus("node-2", "connected");
    const peer = state.getPeer("node-2");
    expect(peer?.status).toBe("connected");
  });

  it("removes peer", () => {
    state.addPeer({
      nodeId: "node-2",
      nodeName: "bob",
      status: "discovered",
      wsPort: 9100,
      host: "192.168.1.10",
      currentTask: "",
      lastSeen: Date.now(),
    });
    state.removePeer("node-2");
    expect(state.getPeers()).toHaveLength(0);
  });

  it("gets connected peers only", () => {
    state.addPeer({
      nodeId: "node-2",
      nodeName: "bob",
      status: "connected",
      wsPort: 9100,
      host: "192.168.1.10",
      currentTask: "",
      lastSeen: Date.now(),
    });
    state.addPeer({
      nodeId: "node-3",
      nodeName: "carol",
      status: "discovered",
      wsPort: 9101,
      host: "192.168.1.11",
      currentTask: "",
      lastSeen: Date.now(),
    });
    const connected = state.getConnectedPeers();
    expect(connected).toHaveLength(1);
    expect(connected[0].nodeId).toBe("node-2");
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm test`
Expected: FAIL — cannot resolve `../src/state/manager.js`

- [ ] **Step 3: Implement StateManager — plan and peers**

Create `src/state/manager.ts`:

```typescript
import { PlanState, PeerInfo, PeerStatus, FileChange, PeerMessage } from "../types.js";

export class StateManager {
  private plan: PlanState;
  private peers: Map<string, PeerInfo> = new Map();
  private fileChanges: FileChange[] = [];
  private inbox: PeerMessage[] = [];

  constructor(nodeId: string, nodeName: string) {
    this.plan = {
      nodeId,
      nodeName,
      currentTask: "",
      updatedAt: Date.now(),
    };
  }

  getPlan(): PlanState {
    return { ...this.plan };
  }

  setPlan(task: string): PlanState {
    this.plan.currentTask = task;
    this.plan.updatedAt = Date.now();
    return this.getPlan();
  }

  addPeer(peer: PeerInfo): void {
    this.peers.set(peer.nodeId, peer);
  }

  getPeer(nodeId: string): PeerInfo | undefined {
    const peer = this.peers.get(nodeId);
    return peer ? { ...peer } : undefined;
  }

  getPeers(): PeerInfo[] {
    return Array.from(this.peers.values()).map((p) => ({ ...p }));
  }

  getConnectedPeers(): PeerInfo[] {
    return this.getPeers().filter((p) => p.status === "connected");
  }

  updatePeerStatus(nodeId: string, status: PeerStatus): void {
    const peer = this.peers.get(nodeId);
    if (peer) {
      peer.status = status;
      peer.lastSeen = Date.now();
    }
  }

  updatePeerTask(nodeId: string, task: string): void {
    const peer = this.peers.get(nodeId);
    if (peer) {
      peer.currentTask = task;
      peer.lastSeen = Date.now();
    }
  }

  removePeer(nodeId: string): void {
    this.peers.delete(nodeId);
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm test`
Expected: All 5 tests PASS

- [ ] **Step 5: Commit**

```bash
git add src/state/manager.ts tests/state/manager.test.ts
git commit -m "feat: StateManager with plan and peer state management"
```

---

### Task 3: State Manager — File Changes

**Files:**
- Modify: `src/state/manager.ts`
- Modify: `tests/state/manager.test.ts`

- [ ] **Step 1: Write failing tests for file change tracking**

Append to `tests/state/manager.test.ts`:

```typescript
describe("StateManager — File Changes", () => {
  let state: StateManager;

  beforeEach(() => {
    state = new StateManager("node-1", "alice");
  });

  it("adds a file change", () => {
    state.addFileChange({
      id: "fc-1",
      filePath: "src/app.ts",
      changeType: "modify",
      timestamp: Date.now(),
      diffSummary: "+console.log('hello')",
      fetchedBy: new Set(),
    });
    const changes = state.getFileChanges();
    expect(changes).toHaveLength(1);
    expect(changes[0].filePath).toBe("src/app.ts");
  });

  it("returns unfetched changes for a peer", () => {
    state.addFileChange({
      id: "fc-1",
      filePath: "src/app.ts",
      changeType: "modify",
      timestamp: Date.now(),
      diffSummary: "diff1",
      fetchedBy: new Set(),
    });
    state.addFileChange({
      id: "fc-2",
      filePath: "src/index.ts",
      changeType: "modify",
      timestamp: Date.now(),
      diffSummary: "diff2",
      fetchedBy: new Set(["node-2"]),
    });
    const changes = state.getFileChangesForPeer("node-2");
    expect(changes).toHaveLength(1);
    expect(changes[0].id).toBe("fc-1");
  });

  it("marks changes as fetched by a peer", () => {
    state.addFileChange({
      id: "fc-1",
      filePath: "src/app.ts",
      changeType: "modify",
      timestamp: Date.now(),
      diffSummary: "diff",
      fetchedBy: new Set(),
    });
    state.markChangesFetchedBy("node-2");
    const changes = state.getFileChangesForPeer("node-2");
    expect(changes).toHaveLength(0);
  });

  it("cleans up changes fetched by all connected peers", () => {
    state.addPeer({
      nodeId: "node-2",
      nodeName: "bob",
      status: "connected",
      wsPort: 9100,
      host: "192.168.1.10",
      currentTask: "",
      lastSeen: Date.now(),
    });
    state.addPeer({
      nodeId: "node-3",
      nodeName: "carol",
      status: "connected",
      wsPort: 9101,
      host: "192.168.1.11",
      currentTask: "",
      lastSeen: Date.now(),
    });
    state.addFileChange({
      id: "fc-1",
      filePath: "src/app.ts",
      changeType: "modify",
      timestamp: Date.now(),
      diffSummary: "diff",
      fetchedBy: new Set(["node-2", "node-3"]),
    });
    state.cleanupFileChanges();
    expect(state.getFileChanges()).toHaveLength(0);
  });

  it("cleans up changes older than 30 minutes", () => {
    const thirtyOneMinutesAgo = Date.now() - 31 * 60 * 1000;
    state.addFileChange({
      id: "fc-old",
      filePath: "src/old.ts",
      changeType: "modify",
      timestamp: thirtyOneMinutesAgo,
      diffSummary: "old diff",
      fetchedBy: new Set(),
    });
    state.cleanupFileChanges();
    expect(state.getFileChanges()).toHaveLength(0);
  });

  it("keeps changes not yet fetched by all peers", () => {
    state.addPeer({
      nodeId: "node-2",
      nodeName: "bob",
      status: "connected",
      wsPort: 9100,
      host: "192.168.1.10",
      currentTask: "",
      lastSeen: Date.now(),
    });
    state.addFileChange({
      id: "fc-1",
      filePath: "src/app.ts",
      changeType: "modify",
      timestamp: Date.now(),
      diffSummary: "diff",
      fetchedBy: new Set(),
    });
    state.cleanupFileChanges();
    expect(state.getFileChanges()).toHaveLength(1);
  });
});
```

- [ ] **Step 2: Run tests to verify new tests fail**

Run: `pnpm test`
Expected: New tests FAIL — `addFileChange`, `getFileChanges`, etc. not defined

- [ ] **Step 3: Implement file change methods on StateManager**

Add to `src/state/manager.ts` inside the `StateManager` class:

```typescript
  addFileChange(change: FileChange): void {
    this.fileChanges.push(change);
  }

  getFileChanges(): FileChange[] {
    return this.fileChanges.map((c) => ({
      ...c,
      fetchedBy: new Set(c.fetchedBy),
    }));
  }

  getFileChangesForPeer(peerId: string): FileChange[] {
    return this.fileChanges
      .filter((c) => !c.fetchedBy.has(peerId))
      .map((c) => ({
        ...c,
        fetchedBy: new Set(c.fetchedBy),
      }));
  }

  markChangesFetchedBy(peerId: string): void {
    for (const change of this.fileChanges) {
      change.fetchedBy.add(peerId);
    }
  }

  cleanupFileChanges(): void {
    const now = Date.now();
    const maxAge = 30 * 60 * 1000;
    const connectedCount = this.getConnectedPeers().length;

    this.fileChanges = this.fileChanges.filter((c) => {
      if (now - c.timestamp > maxAge) return false;
      if (connectedCount > 0 && c.fetchedBy.size >= connectedCount) return false;
      return true;
    });
  }
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm test`
Expected: All tests PASS

- [ ] **Step 5: Commit**

```bash
git add src/state/manager.ts tests/state/manager.test.ts
git commit -m "feat: file change tracking with consumption-based cleanup"
```

---

### Task 4: State Manager — Message Queue

**Files:**
- Modify: `src/state/manager.ts`
- Modify: `tests/state/manager.test.ts`

- [ ] **Step 1: Write failing tests for message queue**

Append to `tests/state/manager.test.ts`:

```typescript
describe("StateManager — Inbox", () => {
  let state: StateManager;

  beforeEach(() => {
    state = new StateManager("node-1", "alice");
  });

  it("adds a message to inbox", () => {
    state.addMessage({
      id: "msg-1",
      from: "node-2",
      to: "node-1",
      content: "Are you changing the /users endpoint?",
      timestamp: Date.now(),
      status: "pending",
    });
    const msgs = state.getUnreadMessages();
    expect(msgs).toHaveLength(1);
    expect(msgs[0].content).toBe("Are you changing the /users endpoint?");
  });

  it("marks messages as read", () => {
    state.addMessage({
      id: "msg-1",
      from: "node-2",
      to: "node-1",
      content: "hello",
      timestamp: Date.now(),
      status: "pending",
    });
    const read = state.readAllMessages();
    expect(read).toHaveLength(1);
    expect(read[0].status).toBe("read");

    const unread = state.getUnreadMessages();
    expect(unread).toHaveLength(0);
  });

  it("returns unread count", () => {
    state.addMessage({
      id: "msg-1",
      from: "node-2",
      to: "node-1",
      content: "hello",
      timestamp: Date.now(),
      status: "pending",
    });
    state.addMessage({
      id: "msg-2",
      from: "node-2",
      to: "node-1",
      content: "world",
      timestamp: Date.now(),
      status: "pending",
    });
    expect(state.getUnreadCount()).toBe(2);
    state.readAllMessages();
    expect(state.getUnreadCount()).toBe(0);
  });
});
```

- [ ] **Step 2: Run tests to verify new tests fail**

Run: `pnpm test`
Expected: FAIL — `addMessage`, `getUnreadMessages`, etc. not defined

- [ ] **Step 3: Implement inbox methods on StateManager**

Add to `src/state/manager.ts` inside the `StateManager` class:

```typescript
  addMessage(message: PeerMessage): void {
    this.inbox.push(message);
  }

  getUnreadMessages(): PeerMessage[] {
    return this.inbox
      .filter((m) => m.status === "pending")
      .map((m) => ({ ...m }));
  }

  getUnreadCount(): number {
    return this.inbox.filter((m) => m.status === "pending").length;
  }

  readAllMessages(): PeerMessage[] {
    const unread = this.inbox.filter((m) => m.status === "pending");
    for (const msg of unread) {
      msg.status = "read";
    }
    return unread.map((m) => ({ ...m }));
  }
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm test`
Expected: All tests PASS

- [ ] **Step 5: Commit**

```bash
git add src/state/manager.ts tests/state/manager.test.ts
git commit -m "feat: inbox message queue with unread tracking"
```

---

### Task 5: Protocol Layer

**Files:**
- Create: `src/network/protocol.ts`
- Create: `tests/network/protocol.test.ts`

- [ ] **Step 1: Write failing tests for packet creation and parsing**

Create `tests/network/protocol.test.ts`:

```typescript
import { describe, it, expect } from "vitest";
import {
  createPacket,
  parsePacket,
  createPairRequest,
  createPairResponse,
  createPlanUpdate,
  createMessage,
  createSyncRequest,
  createSyncResponse,
} from "../src/network/protocol.js";

describe("Protocol", () => {
  it("creates a valid packet", () => {
    const packet = createPacket("plan_update", "node-1", { task: "coding" });
    expect(packet.type).toBe("plan_update");
    expect(packet.fromNode).toBe("node-1");
    expect(packet.payload).toEqual({ task: "coding" });
    expect(packet.timestamp).toBeGreaterThan(0);
  });

  it("serializes and parses a packet roundtrip", () => {
    const packet = createPacket("message", "node-1", { text: "hello" });
    const json = JSON.stringify(packet);
    const parsed = parsePacket(json);
    expect(parsed).toEqual(packet);
  });

  it("returns null for invalid JSON", () => {
    expect(parsePacket("not json")).toBeNull();
  });

  it("returns null for packet missing required fields", () => {
    expect(parsePacket(JSON.stringify({ type: "message" }))).toBeNull();
  });

  it("creates pair request", () => {
    const packet = createPairRequest("node-1", "alice");
    expect(packet.type).toBe("pair_request");
    expect(packet.payload).toEqual({ nodeId: "node-1", nodeName: "alice" });
  });

  it("creates pair response", () => {
    const packet = createPairResponse("node-2", true);
    expect(packet.type).toBe("pair_response");
    expect(packet.payload).toEqual({ accepted: true });
  });

  it("creates plan update", () => {
    const packet = createPlanUpdate("node-1", "alice", "building login");
    expect(packet.type).toBe("plan_update");
    expect(packet.payload).toEqual({
      nodeId: "node-1",
      nodeName: "alice",
      currentTask: "building login",
    });
  });

  it("creates message packet", () => {
    const packet = createMessage("node-1", "msg-1", "node-1", "node-2", "hi");
    expect(packet.type).toBe("message");
    expect(packet.payload).toEqual({
      id: "msg-1",
      from: "node-1",
      to: "node-2",
      content: "hi",
    });
  });

  it("creates sync request", () => {
    const packet = createSyncRequest("node-1");
    expect(packet.type).toBe("sync_request");
    expect(packet.payload).toEqual({ requesterId: "node-1" });
  });

  it("creates sync response", () => {
    const plan = {
      nodeId: "node-2",
      nodeName: "bob",
      currentTask: "fixing bug",
      updatedAt: 12345,
    };
    const changes = [
      {
        id: "fc-1",
        filePath: "src/api.ts",
        changeType: "modify" as const,
        timestamp: 12345,
        diffSummary: "+fix",
      },
    ];
    const packet = createSyncResponse("node-2", plan, changes);
    expect(packet.type).toBe("sync_response");
    expect(packet.payload).toEqual({ plan, changes });
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm test`
Expected: FAIL — cannot resolve `../src/network/protocol.js`

- [ ] **Step 3: Implement protocol module**

Create `src/network/protocol.ts`:

```typescript
import {
  PeerPacket,
  PeerPacketType,
  PlanState,
  PairRequestPayload,
  PairResponsePayload,
  PlanUpdatePayload,
  MessagePayload,
  SyncRequestPayload,
  SyncResponsePayload,
} from "../types.js";

export function createPacket(
  type: PeerPacketType,
  fromNode: string,
  payload: unknown
): PeerPacket {
  return {
    type,
    fromNode,
    payload,
    timestamp: Date.now(),
  };
}

export function parsePacket(raw: string): PeerPacket | null {
  try {
    const data = JSON.parse(raw);
    if (!data.type || !data.fromNode || !("payload" in data) || !data.timestamp) {
      return null;
    }
    return data as PeerPacket;
  } catch {
    return null;
  }
}

export function createPairRequest(
  nodeId: string,
  nodeName: string
): PeerPacket {
  const payload: PairRequestPayload = { nodeId, nodeName };
  return createPacket("pair_request", nodeId, payload);
}

export function createPairResponse(
  fromNode: string,
  accepted: boolean
): PeerPacket {
  const payload: PairResponsePayload = { accepted };
  return createPacket("pair_response", fromNode, payload);
}

export function createPlanUpdate(
  nodeId: string,
  nodeName: string,
  currentTask: string
): PeerPacket {
  const payload: PlanUpdatePayload = { nodeId, nodeName, currentTask };
  return createPacket("plan_update", nodeId, payload);
}

export function createMessage(
  fromNode: string,
  id: string,
  from: string,
  to: string,
  content: string
): PeerPacket {
  const payload: MessagePayload = { id, from, to, content };
  return createPacket("message", fromNode, payload);
}

export function createSyncRequest(requesterId: string): PeerPacket {
  const payload: SyncRequestPayload = { requesterId };
  return createPacket("sync_request", requesterId, payload);
}

export function createSyncResponse(
  fromNode: string,
  plan: PlanState,
  changes: Array<{
    id: string;
    filePath: string;
    changeType: "add" | "modify" | "delete";
    timestamp: number;
    diffSummary: string;
  }>
): PeerPacket {
  const payload: SyncResponsePayload = { plan, changes };
  return createPacket("sync_response", fromNode, payload);
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm test`
Expected: All tests PASS

- [ ] **Step 5: Commit**

```bash
git add src/network/protocol.ts tests/network/protocol.test.ts
git commit -m "feat: peer-to-peer packet protocol with typed factories"
```

---

### Task 6: File Watcher

**Files:**
- Create: `src/watcher/file-watcher.ts`
- Create: `tests/watcher/file-watcher.test.ts`

- [ ] **Step 1: Write failing tests for file watcher**

Create `tests/watcher/file-watcher.test.ts`:

```typescript
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { FileWatcher } from "../src/watcher/file-watcher.js";
import { StateManager } from "../src/state/manager.js";
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";

describe("FileWatcher", () => {
  let tmpDir: string;
  let state: StateManager;
  let watcher: FileWatcher;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "c2c-test-"));
    state = new StateManager("node-1", "alice");
  });

  afterEach(async () => {
    if (watcher) await watcher.stop();
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it("detects new file creation", async () => {
    watcher = new FileWatcher(tmpDir, state);
    await watcher.start();

    fs.writeFileSync(path.join(tmpDir, "test.txt"), "hello");

    await waitFor(() => state.getFileChanges().length > 0, 3000);
    const changes = state.getFileChanges();
    expect(changes.length).toBeGreaterThanOrEqual(1);
    expect(changes.some((c) => c.filePath.includes("test.txt"))).toBe(true);
  });

  it("detects file modification", async () => {
    fs.writeFileSync(path.join(tmpDir, "existing.txt"), "old");

    watcher = new FileWatcher(tmpDir, state);
    await watcher.start();

    fs.writeFileSync(path.join(tmpDir, "existing.txt"), "new");

    await waitFor(() => state.getFileChanges().length > 0, 3000);
    const changes = state.getFileChanges();
    expect(changes.some((c) => c.changeType === "modify" || c.changeType === "add")).toBe(true);
  });

  it("ignores node_modules", async () => {
    const nmDir = path.join(tmpDir, "node_modules");
    fs.mkdirSync(nmDir);

    watcher = new FileWatcher(tmpDir, state);
    await watcher.start();

    fs.writeFileSync(path.join(nmDir, "pkg.json"), "{}");

    await new Promise((r) => setTimeout(r, 500));
    const changes = state.getFileChanges();
    expect(changes).toHaveLength(0);
  });
});

function waitFor(fn: () => boolean, timeoutMs: number): Promise<void> {
  return new Promise((resolve, reject) => {
    const start = Date.now();
    const check = () => {
      if (fn()) return resolve();
      if (Date.now() - start > timeoutMs) return reject(new Error("waitFor timeout"));
      setTimeout(check, 50);
    };
    check();
  });
}
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm test`
Expected: FAIL — cannot resolve `../src/watcher/file-watcher.js`

- [ ] **Step 3: Implement FileWatcher**

Create `src/watcher/file-watcher.ts`:

```typescript
import chokidar from "chokidar";
import { execSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { relative } from "node:path";
import { v4 as uuid } from "uuid";
import { StateManager } from "../state/manager.js";

const DEFAULT_IGNORED = [
  "**/node_modules/**",
  "**/.git/**",
  "**/dist/**",
  "**/build/**",
  "**/*.lock",
  "**/*.map",
];

export class FileWatcher {
  private watcher: chokidar.FSWatcher | null = null;
  private projectRoot: string;
  private state: StateManager;
  private extraIgnored: string[];

  constructor(projectRoot: string, state: StateManager, extraIgnored: string[] = []) {
    this.projectRoot = projectRoot;
    this.state = state;
    this.extraIgnored = extraIgnored;
  }

  async start(): Promise<void> {
    this.watcher = chokidar.watch(this.projectRoot, {
      ignored: [...DEFAULT_IGNORED, ...this.extraIgnored],
      ignoreInitial: true,
      persistent: true,
    });

    this.watcher.on("add", (filePath) => this.handleChange(filePath, "add"));
    this.watcher.on("change", (filePath) => this.handleChange(filePath, "modify"));
    this.watcher.on("unlink", (filePath) => this.handleChange(filePath, "delete"));

    await new Promise<void>((resolve) => {
      this.watcher!.on("ready", resolve);
    });
  }

  async stop(): Promise<void> {
    if (this.watcher) {
      await this.watcher.close();
      this.watcher = null;
    }
  }

  private handleChange(filePath: string, changeType: "add" | "modify" | "delete"): void {
    const relPath = relative(this.projectRoot, filePath);
    const diffSummary = this.getDiffSummary(filePath, changeType);

    this.state.addFileChange({
      id: uuid(),
      filePath: relPath,
      changeType,
      timestamp: Date.now(),
      diffSummary,
      fetchedBy: new Set(),
    });
  }

  private getDiffSummary(filePath: string, changeType: "add" | "modify" | "delete"): string {
    if (changeType === "delete") {
      return "(file deleted)";
    }

    try {
      const result = execSync(`git diff -- "${filePath}"`, {
        cwd: this.projectRoot,
        encoding: "utf-8",
        timeout: 5000,
      });
      if (result.trim()) return result.trim();
    } catch {
      // not a git repo or file untracked — fall through
    }

    try {
      const content = readFileSync(filePath, "utf-8");
      const lines = content.split("\n");
      return lines.slice(0, 200).join("\n");
    } catch {
      return "(unable to read file)";
    }
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm test`
Expected: All tests PASS

- [ ] **Step 5: Commit**

```bash
git add src/watcher/file-watcher.ts tests/watcher/file-watcher.test.ts
git commit -m "feat: file watcher with chokidar and git diff summaries"
```

---

### Task 7: mDNS Discovery Service

**Files:**
- Create: `src/network/discovery.ts`

- [ ] **Step 1: Implement DiscoveryService**

Create `src/network/discovery.ts`:

```typescript
import Bonjour, { type Service, type Browser } from "bonjour-service";
import { EventEmitter } from "node:events";

const SERVICE_TYPE = "c2c";

export interface DiscoveredNode {
  nodeId: string;
  nodeName: string;
  host: string;
  wsPort: number;
}

export class DiscoveryService extends EventEmitter {
  private bonjour: InstanceType<typeof Bonjour>;
  private publishedService: any = null;
  private browser: Browser | null = null;
  private nodeId: string;
  private nodeName: string;
  private wsPort: number;

  constructor(nodeId: string, nodeName: string, wsPort: number) {
    super();
    this.bonjour = new Bonjour();
    this.nodeId = nodeId;
    this.nodeName = nodeName;
    this.wsPort = wsPort;
  }

  publish(): void {
    this.publishedService = this.bonjour.publish({
      name: `c2c-${this.nodeId.slice(0, 8)}`,
      type: SERVICE_TYPE,
      port: this.wsPort,
      txt: {
        nodeId: this.nodeId,
        nodeName: this.nodeName,
        wsPort: String(this.wsPort),
      },
    });
  }

  browse(): void {
    this.browser = this.bonjour.find({ type: SERVICE_TYPE });

    this.browser.on("up", (service: Service) => {
      const txt = service.txt as Record<string, string> | undefined;
      if (!txt?.nodeId || txt.nodeId === this.nodeId) return;

      const node: DiscoveredNode = {
        nodeId: txt.nodeId,
        nodeName: txt.nodeName || "unknown",
        host: service.referer?.address || service.host,
        wsPort: parseInt(txt.wsPort, 10) || service.port,
      };
      this.emit("discovered", node);
    });

    this.browser.on("down", (service: Service) => {
      const txt = service.txt as Record<string, string> | undefined;
      if (txt?.nodeId) {
        this.emit("lost", txt.nodeId);
      }
    });
  }

  stop(): void {
    if (this.publishedService) {
      this.publishedService.stop?.();
    }
    if (this.browser) {
      this.browser.stop();
    }
    this.bonjour.destroy();
  }
}
```

- [ ] **Step 2: Verify TypeScript compiles**

Run: `npx tsc --noEmit src/network/discovery.ts`
Expected: No errors

- [ ] **Step 3: Commit**

```bash
git add src/network/discovery.ts
git commit -m "feat: mDNS discovery service via bonjour-service"
```

---

### Task 8: WebSocket Manager

**Files:**
- Create: `src/network/websocket.ts`

- [ ] **Step 1: Implement WebSocketManager**

Create `src/network/websocket.ts`:

```typescript
import { WebSocketServer, WebSocket } from "ws";
import { EventEmitter } from "node:events";
import { parsePacket, PeerPacket } from "./protocol.js";

export class WebSocketManager extends EventEmitter {
  private server: WebSocketServer | null = null;
  private connections: Map<string, WebSocket> = new Map();
  private port: number;

  constructor(port: number) {
    super();
    this.port = port;
  }

  startServer(): Promise<void> {
    return new Promise((resolve, reject) => {
      this.server = new WebSocketServer({ port: this.port });

      this.server.on("listening", () => resolve());
      this.server.on("error", (err) => reject(err));

      this.server.on("connection", (ws) => {
        this.handleIncomingConnection(ws);
      });
    });
  }

  connectToPeer(nodeId: string, host: string, port: number): Promise<void> {
    return new Promise((resolve, reject) => {
      if (this.connections.has(nodeId)) {
        resolve();
        return;
      }

      const ws = new WebSocket(`ws://${host}:${port}`);

      ws.on("open", () => {
        this.connections.set(nodeId, ws);
        this.setupSocket(nodeId, ws);
        resolve();
      });

      ws.on("error", (err) => {
        reject(err);
      });
    });
  }

  send(nodeId: string, packet: PeerPacket): boolean {
    const ws = this.connections.get(nodeId);
    if (!ws || ws.readyState !== WebSocket.OPEN) return false;
    ws.send(JSON.stringify(packet));
    return true;
  }

  broadcast(packet: PeerPacket): void {
    const data = JSON.stringify(packet);
    for (const [, ws] of this.connections) {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(data);
      }
    }
  }

  disconnect(nodeId: string): void {
    const ws = this.connections.get(nodeId);
    if (ws) {
      ws.close();
      this.connections.delete(nodeId);
    }
  }

  isConnected(nodeId: string): boolean {
    const ws = this.connections.get(nodeId);
    return ws?.readyState === WebSocket.OPEN || false;
  }

  stop(): void {
    for (const [id, ws] of this.connections) {
      ws.close();
      this.connections.delete(id);
    }
    if (this.server) {
      this.server.close();
      this.server = null;
    }
  }

  registerConnection(nodeId: string, ws: WebSocket): void {
    this.connections.set(nodeId, ws);
    this.setupSocket(nodeId, ws);
  }

  private handleIncomingConnection(ws: WebSocket): void {
    ws.on("message", (data) => {
      const packet = parsePacket(data.toString());
      if (!packet) return;

      if (packet.type === "pair_request" && !this.connections.has(packet.fromNode)) {
        this.connections.set(packet.fromNode, ws);
        this.setupSocket(packet.fromNode, ws);
      }

      this.emit("packet", packet, ws);
    });
  }

  private setupSocket(nodeId: string, ws: WebSocket): void {
    ws.on("message", (data) => {
      const packet = parsePacket(data.toString());
      if (packet) {
        this.emit("packet", packet, ws);
      }
    });

    ws.on("close", () => {
      this.connections.delete(nodeId);
      this.emit("disconnected", nodeId);
    });

    ws.on("error", () => {
      this.connections.delete(nodeId);
      this.emit("disconnected", nodeId);
    });
  }
}
```

- [ ] **Step 2: Fix the import in websocket.ts**

The import of `PeerPacket` should come from `../types.js`, not `./protocol.js`. Update the import:

```typescript
import { parsePacket } from "./protocol.js";
import { PeerPacket } from "../types.js";
```

- [ ] **Step 3: Verify TypeScript compiles**

Run: `npx tsc --noEmit`
Expected: No errors

- [ ] **Step 4: Commit**

```bash
git add src/network/websocket.ts
git commit -m "feat: WebSocket manager with server, client, and broadcast"
```

---

### Task 9: Trusted Peers Persistence

**Files:**
- Create: `src/state/trusted-peers.ts`

- [ ] **Step 1: Implement trusted peers file management**

Create `src/state/trusted-peers.ts`:

```typescript
import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";

const C2C_DIR = join(homedir(), ".c2c");
const TRUSTED_FILE = join(C2C_DIR, "trusted_peers.json");

interface TrustedPeer {
  nodeId: string;
  nodeName: string;
  trustedAt: number;
}

export function loadTrustedPeers(): TrustedPeer[] {
  try {
    const data = readFileSync(TRUSTED_FILE, "utf-8");
    return JSON.parse(data);
  } catch {
    return [];
  }
}

export function isTrusted(nodeId: string): boolean {
  return loadTrustedPeers().some((p) => p.nodeId === nodeId);
}

export function addTrustedPeer(nodeId: string, nodeName: string): void {
  const peers = loadTrustedPeers();
  if (peers.some((p) => p.nodeId === nodeId)) return;
  peers.push({ nodeId, nodeName, trustedAt: Date.now() });
  saveTrustedPeers(peers);
}

export function removeTrustedPeer(nodeId: string): void {
  const peers = loadTrustedPeers().filter((p) => p.nodeId !== nodeId);
  saveTrustedPeers(peers);
}

function saveTrustedPeers(peers: TrustedPeer[]): void {
  if (!existsSync(C2C_DIR)) {
    mkdirSync(C2C_DIR, { recursive: true });
  }
  writeFileSync(TRUSTED_FILE, JSON.stringify(peers, null, 2));
}
```

- [ ] **Step 2: Verify TypeScript compiles**

Run: `npx tsc --noEmit`
Expected: No errors

- [ ] **Step 3: Commit**

```bash
git add src/state/trusted-peers.ts
git commit -m "feat: trusted peers persistence to ~/.c2c/trusted_peers.json"
```

---

### Task 10: MCP Tools Registration

**Files:**
- Create: `src/mcp/tools.ts`

- [ ] **Step 1: Implement MCP tool registrations**

Create `src/mcp/tools.ts`:

```typescript
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
import { addTrustedPeer } from "../state/trusted-peers.js";

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
          `- ${p.nodeName} (${p.nodeId.slice(0, 8)}...): ${p.status}${p.currentTask ? ` | Task: ${p.currentTask}` : ""}`
      );

      return {
        content: [{ type: "text" as const, text: lines.join("\n") }],
      };
    }
  );

  server.tool(
    "approve_peer",
    "Accept a pairing request from a discovered peer",
    { peerId: z.string().describe("The nodeId of the peer to approve") },
    async ({ peerId }) => {
      const peer = state.getPeer(peerId);
      if (!peer) {
        return {
          content: [{ type: "text" as const, text: `Unknown peer: ${peerId}` }],
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
            text: `Peer ${peer.nodeName} approved and trusted. Future connections will auto-accept.`,
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
}
```

- [ ] **Step 2: Verify TypeScript compiles**

Run: `npx tsc --noEmit`
Expected: No errors

- [ ] **Step 3: Commit**

```bash
git add src/mcp/tools.ts
git commit -m "feat: register all MCP tools (set_plan, ask_peer, check_messages, etc.)"
```

---

### Task 11: MCP Resources Registration

**Files:**
- Create: `src/mcp/resources.ts`

- [ ] **Step 1: Implement MCP resource registrations**

Create `src/mcp/resources.ts`:

```typescript
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StateManager } from "../state/manager.js";

export function registerResources(server: McpServer, state: StateManager): void {
  server.resource(
    "peers",
    "c2c://peers",
    "List of all connected peers with status and unread message count",
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
    "Unread messages from peers",
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
```

- [ ] **Step 2: Verify TypeScript compiles**

Run: `npx tsc --noEmit`
Expected: No errors

- [ ] **Step 3: Commit**

```bash
git add src/mcp/resources.ts
git commit -m "feat: register MCP resources (peers, inbox)"
```

---

### Task 12: MCP Prompts Registration

**Files:**
- Create: `src/mcp/prompts.ts`

- [ ] **Step 1: Implement MCP prompt registration**

Create `src/mcp/prompts.ts`:

```typescript
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
```

- [ ] **Step 2: Verify TypeScript compiles**

Run: `npx tsc --noEmit`
Expected: No errors

- [ ] **Step 3: Commit**

```bash
git add src/mcp/prompts.ts
git commit -m "feat: register c2c-collaboration MCP prompt"
```

---

### Task 13: Entry Point — Wire Everything Together

**Files:**
- Create: `src/index.ts`

- [ ] **Step 1: Implement the main entry point**

Create `src/index.ts`:

```typescript
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

  // Handle incoming packets
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

  // Handle mDNS discovery
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

  // Periodic file change cleanup
  const cleanupInterval = setInterval(() => {
    state.cleanupFileChanges();
  }, 30_000);

  // Start everything
  await wsManager.startServer();
  await fileWatcher.start();
  discovery.publish();
  discovery.browse();

  const transport = new StdioServerTransport();
  await mcpServer.connect(transport);

  // Graceful shutdown
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
      // Sync response data is available via resources — the MCP layer
      // will read peer plan and changes via resource URIs.
      // Store peer plan update from sync response.
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
```

- [ ] **Step 2: Verify TypeScript compiles**

Run: `pnpm build`
Expected: Compiles with no errors, outputs to `dist/`

- [ ] **Step 3: Commit**

```bash
git add src/index.ts
git commit -m "feat: wire all modules in entry point with packet handling and lifecycle"
```

---

### Task 14: Claude Code Skill File

**Files:**
- Create: `skill/c2c-protocol.md`

- [ ] **Step 1: Write the c2c-protocol skill**

Create `skill/c2c-protocol.md`:

```markdown
---
name: c2c-protocol
description: Collaboration protocol for Claude Code instances connected via c2c MCP server. Ensures intent alignment and state sharing between peers.
---

# c2c Collaboration Protocol

When the c2c MCP server is active and peers are connected, follow these rules:

## Every Conversation Turn

1. Call `check_messages` to read any unread messages from peers.
2. If there are messages, incorporate their content into your understanding before proceeding.

## Before Starting a New Task

1. Call `set_plan` with a short description of what you are about to do.
2. This broadcasts your intent to all connected peers so they can avoid conflicting work.

## Before Modifying API-Related Code

Before changing any of the following, call `sync_with_peer` first:
- API route definitions or endpoints
- Request/response type definitions or interfaces
- Shared data models or DTOs
- API client call sites

Review the peer's recent changes and current plan. If there is a potential conflict, use `ask_peer` to coordinate before proceeding.

## When Receiving Peer Messages

- Read the message in context of your current work.
- If the peer asks a question, reply via `ask_peer`.
- If the peer reports a change that affects your work, adjust your approach accordingly.

## What NOT to Do

- Do not make decisions on behalf of the user based solely on peer messages.
- Do not modify code in the peer's project.
- Do not block your workflow waiting for peer responses — messages are async.
```

- [ ] **Step 2: Commit**

```bash
git add skill/c2c-protocol.md
git commit -m "feat: add c2c-protocol skill for Claude Code collaboration guidance"
```

---

### Task 15: Build Verification & README

**Files:**
- Modify: `package.json` (verify scripts)
- Create: `README.md`

- [ ] **Step 1: Run full build**

Run: `pnpm build`
Expected: Clean compile, `dist/` directory populated with `.js` and `.d.ts` files

- [ ] **Step 2: Run all tests**

Run: `pnpm test`
Expected: All tests pass

- [ ] **Step 3: Write README**

Create `README.md`:

```markdown
# c2c

LAN-based collaboration for Claude Code instances via MCP.

## What It Does

Connects multiple Claude Code instances running on different machines in the same local network. Each instance can:

- Share its current task/intent with peers
- See file changes happening on peer machines
- Send and receive async messages between Claude agents

## Setup

```bash
pnpm install
pnpm build
```

## Usage

Add to Claude Code:

```bash
claude mcp add c2c -- node /path/to/c2c/dist/index.js --project /path/to/your/project --name "your-name"
```

### Options

| Flag | Description | Default |
|------|-------------|---------|
| `--project` | Path to the project directory to watch | Current directory |
| `--name` | Human-readable node name | Random short ID |
| `--port` | WebSocket server port | 9100 |
| `--ignore` | Additional glob patterns to ignore (repeatable) | — |

### Skill

Copy `skill/c2c-protocol.md` to your Claude Code skills directory to enable automatic collaboration behavior.

## How It Works

1. On startup, the server broadcasts itself via mDNS on the local network
2. When another c2c node is discovered, a pairing request is sent
3. First-time peers require manual approval; approved peers are remembered
4. Once paired, peers share file changes, task intent, and async messages
```

- [ ] **Step 4: Commit**

```bash
git add README.md
git commit -m "docs: add README with setup and usage instructions"
```

---

### Task 16: End-to-End Smoke Test

**Files:**
- No new files — manual verification

- [ ] **Step 1: Build the project**

Run: `pnpm build`
Expected: No errors

- [ ] **Step 2: Start the server manually to verify it launches**

Run: `node dist/index.js --project /tmp/test-project --name test-node --port 9200`
Expected: Process starts without crashing, no errors printed. It will hang waiting for stdio input from MCP client — this is correct. Kill with Ctrl+C.

- [ ] **Step 3: Verify MCP integration by adding to Claude Code**

Run: `claude mcp add c2c -- node /Users/clck/Desktop/Workspace/c2c/dist/index.js --project /tmp/test-project --name test-node`
Expected: MCP server registered successfully

- [ ] **Step 4: Verify tools appear in Claude Code**

Start a Claude Code session and run: `list_peers`
Expected: Returns "No peers discovered." (since no other node is running)

- [ ] **Step 5: Final commit if any adjustments were needed**

```bash
git add -A
git commit -m "chore: final adjustments from smoke test"
```
