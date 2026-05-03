import { describe, it, expect, beforeEach } from "vitest";
import { StateManager } from "../../src/state/manager.js";

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
