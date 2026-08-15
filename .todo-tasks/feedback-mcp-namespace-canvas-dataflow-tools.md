# Give legacy MCP tools product-specific namespaces

## What happened

While authoring an Atlas document, the MCP description exposed generic `canvas`, `node`, `edge`, and `query` tools alongside Atlas and Dataflow actions. The generic names actually apply to the prior Canvas graph model, but this is not evident at the call site.

## Why it matters

An agent can easily try a generic query against an Atlas document, or mistake a Canvas graph mutation for a platform-wide operation. The product boundary is central to Luminous, but the MCP names blur it.

## Direction

Place the existing graph tools under an explicit Canvas namespace and Dataflow tools under its own namespace, leaving Atlas as a peer. Product-scoped names would make both discovery and safe mutation clearer.
