# Architecture comparison, reusable badges, and diagram practices

## Task and retained artifacts

The user is designing clear application APIs across Braincrawl Store, Reading
Buddy and Researcher. They requested an architectural overview followed by
purpose-built views, then a proposed architecture that reads as a diff of the
current overview.

- Worktree: `/home/saxon/code/github/saxonthune/braincrawl-service-standardization`
- Active input: `.luminous/service-standardization/2026-10-22-architecture.md`
- Prior drafts: dated Markdown files alongside the active input.
- Output: `/tmp/braincrawl-service-standardization.html`
- Generator/skill: `/home/saxon/code/github/saxonthune/luminous-portable`

## What we implemented

Canvas 3 reuses canvas 1's component IDs, titles, role classes and existing
relationships, adding the proposed application contracts and marking affected
components. The comparison is an authored proposal, not a computed code diff.
The proposal adds application interfaces without implying new Worker deployments.

The user requested large square badges occupying the right side of Card headers,
reserving space with minimal padding. Implemented optional `portable-nodes.diff`:

- `new`: solid green +, a new component.
- `additive`: pale green ++, an existing component gains capability.
- `modified`: split red/green −/+, existing behavior changes.
- No badge: unchanged in this comparison.

The user specified the three color meanings and square placement. Symbols, exact
palettes, and 48px Card badge size were implementation choices for this attempt.

`packages/portable/src/diff.ts` centrally defines the change kinds, labels,
symbols and light/dark palettes. `runtime/DiffBadge.tsx` is the reusable Solid
component used both by Cards and by smaller legend swatches. `Card.tsx` reserves
header space; layout estimates account for the badge. Meaning is conveyed by
symbols and accessible labels as well as color. Component role colors remain
independent of change status.

Each canvas can declare `legend.entries` using either a theme `class` or a `diff`
kind. Unsupported diff values are rejected. Guidance lives in
`references/diff-language.md`, linked from the main skill and Portable README.
Requirements were captured in `doc01.16.02` under PDIFF.

## User steering that suggests broader diagram practices

These lessons are grounded in this session. Apply them when they fit the user's
question; do not turn the particular Braincrawl layout into a universal template.

### Start with a useful base overview

The user asked for “a single good architectural overview that we can use as a
base” followed by purpose-built diagrams. A Worker-script/class inventory did
not answer their question, even after making it vertical. For this architecture,
the useful starting point is the user's browser, then the UI server, executing
handlers and data stores. Choose the organizing question before arranging boxes.

### Distinguish relationships rather than relying on vague nesting

The user's earlier Durable-Object-inside-Worker correction shows that containment
must have an explicit meaning. Deployment membership, runtime instances, calls,
references and data access are different relationships. Put deployment ownership
in Card details when the main view follows execution. Show storage operations
from executing code; a SQL row containing an R2 key does not make SQLite call R2.
The consulted software/OoT L3 notes reinforce these distinctions, without turning
a source-derived architecture into a claim of an observed execution trace.

### Explain concrete work

The user rejected the diagram of “shared harness core”, “adapters” and “model
transport” with “what does any of this mean”. Labels naming implementation roles
were insufficient. The replacement follows a concrete passage-reading operation:
resolve a held artifact, retrieve ciphertext, decrypt in the browser, select
pages, and send the selected result for inference. Card bodies explain the work;
footers identify execution location. Focused views should answer an explicit
question or follow a recognizable task.

### Use consistent, reusable presentation

The user explicitly requested the built-in Card component instead of the earlier
basic-node/subgraph-header presentation, and later emphasized component reuse
for the Legend. Reuse named components and shared style definitions. Avoid
one-off artifact markup that gives the same concept a different appearance.
The earlier CF naming preference was `(CF type) name`; retain regular naming
where resources of the same category are compared.

### Fit the reading direction and reduce wasted space

The user repeatedly requested vertical content to fit the viewport and tighter
spacing between nodes. A top-down declaration alone did not prevent a very wide
layout; unrelated siblings spread horizontally. Inspect generated geometry and,
when available, the actual rendered view. Prefer organizing branches and reducing
gaps before shrinking text. Invisible ordering edges may help but must be marked
as layout constraints, not system behavior. The older Pele artifact's explicit
8px check must not be claimed as a Portable feature.

### Let structure carry distinctions; let short text explain purpose

Earlier steering rejected prose inventories and requested separate nodes for SQL
tables, record-key patterns and R2 prefixes, followed by extremely brief inner
purpose nodes. The lesson is to make categories and relationships visible, with
labels that teach why each item matters. Do not collapse tables, fields, logical
layers and key prefixes into one unexplained list. “Object group” was later
clarified as an informal R2 key-prefix grouping, not a provider resource type.

### Scope the legend to its canvas

The user rejected a page-shared legend entirely. Each canvas declares its own
legend, located at the bottom-right of that canvas viewport, with independent
minimize state. Its header must always be exactly “Legend”, not an authored
custom heading. Fullscreen preserves the canvas component. The legend should
explain the visual language present in the specific view, including diff badges.

### Compare changes against the same architecture

The user requested that canvas 3 “look like the 1st canvas” with visible change
indicators. Preserve the base identities and relationships, then annotate deltas.
Differentiate adding a component, extending an existing component, and changing
existing behavior. Keep that language centralized and distinguish it from role
colors. Recomputed layout currently does not guarantee identical coordinates
across the two canvases; stable comparison positions remain a possible improvement.

### Preserve the working artifact and its input

The user asked to retain inputs under `.luminous` for history, and previously
specified updating the same browser file without opening duplicate tabs. Keep
editable source and dated significant drafts; regenerate the same preview path.
Scroll Zoom should be enabled by default; earlier input explicitly disabling it
was corrected at the user's request.

## Evidence and limits

The user approved the diff attempt with “excellent”. Generation built the
standalone HTML successfully, and embedded artifact data confirmed the intended
change kinds on the seven affected/new Cards. No browser interaction tests or
visual inspection of the final badge rendering were performed in this turn.
The result is not evidence of exact header geometry at every zoom or viewport.
No Braincrawl API implementation, Worker rename, deployment or data migration
was performed. Existing unrelated changes in the Luminous worktree were retained.
