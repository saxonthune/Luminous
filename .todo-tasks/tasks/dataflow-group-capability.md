# Dataflow group capability: `group?: string` through core, schema, and MCP

## Motivation

A Group is the Dataflow Designer's simple visual grouping of Boxes
(doc01.05.03). The document format carries it as an optional `group` name on
a Box; Boxes sharing a name form the Group. Design: doc02.05.06 (clusters);
format: doc02.21. This phase adds the field end to end through the data
layer — no client changes.

## Do NOT

- Do NOT touch `packages/client` — projection and rendering are the next
  phase.
- Do NOT add a separate `groups` collection to the document format. The
  group name on the Box is the whole model (unfolding rule: a group earns
  its own record only when it needs more than a name).
- Do NOT make `group` participate in flow validation or `check` rules.
- Do NOT loosen `additionalProperties: false` anywhere in the schema
  sidecar.

## Plan

### 1. Core types and operations

In `packages/core/src/dataflow/`:

- `types.ts`: add `group?: string` to `DataflowBox`.
- `operations.ts`: `addBox` accepts an optional `group`; `setBox` can set
  and clear it (clearing = removing the property, consistent with how other
  optional props clear). `removeBox`/`connect`/`disconnect` unchanged.
- Tests (same file/pattern as existing operation tests): add a box with a
  group; set a group on an existing box; clear it; serialize→parse
  round-trip preserves it.

### 2. Schema sidecar and format doc

- `.rhidoc/02-design/21-dataflow-document.schema.json`: add `group`
  (type string, minLength 1) to the box properties. Keep required lists and
  `additionalProperties: false` as they are.
- `.rhidoc/02-design/21-dataflow-document-format.md`: add one invariant
  line: a Box optionally carries a Group name; Boxes sharing a name form a
  Group (doc01.05.03). Match the doc's existing terse invariant style. Run
  `rhidoc regenerate` after the edit.

### 3. MCP tools

In `packages/mcp` (dataflow tool group in `dataflow-tools.ts`, config in
`tools.config.ts`):

- `addBox` and the box-updating tool (`set`) accept an optional `group`
  string in their input schemas and pass it through to the core operations.
- Regenerate the bundle: `just mcp`.
- Extend the existing dataflow MCP tests to cover a group round-trip.

## Files to Modify

- `packages/core/src/dataflow/types.ts` — `group?: string`
- `packages/core/src/dataflow/operations.ts` — addBox/setBox handling
- core dataflow test file — group cases
- `.rhidoc/02-design/21-dataflow-document.schema.json` — box `group` property
- `.rhidoc/02-design/21-dataflow-document-format.md` — invariant line
- `packages/mcp/src/dataflow-tools.ts` (and tool schemas) — group passthrough
- MCP dataflow test file — group round-trip

## Verification

```bash
just test-core
just test-mcp
just typecheck
just lint
just build
```

## Out of Scope

- Client projection, cluster rendering, example documents — next phase.
- Group rename/membership UI (doc01.05.04 R11–R12) — future UI work.

## Notes

- The glossary (doc01.05.03) already defines Group; do not edit it.
- TypeScript types are the source of truth for the format; the sidecar is
  informative and updated to match (doc02.21).

## Surface after this phase

- `DataflowBox.group?: string` exported from `@luminous/core/dataflow`.
- `addBox(doc, {..., group?})` and `setBox` set/clear `group`; documents
  round-trip it through `parse`/`serialize`.
- The schema sidecar accepts `group` on a box.
- MCP `dataflow` tools `addBox`/`set` accept `group`.
- Negative space: `packages/client` untouched; `check` rules unchanged; no
  `groups` collection exists; flows and other box fields unchanged.
