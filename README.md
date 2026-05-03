# c2c

LAN-based collaboration for Claude Code instances via MCP.

## What It Does

Connects multiple Claude Code instances running on different machines in the same local network. Each instance can:

- Share its current task/intent with peers
- See file changes happening on peer machines
- Send and receive async messages between Claude agents

## Setup

```bash
pnpm install
pnpm build
```

## Usage

Add to Claude Code:

```bash
claude mcp add c2c -- node /path/to/c2c/dist/index.js --project /path/to/your/project --name "your-name"
```

### Options

| Flag | Description | Default |
|------|-------------|---------|
| `--project` | Path to the project directory to watch | Current directory |
| `--name` | Human-readable node name | Random short ID |
| `--port` | WebSocket server port | 9100 |
| `--ignore` | Additional glob patterns to ignore (repeatable) | -- |

### Skill

Copy `skill/c2c-protocol.md` to your Claude Code skills directory to enable automatic collaboration behavior.

## How It Works

1. On startup, the server broadcasts itself via mDNS on the local network
2. When another c2c node is discovered, a pairing request is sent
3. First-time peers require manual approval; approved peers are remembered
4. Once paired, peers share file changes, task intent, and async messages
