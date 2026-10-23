# Portable

Start with Solid and existing Luminous packages, especially cactus. Keep source data separate from transient layout and navigation state.

Read doc01.16 through `.rhidoc/MANIFEST.md` for product context.
Use glossary-feature-requirement to extract only user-supported glossary
concepts, features with user-oriented purposes, and requirements belonging to
declared features. Keep existing vocabulary untouched; do not invent terms or
retag existing entries. Put supported additions in Portable product docs, never
the handbook, and continue the requested work. Do not promote agent suggestions
to requirements without user evidence.

Keep reusable sample inputs in `examples/`, with private/ad-hoc material in
`examples/local/` (gitignored). Generated HTML belongs in `examples/generated/`
(gitignored) or an established preview path. Do not leave the only copy of an
input in `/tmp`. Include plain Markdown without Mermaid in the sample set.
