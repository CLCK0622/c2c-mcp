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
