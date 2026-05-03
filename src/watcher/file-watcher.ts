import chokidar from "chokidar";
import { execSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { relative } from "node:path";
import { v4 as uuid } from "uuid";
import { StateManager } from "../state/manager.js";

const DEFAULT_IGNORED_SEGMENTS = [
  "node_modules",
  ".git",
  "dist",
  "build",
];

const DEFAULT_IGNORED_EXTENSIONS = [".lock", ".map"];

export class FileWatcher {
  private watcher: chokidar.FSWatcher | null = null;
  private projectRoot: string;
  private state: StateManager;
  private extraIgnored: string[];

  constructor(projectRoot: string, state: StateManager, extraIgnored: string[] = []) {
    this.projectRoot = projectRoot;
    this.state = state;
    this.extraIgnored = extraIgnored;
  }

  private buildIgnoredFn(): (filePath: string) => boolean {
    return (filePath: string) => {
      const parts = filePath.split(/[\\/]/);
      if (parts.some((seg) => DEFAULT_IGNORED_SEGMENTS.includes(seg))) return true;
      if (DEFAULT_IGNORED_EXTENSIONS.some((ext) => filePath.endsWith(ext))) return true;
      if (this.extraIgnored.some((pattern) => filePath.includes(pattern))) return true;
      return false;
    };
  }

  async start(): Promise<void> {
    this.watcher = chokidar.watch(this.projectRoot, {
      ignored: this.buildIgnoredFn(),
      ignoreInitial: true,
      persistent: true,
    });

    this.watcher.on("add", (filePath) => this.handleChange(filePath, "add"));
    this.watcher.on("change", (filePath) => this.handleChange(filePath, "modify"));
    this.watcher.on("unlink", (filePath) => this.handleChange(filePath, "delete"));

    await new Promise<void>((resolve) => {
      this.watcher!.on("ready", resolve);
    });
  }

  async stop(): Promise<void> {
    if (this.watcher) {
      await this.watcher.close();
      this.watcher = null;
    }
  }

  private handleChange(filePath: string, changeType: "add" | "modify" | "delete"): void {
    const relPath = relative(this.projectRoot, filePath);
    const diffSummary = this.getDiffSummary(filePath, changeType);

    this.state.addFileChange({
      id: uuid(),
      filePath: relPath,
      changeType,
      timestamp: Date.now(),
      diffSummary,
      fetchedBy: new Set(),
    });
  }

  private getDiffSummary(filePath: string, changeType: "add" | "modify" | "delete"): string {
    if (changeType === "delete") {
      return "(file deleted)";
    }

    try {
      const result = execSync(`git diff -- "${filePath}"`, {
        cwd: this.projectRoot,
        encoding: "utf-8",
        timeout: 5000,
      });
      if (result.trim()) return result.trim();
    } catch {
      // not a git repo or file untracked — fall through
    }

    try {
      const content = readFileSync(filePath, "utf-8");
      const lines = content.split("\n");
      return lines.slice(0, 200).join("\n");
    } catch {
      return "(unable to read file)";
    }
  }
}
