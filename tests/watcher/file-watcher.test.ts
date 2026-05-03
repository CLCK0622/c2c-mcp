import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { FileWatcher } from "../../src/watcher/file-watcher.js";
import { StateManager } from "../../src/state/manager.js";
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
