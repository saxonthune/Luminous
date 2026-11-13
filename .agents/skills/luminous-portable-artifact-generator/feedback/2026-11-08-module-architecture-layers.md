# Module-only architecture and deliberate vertical order

User correction: do not expose underlying functions in a module wiring overview.
Let source → IR retain function evidence, but project module connections only.
Place user-facing modules at the top and data stores at the bottom.

Artifact: braincrawl-code-tree/.luminous/artifacts/12-source-code-tree/design.html.
V3 replaces the first view with module groups and module-level Extended Info;
function identities stay in the IR. Existing later file inventories are retained.
Source grouping uses explicit area/role rules. Store nodes come from default Server
Wrangler config; binding edges are source-reference/ownership evidence, not runtime.

First layered attempt put every shared module group in one horizontal row and was
unreadable at Fit all. Wrap into narrow rows. Use invisible layout constraints and
non-ordering real edges: truthful backward dependencies should not scramble the
presentation tiers or be removed to beautify layout. Layer order is a didactic
choice, not execution order or automatically discovered domain truth.
