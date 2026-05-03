# Contributing to c2c

Thanks for your interest in contributing! Here's how to get started.

## Development Setup

```bash
git clone https://github.com/CLCK0622/c2c-mcp.git
cd c2c-mcp
pnpm install
pnpm build
pnpm test
```

## Project Structure

```
src/
├── index.ts              Entry point — wires all modules
├── cli.ts                CLI (init / remove / serve)
├── types.ts              Shared type definitions
├── mcp/
│   ├── tools.ts          MCP tool handlers
│   ├── resources.ts      MCP resource handlers
│   └── prompts.ts        MCP prompt templates
├── state/
│   ├── manager.ts        In-memory state (plan, peers, inbox, file changes)
│   └── trusted-peers.ts  Persistent trust store (~/.c2c/trusted_peers.json)
├── network/
│   ├── discovery.ts      mDNS broadcast and scanning
│   ├── websocket.ts      WebSocket server and client management
│   └── protocol.ts       Peer-to-peer packet encoding
└── watcher/
    └── file-watcher.ts   File change detection with git diff
```

## Making Changes

1. Fork the repo and create a branch from `main`
2. Write tests for new functionality
3. Make sure all tests pass: `pnpm test`
4. Make sure TypeScript compiles: `pnpm build`
5. Open a pull request

## Code Style

- TypeScript strict mode
- ES modules (`import/export`)
- No comments unless the "why" is non-obvious
- Follow existing patterns in the codebase

## Testing

Tests use [Vitest](https://vitest.dev/). Run them with:

```bash
pnpm test          # single run
pnpm test:watch    # watch mode
```

When adding new features, write tests first (TDD). The state manager and protocol modules have good test coverage to use as reference.

## Areas for Contribution

Some ideas if you're looking for something to work on:

- **Resource templates** — dynamic MCP resources for per-peer plan and file changes (`c2c://peers/{peerId}/plan`)
- **Smarter diff summaries** — summarize large diffs instead of sending raw output
- **Connection status UI** — a dashboard showing connected peers and message history
- **Multi-project support** — share state across multiple projects on the same machine
- **Encryption** — encrypt WebSocket traffic between peers

## Reporting Issues

Open an issue on [GitHub](https://github.com/CLCK0622/c2c-mcp/issues). Include:

- What you expected to happen
- What actually happened
- Steps to reproduce
- Your OS and Node.js version

## License

By contributing, you agree that your contributions will be licensed under the MIT License.
