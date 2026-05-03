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
} from "../../src/network/protocol.js";

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
