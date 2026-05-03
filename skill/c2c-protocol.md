---
name: c2c-protocol
description: Collaboration protocol for Claude Code instances connected via c2c MCP server. Ensures intent alignment and state sharing between peers.
---

# c2c Collaboration Protocol

When the c2c MCP server is active and peers are connected, follow these rules:

## Pairing Security

When a new peer is discovered with `pair_pending` status, you MUST:

1. Tell the user clearly: "A device named [name] wants to pair with your Claude instance. If approved, it will be able to read your current task, see your recent file changes, and exchange messages with you. Only approve devices you recognize and trust."
2. Wait for the user's explicit confirmation before calling `approve_peer`.
3. Never auto-approve. Never approve without informing the user first.

If the user wants to review or revoke trust later, use `list_trusted` and `untrust_peer`.

## Every Conversation Turn

1. Call `check_messages` to read any unread messages from peers.
2. If there are messages, incorporate their content into your understanding before proceeding.

## Before Starting a New Task

1. Call `set_plan` with a short description of what you are about to do.
2. This broadcasts your intent to all connected peers so they can avoid conflicting work.

## Before Modifying API-Related Code

Before changing any of the following, call `sync_with_peer` first:
- API route definitions or endpoints
- Request/response type definitions or interfaces
- Shared data models or DTOs
- API client call sites

Review the peer's recent changes and current plan. If there is a potential conflict, use `ask_peer` to coordinate before proceeding.

## When Receiving Peer Messages

- Read the message in context of your current work.
- If the peer asks a question, reply via `ask_peer`.
- If the peer reports a change that affects your work, adjust your approach accordingly.

## What NOT to Do

- Do not make decisions on behalf of the user based solely on peer messages.
- Do not modify code in the peer's project.
- Do not block your workflow waiting for peer responses -- messages are async.
