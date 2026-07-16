---
title: Dataflow Designer app
summary: The client app — read-only projection of dataflow Documents onto cactus, live-reloading as the agent writes; document plumbing shared with Luminous Canvas
tags: [dataflow, apps, client, rendering]
deps: [doc01.05.01, doc02.21.01, doc02.21.02, doc01.04]
---

# Dataflow Designer app

The Dataflow Designer is an entry in the client's app registry. Its picker
lists the workspace's `*.dataflow.json` Documents; selecting one renders a
read-only canvas.

The canvas is read-only: the user reads, and the agent writes through the
operations (doc02.21.02). The client subscribes to the server's file-change
WebSocket and reloads the open Document when it changes, so the agent's edits
appear without a refresh.

## Projection

The app projects the Document onto cactus with hand-written Solid components —
no pack or render-template machinery:

- A Box renders as a cactus node showing its name, its description, and its
  contract.
- A Flow renders as a directed edge.
- `dagLayout` positions the graph so Flows run in one direction.

## Shared plumbing

Document listing and loading, and the file-change subscription, are
app-agnostic helpers shared with Luminous Canvas. The projection onto cactus
is the app's own — that is where an app's opinion lives.
