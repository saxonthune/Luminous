# Browser-rooted architecture overview and Cards

Input: /home/saxon/code/github/saxonthune/braincrawl-service-standardization/.luminous/service-standardization/2026-10-22-architecture.md
Output: /tmp/braincrawl-service-standardization.html
Generator: /home/saxon/code/github/saxonthune/luminous-portable

The initial artifact opened with a Worker-script inventory using subgraph headers
and basic nodes. It arranged many unrelated definitions horizontally. The user
first requested vertical layout, then clarified that the inventory itself was
unhelpful: they want one architectural overview starting at the browser, following
the UI server, workers/handlers and storage, followed by purpose-built diagrams.
They explicitly requested the built-in Card and disliked the previous header.

Read the existing L3 feature-formalism-prototyping and runtime-configuration-graphs
notes. Their useful distinction is placement versus invocation versus data access;
keep identity stable across explanatory views. Move definition/deployment metadata
into Card footers instead of leading with a class inventory.

Replaced the first two diagrams with one browser-rooted access view, using explicit
portable-nodes component: card metadata for all 15 nodes. Focused diagrams also use
Cards for leaves. Preserved the previous input as a separate historical draft.
No renderer code or custom Card implementation was required.

Generation succeeded. Embedded layout inspection initially showed 1995 × 1213
bounds, so invisible layout constraints moved auxiliary infrastructure below the
main branches. Invisible edges must be marked as layout-only in input. No browser
interaction tests were run in this revision; generation/geometry inspection alone
does not establish visual readability at the user's chosen zoom.

Suggestion: an authoring preset for a browser-rooted architecture with compact
Cards and secondary branches would reduce manual layout steering. This is a
suggestion, not an agreed product requirement.
