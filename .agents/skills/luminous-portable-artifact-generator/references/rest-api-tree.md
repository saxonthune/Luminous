# REST API Tree

Build one full `flowchart LR` tree in a `mermaid rest-api-tree` fence from the declared method/path inventory.
Merge shared prefixes and attach methods to their exact resource. Expand each
path segment, including `{id}` parameters, instead of stopping at domain roots.
Focused canvases may follow; they do not replace endpoints in the first tree.
The explicit layout mode requires one root and one parent per node. It aligns
the first child's top with its parent and stacks subsequent subtrees below it.
Generation-time geometry uses cactus's lightweight `leadingTreeLayout`.
Parent headers show a right-aligned icon in a rounded badge. Collapsed parents
show a rightward chevron and total descendant count; expanded parents show a downward chevron. Leaves
have no button. Hidden descendants and incident edges are excluded from drawing,
selection and fitting. Collapse and expand recompute visible subtree space demands
and reposition later branches up or down. The clicked header stays anchored;
node dimensions, camera and nested collapse state are retained. Only changed
coordinates are updated. Reset layout expands all branches. Runtime geometry
uses the lightweight `@luminous/cactus/tree-layout` entry point, with no ELK import.

The header affordance is the **Visibility Button**. Hovering it instantly opens
an opaque stadium-shaped **Visibility Toolbar** directly above it, with matching
left edges. A shared hover region bridges the gap; focus also exposes the menu.
When children are open, **Hide Grandchildren** keeps immediate children visible
and minimizes their branches. When children are minimized, **Reveal Children**
opens only that next level. Both actions reapply layout. The reusable component
uses cactus's `ToolbarSurface`, also used by Denim, through the runtime entry.
Toolbar actions use icons with accessible names and tooltips. Selecting an
action dismisses the toolbar until a fresh hover or keyboard focus. The header
badge and toolbar share surface/border tokens for visual continuity.
State the inventory's scope rather than claiming undocumented APIs are covered.

Use the reusable `rest-card` variant in `portable-nodes`:

```yaml
books:
  component: rest-card
  title: /books
  methods: [GET]
  body: Books
book:
  component: rest-card
  title: /{bookId}
  methods: [GET, PUT]
  info: book-contract
```

`methods` is required, may be empty, and accepts unique uppercase standard HTTP
methods. Ordinary Cards do not accept it. Verbs render as colored badges between
header and body and remain visible at summary zoom. Header/body/footer, diff and
Extended Info reuse the existing Card behavior.

For checked semantic diagrams, declare prefix, endpoint and parameter meanings
and cover them in each canvas's Legend. Bind them to distinct theme slots.
Without a supplied palette, REST Cards use `src/rest.ts` defaults: grey prefixes,
green callable literal resources, and purple parameter segments. A parameter
can be callable: it keeps its parameter background and shows method badges.
This precedence is an initial implementation choice, not an extracted user rule.
Verb badge colors live in `runtime/style.css`; kind fallback colors and
classification live in `src/rest.ts`.

Keep the full method/path and contract in Extended Info. Arrows mean path
extension, not network calls. Retain the structured inventory and generator in
the consuming project. Verify that every declared method/path occurs in the
full tree. No API discovery, HTTP correctness proof, or new Recipe registry
entry is implied by this presentation component.


## Requirements

Recipe-specific requirements live here with the authoring guidance. `[p]` marks
wording pending review. Existing requirement identifiers are retained.

- **RTTERM1.** [p] **Visibility Button** — the affordance in the top-right of a REST API node.
- **RAPI1.** [p] REST API Tree displays the full tree of endpoints.
- **RAPI2.** [p] REST API Tree lays out the endpoint tree from left to right (LR).
- **RAPI3.** [p] REST API Tree aligns the first child horizontally with its parent.
- **RAPI4.** [p] REST API Tree places subsequent children below the first child.
- **RAPI5.** [p] When an API tree branch is minimized, the layout recalculates and moves later branches upward to use the freed space.
- **RAPI6.** [p] When an API tree branch reveals its descendants, the layout moves later branches downward as needed to make sufficient space.
- **RAPI7.** [p] REST API Tree efficiently calculates space demands and repositions nodes when a branch is minimized or expanded.
- **RCARD1.** [p] REST API Tree uses a modified Card component named REST Card.
- **RCARD2.** [p] REST Card displays the HTTP verbs available on its resource as colored badges.
- **RCARD3.** [p] REST Card places the verb badges in a new row between its header and body.
- **RCARD4.** [p] REST Card uses a distinct background when its node represents a callable endpoint.
- **RCARD5.** [p] REST Card uses a distinct background when its node is organizational (a prefix).
- **RCARD6.** [p] REST Card uses a distinct background when its node contains an {id} path segment.
- **RCARD7.** [p] REST Card places a Visibility Button in its header.
- **RCARD8.** [p] REST Card uses a compact Visibility Button.
- **RCARD9.** [p] REST Card right-justifies its Visibility Button in the header.
- **RCARD10.** [p] When the user presses a REST Card Visibility Button, the tree hides all of that node’s children.
- **RCARD11.** [p] While a REST Card’s children are minimized, its Visibility Button displays a different icon.
- **RCARD12.** [p] While a REST Card’s children are minimized, its Visibility Button displays the total number of descendant nodes.
- **RCARD13.** [p] When a node has no children, its REST Card does not display a Visibility Button.
- **RCARD14.** [p] The always-present Visibility Button displays an icon on a badge background.
- **RCARD15.** [p] The Visibility Button’s badge appearance provides visual continuity with the Visibility Toolbar.
- **VTOOL1.** [p] The Visibility Toolbar is a stadium-shaped menu that provides additional visibility options.
- **VTOOL2.** [p] The Visibility Toolbar appears above its Visibility Button.
- **VTOOL3.** [p] The Visibility Toolbar’s leftmost edge is flush with the left edge of its Visibility Button.
- **VTOOL4.** [p] When the user hovers over a Visibility Button, its Visibility Toolbar appears instantly.
- **VTOOL5.** [p] The Visibility Toolbar remains visible while the pointer moves between its Visibility Button and the toolbar.
- **VTOOL6.** [p] While the target node’s children are not minimized, its Visibility Toolbar offers “Hide Grandchildren”.
- **VTOOL7.** [p] When the user activates “Hide Grandchildren”, all immediate children of the target node remain visible.
- **VTOOL8.** [p] When the user activates “Hide Grandchildren”, all grandchildren and deeper descendants of the target node are hidden.
- **VTOOL9.** [p] While the target node’s children are minimized, its Visibility Toolbar offers “Reveal Children”.
- **VTOOL10.** [p] When the user activates “Reveal Children”, all immediate children of the target node are revealed.
- **VTOOL11.** [p] When the user activates “Reveal Children”, the target node’s grandchildren and deeper descendants remain minimized.
- **VTOOL12.** [p] After a Visibility Toolbar action changes descendant visibility, the API tree reapplies its layout.
- **VTOOL13.** [p] Visibility Toolbar options use icons instead of text labels.
- **VTOOL14.** [p] When the user presses a Visibility Toolbar option, the toolbar hides.
