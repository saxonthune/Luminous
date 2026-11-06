# Business process diagram — exploratory recipe

Status: authoring proposal, not a registered or automatically validated recipe.

## User-supported requirements

- Represent what different actors do, including users, LLMs, and harness tool code where applicable.
- Distinguish actions from data as node types.
- Use actor containers to show ownership of actions and, where useful, data.
- Describe node kinds in a legend; omit edge labels that merely repeat the node type.
- Support a vertical process presentation when requested.

## Draft convention

Use actor-named subgraphs for responsibility, action and data nodes with distinct visual roles, and decision nodes where a branch is meaningful. Solid arrows can describe process order and dashed arrows data association; explain this convention in prose until a legend can represent edge kinds. Label conditions on branches. Do not assign an owner when unknown, or imply that a data item is stored by its visual owner. Treat an LLM/tool loop or optional calls accurately rather than implying every step is mandatory. Keep current behavior and proposed alternatives distinct.

Open questions: whether actor containers should support shared responsibility, how to represent repeated model/tool calls, and what edge semantics and validations a future registered recipe should enforce.

For a flat process with schema cards beside a vertical action spine, use ordinary Mermaid and declare `layout.nonOrderingEdges: []`, `layout.spine: [step1, step2]`, and `layout.attachments: [{node: schema, step: step1, side: left}]` in `portable-canvas`. Every graph node must appear exactly once in the spine or attachments. Attachments can share a step and side; they stack without overlapping. Edges retain their meaning and do not determine this layout. The layout is generated, not persisted from browser dragging.
