# Semantic legend validation

The privacy artifact included a blue inference-policy decision without explaining
its meaning in the legend. The author had also reused an API-contract style for a
decision. User requested extensible warning/error rules, Recipe-specific policies,
and generation rejection for missing legend meaning, independent of literal colors.

Implemented `portable-model`, vocabulary/presentation separation, per-canvas
`kinds`, kind legends and shared diff coverage. Architecture Recipe treats coverage
and untyped nodes/containers as errors. Parsing no longer computes layout; semantic
checks finish before projection/layout/bundling. Existing HTML survives rejection.

Migrated input: braincrawl-service-standardization/.luminous/service-standardization/
2026-10-22-browser-only-decryption.md. Generator: packages/portable/src/generate.ts.
The first generation rejected canvas-2 policy for missing kind:decision. Explicitly
adding that entry enabled successful generation of the existing /tmp HTML.
Type check passed; no browser interaction tests or automated regression suite run.

Metamodel and extension rules: references/metamodel.md. Limits: block-level source
locations, legacy inputs opt in, no CSS inspection or architectural truth checking.
Do not silently add legend entries before validation, since that hides omissions.
