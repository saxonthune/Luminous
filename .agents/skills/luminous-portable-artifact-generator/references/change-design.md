# Braincrawl change-design composition

Status: evolving authoring convention, not a registered parser recipe. Representative input: `braincrawl-stem-client-design/.luminous/artifacts/09-cli-docshop/design-v2.md`.

## User-supported requirements

- The change-design artifact composes other recipes rather than requiring one monolithic recipe.
- It begins with a lifecycle flowchart/state graph, followed by the CLI subcommand tree, necessary API endpoints, and code changes in CLI/API.
- The file-change view groups code by ownership using the accepted code-plan conventions and shared new/additive/modified/removed badges.
- Types support progressive disclosure using nested schema cards.
- A testing-strategy diagram appears at the bottom and answers what apparatus and additions to the testing library establish intended end-to-end behavior.
- Record user steering and reuse accepted artifact conventions so artifacts improve across iterations.

## Composition

1. Lifecycle: use an ordinary flowchart/state graph; distinguish user actions, intermediate states and internal completion boundaries.
2. CLI/API trees: reuse REST API Tree layout where useful; command trees show subcommands and options, not HTTP verb badges for commands.
3. Code plan: reuse the file-change ownership projection in control-tree-diagram.md and composable diff-language.md.
4. Types: reuse schema-diagram.md, source-backed definitions and expandable nested types.
5. Testing strategy: map outcomes to journey Actions/Queries/Assertions and the apparatus that executes them. Group reused tools separately from proposed additions; use shared change badges. Name concrete existing helper files and suggested new files. Explain what constitutes proof and what fixture setup does not prove.

## Testing view authoring guidance

Use fresh-account real-stack journeys for CLI-to-Web interoperability, compiled binaries and isolated credentials. Reuse build artifacts and existing enrollment/auth/storage coverage. Put validation/conflict combinatorics at cheaper layers. Keep private sample documents as manual cases, with small deterministic fixtures for CI. These are recommendations for this composition, not a requirement to add E2E work to every design task. Clearly label planned tests versus executed evidence.

Maintain shared book/work/resource IDs across views where they refer to the same concept. Source links and repository-relative paths expose grounding without filling every Card with prose. Generation validates supported metadata/component shapes, not product correctness or cross-view semantic consistency.

For standardized view titles and reusable specification composition, see [Spec Artifacts](spec-artifacts.md). Use **Code Changes** and **Test Changes** as the corresponding diagram titles; put scope and rationale in their content.

Spec Artifacts always end with exhaustive **Code Changes** and then **Test Changes** views for the stated scope. Place lifecycle, API and type explanations before these final inventories.
