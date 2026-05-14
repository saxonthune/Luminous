---
title: MCP Design
summary: MCP architecture — config-driven, concept-grouped tools over HTTP. AI uses same action contract as browser client.
tags: [mcp, ai, api, tools, architecture]
deps: [doc02.02, doc02.03]
---

# MCP Design

> **Note (2026-05-14):** Portions of this doc predate the property-graph PDR ([doc02.11](./11-pdr-property-graph-architecture.md)). The concept-grouped / HTTP-only model is superseded by [doc02.15](./15-mcp-iterative-graph-building.md) for iterative diagram building. Read this for the same-contract principle and the AI workflow rationale; read doc02.15 for the current tool surface.

Architecture for `@luminous/mcp` — how AI agents interact with Luminous canvases via the Model Context Protocol.

## Core Constraint: Same Contract

All mutations go through the HTTP action API (doc02.03). No consumer — browser, MCP, CLI, script — reads or writes `.canvas.json` files directly. The server enforces invariants (cascade deletes, ID generation, shape validation). The action API is the contract; the file format is a serialization detail.

```
Browser  →  POST /api/note/create  →  @luminous/server  →  .canvas.json
Claude   →  POST /api/note/create  →  @luminous/server  →  .canvas.json
              ↑                         ↑
         same contract            same enforcement
```

The old `@carta/server` bundled MCP alongside HTTP handlers with shared in-memory state and internal types. That coupling made both hard to evolve. MCP must be a separate package and separate process — an HTTP client, nothing more.

## Architecture: Config-Driven Concept Tools

### Why not 1:1 endpoint mapping

Research consensus: mapping every API endpoint to an individual MCP tool overwhelms LLMs. Tool *selection* (which tool to call) is well-optimized in LLMs, but tool *parameter selection* within a large action space degrades. The sweet spot is 5-15 tools per server.

### Tool design: one tool per concept

Four tools, aligned to concepts (doc02.02). Each tool groups related actions behind an `action` parameter:

| Tool | Concept | Actions |
|------|---------|---------|
| `canvas` | Workspace + Document | `list`, `read` |
| `note` | Note | `create`, `update`, `delete` |
| `edge` | Edge | `connect`, `disconnect`, `relabel` |
| `structure` | Nesting + Canvas | `nest`, `unnest`, `move`, `resize` |

This gives LLMs a clear first-level routing decision (which concept?) then a scoped action choice within each tool. Parameters are specific to each action, not a union of all possible params.

Future concepts add new tools: `schema` (define, edit, delete), `formalize` (formalize, informalize), `verify` (audit_coverage, audit_interactions, audit_constraints). Stays within the 5-15 tool limit.

### Implementation: declarative config

Two files. `tools.config.ts` is the only file edited when the API grows:

```typescript
export const toolConfig = {
  canvas: {
    description: "Browse and read canvas documents",
    actions: {
      list: { method: 'GET', path: '/api/documents', params: {} },
      read: { method: 'GET', path: '/api/document/:path', params: { path: 'string' } },
    }
  },
  note: {
    description: "Create and modify notes — capture thinking without committing to structure",
    actions: {
      create: { method: 'POST', path: '/api/note/create', params: { path: 'string', title: 'string', 'body?': 'string' } },
      // ...
    }
  },
  // ...
}
```

`server.ts` reads the config, generates MCP tool schemas and HTTP-forwarding handlers automatically. It never changes.

### AI workflow

A typical interaction:

1. `canvas({ action: "list" })` — discover available canvases
2. `canvas({ action: "read", path: "app.canvas.json" })` — load full document state
3. Reason about the design
4. `note({ action: "create", path: "app.canvas.json", title: "Authentication", body: "Login flow needed..." })` — add a note
5. `edge({ action: "connect", path: "app.canvas.json", fromId: "...", toId: "...", label: "requires" })` — connect it

The server must be running — same as for a human using the browser. `pnpm dev:next` starts both server and client.

## Rationale

### Why HTTP, not direct file access

MCP servers run as local child processes with filesystem access. It would be simpler to read/write `.canvas.json` directly. But:

- Direct writes bypass server invariants (cascade deletes, shape validation, ID generation)
- Two writers to the same file (server + MCP) creates conflict potential
- Divergence: "works from UI but not from AI" bugs become possible
- The action API exists precisely to be the single mutation path

The server being required is a feature — one code path for all mutations.

### Why config-driven, not code-per-tool

- Adding an endpoint = adding one config line, not writing a new handler
- Tool registration logic is generic — no per-tool code to maintain
- Config is the single source of truth for the MCP ↔ API mapping
- Reduces risk of MCP tools drifting from the API contract

### Why concept-grouped, not individual tools

- LLMs perform best with 5-15 tools (research consensus)
- Concept grouping matches the mental model: "I want to do something with notes" → `note` tool
- Parameters are scoped per concept, reducing hallucination (title only applies to notes, not edges)
- Scales to ~10 tools when formalization and verification are added
