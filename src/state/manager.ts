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
