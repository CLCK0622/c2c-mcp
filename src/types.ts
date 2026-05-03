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
