---
skill: luminous-dataflow
description: |
  Teaches an agent to author a *.dataflow.json Document for any repo — a dataflow
  design of Boxes and Flows viewable in Luminous's Dataflow Designer. Covers the
  document shape, the controlled vocabulary (Box, Flow, Description, Contract,
  Group), id derivation, the validation and check rules, the unfolding authoring
  method, and how to get the document rendered.
  Use when an agent needs to design a program as a dataflow diagram, or to record
  an existing system's data flow as design intention.
version: 1.0
author: Claude
tags: [luminous, dataflow, design, authoring, data]
---

# Luminous Dataflow Authoring

This skill equips an agent to write a `*.dataflow.json` Document for any repo — a dataflow design that Luminous's Dataflow Designer renders and edits. It is a plain data file; no Luminous code is changed.

## Routing Table

| File | Topic | When to use |
|------|-------|-------------|
| [dataflow-document.schema.json](dataflow-document.schema.json) | JSON Schema of the document shape | Validating output, or checking a field's exact type |
| [dataflow.example.json](dataflow.example.json) | Worked example — a bracket-game app with groups, contracts, sources, transforms, and views | Starting a new document or reviewing an existing one |

---

## What a Dataflow Document Is

A dataflow Document holds a design's *intention*: what the pieces of a system are, what data each holds or emits, and where the data moves. It is a design artifact, drawn before (or beside) the code — live code is compared against it, so drift between design and code is detectable by analysis rather than by rereading prose.

It is **not** the graph + pack model (that belongs to the `luminous-pipeline` skill). A dataflow Document has no pack, no kinds, no render templates, and no layout: Box and Flow are the whole vocabulary, and the viewer computes all positions.

## Vocabulary

Use these terms exactly:

- **Document** — one dataflow diagram as a file; holds Boxes and Flows.
- **Box** — one piece of the designed system, carrying the design's intention for that piece. Not "node" — a Box *renders as* a cactus node.
- **Flow** — a directed connection carrying data from one Box to another.
- **Description** — prose on a Box saying what it is and is for; the part of intention no Contract carries.
- **Contract** — the declared shape of a Box's data, in the notation the described system uses.
- **Group** — a simple visual grouping of Boxes.

Source, Transform, and View are ways of *speaking* about Boxes — data enters through a Source, a Transform makes new data from what flows into it, a View shows data to the end user. The schema enforces no role; there is no role field.

---

## Document Format

```jsonc
{
  "v": 1,                       // format version
  "boxes": [
    {
      "id": "enriched-data",    // stable for the life of the Document
      "name": "Enriched data",  // a domain term the rest of the design inherits
      "description": "Standings enriched with the team list into a display-ready model.",
      "contract": {             // optional, format-tagged
        "format": "prose",
        "text": "One entry per match: teams, result, round."
      },
      "group": "Transforms"     // optional; Boxes sharing a name form a Group
    }
  ],
  "flows": [
    { "from": "standings", "to": "enriched-data" }
  ]
}
```

### Field reference

Top level — all three fields required, no others allowed:

| Field | Type | Notes |
|-------|------|-------|
| `v` | integer | Format version; currently `1` |
| `boxes` | array | Box objects |
| `flows` | array | Flow objects |

Box:

| Field | Required | Notes |
|-------|----------|-------|
| `id` | yes | Stable string; see Id derivation below |
| `name` | yes | Human-readable domain term; unique across the Document |
| `description` | no | Markdown prose; rendered as markdown in the Box |
| `contract` | no | `{ "format": string, "text": string }` — both fields required |
| `group` | no | Non-empty string; Boxes with the same value render inside one labeled envelope |

Flow:

| Field | Required | Notes |
|-------|----------|-------|
| `from` | yes | `id` of an existing Box |
| `to` | yes | `id` of an existing Box |

The parser rejects unknown fields at every level. Do not add fields the schema does not name — there is no `x-` escape hatch.

### Contract formats

`format` is a free string that rendering and drift detection dispatch on. Use the notation the described system uses; established values: `prose`, `json-schema`, `yaml`, `typescript` (a class, trait, or interface definition).

### No layout

The Document stores no positions or sizes. The viewer lays the graph out so Flows run in one direction. Do not invent layout fields.

---

## Id Derivation

A Box's `id` is the kebab-case of its `name` at creation time, and **never changes afterward** — renaming a Box changes only its `name`. On collision, append `-2`, `-3`, ….

```
"Enriched data"  → "enriched-data"
"Team list"      → "team-list"
"Team list" (again) → "team-list-2"
```

Follow the same derivation when authoring by hand. Never use random UUIDs — stable ids make re-emitting the Document a diffable update, and Flows reference Boxes by id.

---

## Validation Rules

Errors (the document is rejected or flagged):

- unknown field at any level
- duplicate Box `id`
- duplicate Box `name`
- a Flow endpoint that names no Box
- a duplicate Flow (same `from` and `to`)

Warnings (structural smells; never block):

- a Box with no Flows at all (an orphan)
- a Box with inbound Flows and no outbound Flow (DFD's "black hole")

A finished design usually resolves its warnings — but a View legitimately has no outbound Flow only when nothing downstream consumes it, and the warning is tolerable there.

To validate outside Luminous: check the file against [dataflow-document.schema.json](dataflow-document.schema.json) with any JSON Schema validator, then check the cross-references the schema cannot express (unique ids, unique names, Flow endpoints exist, no duplicate Flows).

---

## Authoring Method — Unfolding Differentiation

Design proceeds by unfolding: start with the simplest diagram — one artifact fed by one source — and add Boxes only when the design demands them. The worked unfolding behind the example file:

1. A bracket of teams, fed by a JSON file of standings. Two Boxes, one Flow.
2. An enrichment step differentiates out between them; a team list joins the standings as a second source.
3. A scorer differentiates out between the bracket and the enriched standings; user brackets join as a third source.
4. Views differentiate out on the far side: a standings view, a bracket view, a leaderboard.

Guidance per field:

- **Name** — a domain term the rest of the design inherits. The user decides Names; an agent proposes, never coins. When a name feels wrong, raise it rather than silently renaming.
- **Description** — say what the Box is and is for, in plain prose. This is the intention no Contract carries; it is not a restatement of the name.
- **Contract** — add one when the data's shape is load-bearing (a consumer indexes into it, an encoding depends on field order, drift would be expensive). Leave it off while the shape is still fluid.
- **Group** — a visual aid, nothing more. Group Boxes that read as one region ("Static Files", "Views"); don't force every Box into a group.

---

## Viewing the Document

The Dataflow Designer lists every `*.dataflow.json` in the served workspace and live-reloads the open Document when the file changes — an agent's writes appear without a refresh.

- **In the Luminous repo**: write to `.canvases/`, run `just dev`, open the client, switch to the Dataflow app.
- **In another repo**: add the directory holding the Document to the `roots` array of Luminous's `luminous.config.json` (machine-local config, gitignored), then run `just dev` in the Luminous repo. Conventional location in a consumer repo: a `.canvases/` directory at the repo root.

## Two Write Paths

- **Direct file writes** — the Document is plain JSON; write the whole file. The right path for bulk authoring and for repos without a running Luminous.
- **MCP `dataflow` tool group** — when the Luminous MCP server is connected: `list` / `create` / `read` / `addBox` / `set` / `connect` / `disconnect` / `removeBox` / `check` / `batch`. Each verb validates before writing, `check` reports the rules above, and `batch` applies a sequence atomically. The right path for incremental edits against a live workspace. Compound gestures compose from the primitive verbs inside a `batch` — inserting a Box between two Boxes is addBox, connect twice, and disconnect.

## What This Skill Does NOT Cover

- **The graph + pack model** (`*.graph.json` + `*.pack.json`) — see the `luminous-pipeline` skill.
- **Drift detection** — comparing a Document against live code is its own effort; this skill only produces the design side.
- **Product code changes** — the output is data in the target repo; Luminous itself is unchanged.
