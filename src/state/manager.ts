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
}
