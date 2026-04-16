---
title: API coverage workbench
status: draft
summary: Tri-layer canvas — OpenAPI controllers, JSON Schema aggregate, SQL tables — coverage edges reveal data-flow gaps
tags: [examples, openapi, json-schema, sql, coverage, gap-analysis]
deps: [doc01.02.08, doc01.02.09]
---

# Example: API coverage workbench

A team is designing the account-setup flow of a product. The user will write to several controllers (profile, contact, address, preferences), then submit to commit. The developers want to be sure that every required field in the `Account` aggregate is reachable through the API, and that every field the API accepts lands in a real column.

## User story

A backend engineer imports three artifacts — the `Account` JSON Schema, the OpenAPI spec, and the SQL DDL — and sees them rendered as three columns on one canvas. Individual properties, fields, and columns are each their own node. Edges express coverage (`api-field → schema-property`) and persistence (`schema-property → sql-column`). They walk the canvas, eyes on nodes with no incoming edges. Those are the gaps: fields nobody can fill, columns nobody populates, data the API validates but discards.

## Artifacts on the canvas

**Three columns, three layers:**

- **Left — SQL layer.** One container per table (`profiles`, `contacts`, `addresses`, `preferences`), one nested node per column (`id`, `email`, `postal_code`, `created_at`...).
- **Middle — JSON Schema layer.** `Account` aggregate root containing one group per sub-schema, containing one node per property.
- **Right — OpenAPI layer.** One container per operation (`POST /profile`, `PUT /preferences`, `POST /account/submit`), one nested node per accepted field.

**Two edge kinds crossing layer boundaries:**

- `covers`: `api-field → schema-property` — "this input populates this field"
- `persists`: `schema-property → sql-column` — "this field lands in this column"

Plus, internal to the SQL layer: **FK edges** between columns describe the database graph itself.

## The value

One canvas answers five questions that normally require reading three artifacts in three editors:

1. *Is every required schema property reachable from some API operation?* — schema property with no incoming `covers` edge is a **dead schema field**.
2. *Does every API field land somewhere useful?* — API field with no outgoing `covers` edge is a **dead input**.
3. *Does every schema property reach the database?* — schema property with no outgoing `persists` is **ephemeral** (validates but forgets).
4. *Is every column reachable from some API chain?* — column with no incoming `persists` that isn't tagged system-managed is **unreachable**.
5. *For a given column, which API operations can write to it?* — traverse `sql-column ← persists ← schema-property ← covers ← api-field ← (parent) api-operation`.

Gaps are obvious because they are nodes without the edges they should have. Gap detection reduces to a one-pass edge-set query.

## Worked example on disk

`account-api-coverage.canvas.json` contains a minimal instance of the two outer layers (SQL omitted). Three deliberate gaps — `dateOfBirth`, `postalCode`, `timezone` — appear as schema-property nodes with no incoming `covers` edge.

## Features demanded

- **Per-canvas schema definition** — each layer needs its own node and edge types declared in the same canvas
- **Edge type constraints** — `acceptsSource` / `acceptsTarget` prevent miswiring `covers` vs `persists`
- **Arbitrary-depth nesting** — table → column, operation → field, aggregate → group → property
- **Freeform cross-nesting edges** — coverage and persistence jump containment freely
- **Stable IDs** — user-drawn `covers` edges must survive re-import when the source OpenAPI changes. Derive IDs from JSON Pointer paths or DDL `table.column`
- **Importer pipelines for each layer** — JSON Schema → nodes, OpenAPI → nodes, SQL DDL → nodes
- **Merge semantics** — re-running an importer must update existing nodes in place, not duplicate them
- **Gap query / diagnostic tool** — an MCP tool that filters nodes lacking expected edges, shown as a side panel or returned to an AI agent
- **Transform annotation on edges** — some `persists` edges carry transforms (hash, split, normalize); the edge needs a label or data slot
- **Multi-document compose** — the workbench canvas references three source documents; the canvas must be regeneratable from any subset without losing user annotations

## Variants worth considering

- **Two-layer subset.** Omit SQL when the team only cares about API ↔ schema coverage.
- **Inverse direction.** For a schema-first design review, edges run `schema-property → api-field` expressing "this field *should be* exposed via."
- **Test coverage overlay.** A fourth edge kind `tests` from integration test cases to schema properties they exercise — same gap-query mechanic, different gauge.
