import { WebSocketServer, WebSocket } from "ws";
import { EventEmitter } from "node:events";
import { parsePacket } from "./protocol.js";
import { PeerPacket } from "../types.js";

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
