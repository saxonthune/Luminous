# Large source-backed module graph

Artifact: braincrawl-code-tree/.luminous/artifacts/12-source-code-tree/design.html.
User requested all source modules wired through function relationships, plus
separate adapters/tags for transport connections where required.

The 1015-module / 1222-edge first Mermaid block exceeded the parser's 50000-character
source limit. Generation rejected it and preserved the previous HTML. Compact
render-only IDs and placeholder topology labels solved the limit; actual Card
labels and canonical source identities remain derived from metadata. A regression
fixture checks a 1100-module topology. Do not shorten canonical source IDs or drop
modules just to fit a syntax parser limit.

Static call candidates and reviewed HTTP tags use different edge styles and retain
underlying function/source evidence. This is source-file aggregation, not proof of
runtime control flow or compiler-resolved Rust/TS calls. All modules fit poorly at
overview zoom; source-area containers and existing zoom/selection support inspection.
