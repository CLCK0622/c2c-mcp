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
