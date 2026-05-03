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

export function createPairRequest(nodeId: string, nodeName: string): PeerPacket {
  const payload: PairRequestPayload = { nodeId, nodeName };
  return createPacket("pair_request", nodeId, payload);
}

export function createPairResponse(fromNode: string, accepted: boolean): PeerPacket {
  const payload: PairResponsePayload = { accepted };
  return createPacket("pair_response", fromNode, payload);
}

export function createPlanUpdate(nodeId: string, nodeName: string, currentTask: string): PeerPacket {
  const payload: PlanUpdatePayload = { nodeId, nodeName, currentTask };
  return createPacket("plan_update", nodeId, payload);
}

export function createMessage(fromNode: string, id: string, from: string, to: string, content: string): PeerPacket {
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
