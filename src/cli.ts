#!/usr/bin/env node

import { execSync } from "node:child_process";
import { createServer } from "node:net";
import { basename, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

function findAvailablePort(start: number): Promise<number> {
  return new Promise((resolve, reject) => {
    const server = createServer();
    server.listen(start, () => {
      server.close(() => resolve(start));
    });
    server.on("error", () => {
      if (start >= 9200) {
        reject(new Error("No available port found in range 9100-9200"));
        return;
      }
      findAvailablePort(start + 1).then(resolve, reject);
    });
  });
}

async function init() {
  const projectDir = resolve(process.cwd());
  const name = basename(projectDir);
  const serverScript = join(__dirname, "index.js");

  console.log(`Setting up c2c for project: ${name}`);
  console.log(`Project directory: ${projectDir}`);

  const port = await findAvailablePort(9100);
  console.log(`Using port: ${port}`);

  const args = [
    serverScript,
    "--project", projectDir,
    "--name", name,
    "--port", String(port),
  ];

  try {
    execSync(
      `claude mcp add c2c -s project -- node ${args.map((a) => `"${a}"`).join(" ")}`,
      { stdio: "inherit", cwd: projectDir }
    );
    console.log(`\nDone. c2c is ready for "${name}" on port ${port}.`);
  } catch {
    console.error("Failed to register MCP server. Is Claude Code installed?");
    process.exit(1);
  }
}

function remove() {
  try {
    execSync("claude mcp remove c2c -s project", { stdio: "inherit" });
    console.log("c2c removed from this project.");
  } catch {
    console.error("Failed to remove c2c.");
    process.exit(1);
  }
}

const command = process.argv[2];

switch (command) {
  case "init":
    init();
    break;
  case "remove":
    remove();
    break;
  default:
    console.log("Usage:");
    console.log("  c2c init     Set up c2c for the current project");
    console.log("  c2c remove   Remove c2c from the current project");
    break;
}
