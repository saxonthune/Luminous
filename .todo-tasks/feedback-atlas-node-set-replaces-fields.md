# Atlas node updates can drop untouched fields

## What happened

While authoring an Atlas document through MCP, I created a positioned, nested node and then used `node/set` to add its Content. The update dropped the node's stored parent, position, and color unless I repeated every field in the second call. I expected the documented partial update to preserve fields I did not change.

## Why it matters

An agent has to re-send a complete node record after every small content edit, which is easy to get wrong and can silently damage carefully arranged canvas structure.

## Direction

Make partial node updates preserve unspecified fields, or make replacement semantics explicit and provide a safe read-modify-write path.
