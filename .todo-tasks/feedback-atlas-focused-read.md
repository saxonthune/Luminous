# Focus an Atlas read on a local subgraph

## What happened

I used the Atlas MCP to refine a small CLI/control-flow fragment in an existing Braincrawl Atlas document. Reading one node or checking one edge returned the entire Atlas document, so I had to parse and filter the returned document in my own calling code before I could inspect the relevant area.

## Why it matters

Large Atlas documents make routine agent authoring expensive and noisy. It is harder to verify a small change, consumes unnecessary context, and makes an otherwise local edit feel like handling the whole canvas.

## Direction

A focused read of a node, edge set, or local neighborhood may make small authoring tasks easier to inspect and verify.
