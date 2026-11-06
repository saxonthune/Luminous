# Schema diagram: experimental convention

Use this convention to explain a data contract and a proposed change before implementation. It is not an implemented or validated Portable Recipe.

## User-supported requirements

- Describe the contents of records such as a Commentary unit and a generation.
- Support a comparison that visualizes additions and other changes to a schema.
- Make the schema colorful, using color in the component body to distinguish field types.
- Use spacing to make fields easy to scan, potentially with one line per field.
- Make domain-specific field types understandable to the reader; keep explanations restrained. A configurable type registry with tooltips is one possible approach, not a required implementation.
- Make relationships and hierarchy readable without forcing a vertical pipeline; use owner containers or other useful context where appropriate.
- Prefer vertical content or an arrangement fitting the default canvas aspect ratio over a long horizontal diagram.
- Use node colors to distinguish their function. Type badges do not need a legend. Provide expandable descriptions of what schemas do.
- Show schema changes at both record and field level. Use circular badge backgrounds for change indicators.
- Indent fields beneath the schema's code name, and make the schema's purpose intelligible to a reader unfamiliar with implementation terminology.
- When two schema cards are visible in the default layout and a field refers to the other card, always show a dashed connection and do not offer expand/collapse for that field.
- When a control-flow spine has related schema cards in its default layout, the layout should try to place them on the same side of the spine.
- Provide type cards for missing types in the current artifact.

## Draft convention and present limitations

Use `schema-card`: one component per record, with a structured `fields` list. Each row has a nonempty `name`, displayed `type`, and a `kind` from `identifier`, `number`, `text`, `object`, `collection`, `choice`, or `reference`; `optional: true` adds `?` to the name. Optional `diff` marks the individual field, independently of the record's Card-level diff. The component colors type badges and retains text labels. Fields are rows inside a single component, not separate graph nodes. Use `info` and `portable-info` for expandable explanations. The parser validates input shape and uniqueness, but does not validate schema semantics or infer relationships.

Use real declared type expressions or schema names for field types, grounded in the source; put explanatory prose in descriptions, never in a type badge. For proposed types, develop a concrete, reviewable shape with plausible field types and clearly identify it as a design choice, not existing code. Avoid `unknown` as a substitute for doing the design work; retain an explicit open question only when a meaningful choice cannot yet be made. Make named types inspectable using source-backed expandable definitions. A field may include `schema`, a nested `schema-card` definition. Activating that field reveals its type as a connected card; activating it again hides the branch, and Reset layout collapses all expansions. Nested cards open outward from the control spine on the root attachment side and avoid existing cards. Define each expandable type explicitly; this does not discover or validate source types automatically. Extended Info remains available for contextual prose. A reusable configurable type-tooltip registry remains an option for future exploration; it is not implemented.
The optional `description` is a short, always-visible explanation of the schema's role. Use actual code names when they exist; label proposed names and unnamed nested objects accurately.

- Show each meaningful record or nested object as a Card with a stable title and concise fields, types, optionality, and purpose where known. Distinguish an actual persisted representation from a resolved or derived view.
- Connect containment and references, labeling relationships or cardinality only when evidence supports them. Preserve identities in current and proposed diagrams; use shared diff badges to show additions and modifications. Show removals with the removed change badge.
- Ground current fields in source contracts, state uncertainty and omissions, and mark proposed fields, relationships, alternatives and migration effects as proposals. Do not imply a new field is necessary merely because it appears in an example.
- A schema view explains structure, not execution order. Keep field detail readable, use legends for semantic kinds and changes, and avoid claiming the generator validated schema semantics.

## Expandable schema field

```yaml
- name: book
  type: Book
  kind: object
  schema:
    component: schema-card
    title: Book
    description: Prepared source document.
    fields:
      - { name: title, type: string, kind: text }
```

A nested field may itself declare a `schema`. Only fields with an authored schema are interactive. The current edge connects cards, not individual field ports; positioning avoids overlaps by shifting the expanded card vertically, without globally relaying existing cards.

The generator emits `schema/unresolved-type` warnings for non-primitive field type labels without an authored expandable schema, including nested definitions. The primitive whitelist covers basic scalars, literal unions and arrays; it is not a TypeScript resolver, so authors must interpret warnings and inspect source. Do not silence warnings by disguising a type as prose.

Do not use indexed-access expressions such as `Foo["bar"]` as displayed type labels. Name the referenced shape in plain code-like terms, provide an expandable definition, and explain when the name describes an inline shape rather than an exported type. Portable rejects indexed-access labels at generation time; ordinary array types such as `Page[]` remain valid.

Schemas that represent the same definition can share an explicit `schemaKey`. When both the referring and target cards appear in the default layout, a dashed edge is always visible and the field does not offer an expand/collapse control. The spine layout tries to place these related cards on the same side. For other references, expanding a field whose nested schema has that key links to an already visible matching card; otherwise one card opens, and later references link to it. Each field has an independent expansion edge; a shared card stays visible while reachable through another open reference. Keys are author-declared identities, not inferred from matching names. Reset removes expansion links.
