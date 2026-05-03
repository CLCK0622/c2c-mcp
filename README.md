<div align="center">

# c2c

[![npm version](https://img.shields.io/npm/v/c2c-mcp)](https://www.npmjs.com/package/c2c-mcp)
[![license](https://img.shields.io/npm/l/c2c-mcp)](./LICENSE)

**Connect your Claude Code instances. Let them talk to each other.**

c2c is an [MCP](https://modelcontextprotocol.io/) server that connects multiple Claude Code sessions over your local network.
When one agent changes an API, the other one knows. When one agent has a question, it can ask.

No cloud. No config server. Just mDNS discovery and WebSocket on your LAN.

[Quick Start](#quick-start) | [Tools](#tools-reference) | [How It Works](#how-it-works) | [中文](./README.zh-CN.md)

</div>

---

## Quick Start

```bash
npx c2c-mcp init
```

That's it. Run this in each project directory where you use Claude Code. The two instances will discover each other automatically.

---

## What Happens Next

Once two c2c nodes find each other on the network, you'll see a pairing prompt:

```
A device named "backend-bob" wants to pair with your Claude instance.
If approved, it will be able to read your current task, see your recent
file changes, and exchange messages with you.
Only approve devices you recognize and trust.
```

Approve it, and your agents are connected. Trusted peers are remembered -- they'll auto-connect next time.

---

## What Your Agents Can Do

### Share Intent

Each agent broadcasts what it's working on. Before your frontend agent changes a fetch call, it can check what the backend agent is doing to that endpoint.

### See File Changes

File modifications are tracked in real time. When the backend agent refactors a route, the frontend agent sees the diff -- without pulling from git.

### Send Messages

Agents can ask each other questions asynchronously:

> "Hey, are you changing the /users response schema? I'm about to update the TypeScript interface on my end."

The other agent picks it up on its next turn and responds.

---

## Tools Reference

Once c2c is active, Claude Code gets these tools:

| Tool | What it does |
|------|-------------|
| `set_plan` | Broadcast your current task to all peers |
| `ask_peer` | Send a message to another agent |
| `check_messages` | Read incoming messages |
| `sync_with_peer` | Pull a peer's current plan and recent file changes |
| `list_peers` | See who's connected |
| `approve_peer` | Accept a pairing request |
| `reject_peer` | Decline a pairing request |
| `list_trusted` | See all auto-trusted peers |
| `untrust_peer` | Revoke trust and disconnect a peer |

---

## Setup Options

### The One-Liner (Recommended)

```bash
npx c2c-mcp init
```

Detects your project directory, picks an available port, and registers the MCP server with Claude Code. Run it once per project.

### Manual Setup

If you need more control:

```bash
claude mcp add c2c -s project -- npx c2c-mcp serve \
  --project /path/to/your/project \
  --name "frontend-alice" \
  --port 9100
```

| Flag | Description | Default |
|------|-------------|---------|
| `--project` | Project directory to watch for file changes | Current directory |
| `--name` | Human-readable name for this node | Directory name |
| `--port` | WebSocket port for peer connections | 9100 |
| `--ignore` | Extra glob patterns to ignore (repeatable) | -- |

### Remove

```bash
npx c2c-mcp remove
```

### Collaboration Skill (Optional)

Copy `skill/c2c-protocol.md` to your Claude Code skills directory. This teaches Claude to automatically check messages at the start of each turn, announce its plan before working, and sync before modifying shared APIs.

---

## How It Works

```
Machine A                              Machine B
┌──────────────┐                       ┌──────────────┐
│  Claude Code │                       │  Claude Code │
│      ▲       │                       │      ▲       │
│      │ stdio │                       │      │ stdio │
│      ▼       │                       │      ▼       │
│  ┌────────┐  │    mDNS discovery     │  ┌────────┐  │
│  │  c2c   │◄─┼───────────────────────┼─►│  c2c   │  │
│  │ server │  │    WebSocket link     │  │ server │  │
│  └────────┘  │                       │  └────────┘  │
└──────────────┘                       └──────────────┘
```

1. Each c2c server broadcasts itself via **mDNS** (`_c2c._tcp.local`)
2. When a peer appears, a **WebSocket** connection is established
3. First-time peers go through a **pairing approval** flow
4. Approved peers are saved to `~/.c2c/trusted_peers.json` for auto-reconnect
5. State is shared on demand -- pull-based, not continuous sync

Works across machines on the same network, or between two terminals on the same machine (just use different ports).

---

## Security

- **First-connect approval**: New peers always require explicit user confirmation
- **Trust persistence**: Approved peers are remembered; revoke anytime with `untrust_peer`
- **LAN only**: mDNS discovery is limited to your local network
- **No cloud relay**: All traffic stays on your network

---

## Development

```bash
git clone https://github.com/CLCK0622/c2c-mcp.git
cd c2c-mcp
pnpm install
pnpm build
pnpm test
```

---

## License

MIT
