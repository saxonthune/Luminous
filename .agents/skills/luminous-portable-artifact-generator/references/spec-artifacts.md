# Spec Artifacts

Status: evolving authoring convention, not a registered parser recipe. This composition helps a reader inspect a proposed change, its code scope and its test scope. Representative artifact: `braincrawl-epub-metadata/.luminous/artifacts/11-epub-metadata/design.md`, version 2.

## User-supported requirements

- A Spec Artifact uses the exact diagram title **Code Changes** for its code-change view.
- A Spec Artifact uses the exact diagram title **Test Changes** for its test-change view.
- A Spec Artifact always ends with **Code Changes**, followed by **Test Changes**.
- **Code Changes** inventories all production-shipping source changes within the specified scope, so the reader can question any affected part.
- **Test Changes** inventories all test-code, local-stack, fixture, connector and other verification/tooling changes within that scope, so the reader can question any affected part.
- Diagram titles identify their subject; explanatory prose such as “Evidence required before rollout” belongs in the body, not the title.

Evidence: user requested “let's make a recipe for these 'Spec Artifacts'” and “do 'Code Changes' and 'Test Changes' for the titles instead of prose snuck into titles”.

## Composition and authoring guidance

Compose the relevant existing recipes rather than implementing another layout or component. Begin with the behavior, lifecycle, API or types views needed for the particular question. Follow them with Code Changes and Test Changes. The two exhaustive change views are mandatory and come last, in that order. Earlier child views depend on the particular question; every spec does not need every possible child view.

Exhaustiveness is relative to the stated implementation scope, not every possible future project. Inventory all known affected files, including adapters, exports, configuration, packaging and deployment changes where required. Mark unresolved paths and missing inventory explicitly rather than presenting a partial plan as complete. Deferred alternatives stay outside the committed inventory. If an inventory needs multiple canvases for readability, keep them in the final production-source section followed by the final test/tooling section, with exhaustive coverage across those canvases. This is authoring guidance for fulfilling the completeness requirement, not automatic source analysis.

Code Changes reuses the file-change ownership projection in [Control Tree](control-tree-diagram.md#file-change-ownership-projection) and [diff language](diff-language.md). Group by actual client, crate/package or deployment ownership; title Cards with filenames, retain repository-relative footers and link existing sources. Distinguish dependencies and contracts from calls. Show immediate work separately from follow-up and optional alternatives; a deferred consolidation must not appear necessary for a small fix.

Test Changes shows concrete existing test files and apparatus to reuse, additions to them, and proposed new files. Identify the behavior each addition proves. Use the same change badges and ownership grouping as Code Changes. Link code/test identities across views through names and source paths, without claiming automatic traceability checks. Keep planned checks distinct from executed results. Prefer the lowest sufficient verification layer and extend an existing journey rather than adding a duplicate application workflow.

The [Braincrawl change-design composition](change-design.md) supplies lifecycle, CLI/API tree, type and testing child-view examples. Domain-specific examples are not universal recipe requirements.

## Validation limits

The architecture semantic model checks declared kinds, references and Legend coverage. It does not enforce the titles above, verify file existence or prove that a code/test plan is complete. These are authoring conventions until corresponding rules are implemented.

## Read-path efficiency in a spec

When the change reads a collection, trace one cold read from caller through pagination, server selection, hydration/decryption and final filtering. Distinguish a bounded response page from a caller draining every page, and warm cache reuse from bounded cold work. State what each operation actually needs (list/preview, selected detail, generation context), which fields remain encrypted, and whether the reused loader performs writes. Do not assume the server can derive summaries from ciphertext.

If recommending a new projection, include all writers, identity/revision binding, stale/conflicting publication, visibility/deletion, missing-data backfill, Sync/export and compatibility in its scope; otherwise explicitly defer that option. Record budget and partial-coverage choices as open decisions until settled. Test Changes should identify measurements for requests, bytes, decryption and server selection work where relevant, distinguishing existing fixture results from performance claims for the new feature. These are authoring checks, not automatic mandates to add endpoints or projections.
