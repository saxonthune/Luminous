---
title: Data Access Architecture
summary: Denim stores shared graph and regular Container identity in SQLite while each Board keeps its loaded Nodes and spatial arrangement.
tags: [denim, architecture, sqlite, components, testing, state, boards]
deps: [doc01.15.01, doc01.15.02]
---

# Data Access Architecture

## Separation

- The `@luminous/core/denim` database module owns sql.js initialization, schema,
  queries, and database mutations. It has no Solid components or canvas state.
- `denim_node_types` stores each type's stable ID, name, and visual theme slot.
  `@luminous/core/denim/node-types` is the shared source for default type names
  and theme slots. Hydrating a new project registers this full set before
  adding its starter graph, so the CLI and UI project creation paths share the
  same defaults. The CLI can also seed the shared defaults into an existing
  database without changing its graph.
  Existing Node rows continue to store the type name; opening an older database
  seeds the registry from the names already in use. Node creation ensures its
  type is registered, and renaming a type updates its Nodes in one transaction.
  The session reads the registry at startup and refreshes it after actions, so
  the type selector and Types page use database-backed values.
- Nodes and Edges keep UUID primary IDs and may also carry one nullable,
  unique `unique_key` string. The key lets generated or imported records keep
  their identity across refreshes without replacing their database IDs.
- `denim_containers` stores the durable identity of each regular Container and
  its owner Node. A regular Container has one owner; its member relationships
  remain `contains` Edges in the shared `edges` table. Deleting the owner also
  deletes its Container record and connected Edges.
- Each open database has one client-side session. The session owns the database
  handle, collection of Boards, active Board, reactive projection, and
  file-save state.
- A Board is a persistent document, not a query result. Its persisted JSON
  payload can contain multiple source descriptors, the exact loaded Node ID set,
  per-Board node positions, regular Container bounds, and sequence display
  settings. Container identity and membership remain shared database data;
  Boards store references to the Nodes they load and local Container bounds.
  The SQLite table stores the payload as opaque JSON so a Board can evolve
  without changing the table schema.
- The current source descriptors seed Boards from Journeys, Capabilities,
  Instances, or one Journey. Once seeded, the loaded Node ID set is authoritative
  until a load action changes it. Future Board
  shapes can replace or extend these descriptors without changing the session's
  database storage boundary.
- The three built-in Boards have fixed source definitions in code. Their
  loaded Nodes and positions are persisted as Board state after edits. Journey Boards have
  unique identities, even when they use the same Journey source.
- The active Board ID and each Board's camera are kept in browser session storage
  per database. Board content and per-Board node positions live in SQLite
  with the authored graph; camera movement does not trigger a database-file
  save.
- The session loads the projection for the active Board. Node components
  receive node data as props and report user actions to the session; they do not
  query the database.
- Solid context provides the session to the active canvas subtree. Components
  use props for node-specific data and context for shared editing actions.
- The Node Visibility Menu receives a query function from its caller. The
  caller chooses Board-wide, downstream, or Container-member data; the menu
  owns only text filtering and per-Node load/unload controls.

This keeps SQL access out of rendering components and gives one place to
coordinate a database edit with the visible canvas state.

## Actions

- A Denim action names a user intention, such as creating a child Node,
  changing a Node, or loading a Node onto a Board. It does not expose SQL or
  database bytes.
- The action API sits above the session. It receives the session as a
  dependency and exposes the actions that UI components can request.
- The session remains responsible for database access, view projection,
  reactive state, and saving. The action API delegates data changes to the
  session instead of duplicating those responsibilities.
- The UI turns an interaction into an action request. A CLI or server API can
  submit the same action vocabulary, so each entry point uses the same Denim
  operations and rules.
- Graph actions include `journey.create`, `node.create`, `node.upsert`,
  `node.differentiate`, `node.update`, `node.delete`, `edge.connect`,
  `edge.upsert`, `edge.delete`, `edge.priority.set`, `sequence.initialize`, and
  `sequence.clear`, `sequence.node.move`, `sequence.node.insertAfter`, plus
  `container.create`, `container.attach`, and `container.detach`. The upsert
  actions match on `unique_key`, preserve an
  existing UUID, and create a record when the key is new. `node.delete` names either `node` scope, which keeps
  descendants as independent Nodes on Boards where the deleted Node appeared,
  or `subtree` scope, which removes all descendants.
- Board actions are `board.read`, `board.openJourney`, `board.close`,
  `board.node.load.set`, `board.node.move`, `board.nodes.move`, and
  `board.sequenceMode.set`. `board.read` returns the Board definition and the
  graph produced from its loaded Nodes without changing the
  database.
- A database snapshot exposes its graph, shared Container records, and Boards
  so an agent can inspect the current design before submitting an action.
- The action catalog lists each operation and its required and optional
  fields. The CLI exposes the catalog, snapshot, and action request commands.
- `board.node.load.set` adds a Node to or removes it from a Board's exact loaded
  Node set. Loading a Node that owns a regular Container also ensures that
  Container has a Board-local placement. It reuses another Board's placement
  when available and derives a default placement otherwise. Loading or
  unloading never deletes shared graph data or Edges.
- Read queries are separate from mutation actions. `board.nodes.list` returns
  all Nodes with per-Board loaded state; `node.downstream.list`
  and `container.members.list` return direct relationship members with those
  same loaded state. Each result contains the Node plus a `loaded` boolean.
  `/api/denim/queries` exposes the query catalog and
  `/api/denim/query` runs a query for a database. The CLI exposes these as
  `just denim queries` and `just denim query <database> <query.json>`.
- Server action requests carry the database path and base revision. The server
  applies the action, saves with revision checking, and broadcasts the changed
  path so open Denim Boards can refresh.
- The app creates a session and its action API for each open database, then
  provides them to the active canvas subtree through Solid context.

This separates the meaning of an edit from the interface that requested it.
It lets the UI, CLI, and API share Denim actions while keeping database and
Board coordination in the session. Revision checks and change notifications
remain persistence and transport concerns; the action vocabulary alone does
not merge concurrent edits.

## Denim CLI

Run `just denim` to display Denim-specific command help. The `just denim`
recipe forwards to `scripts/luminous-cli.ts` and appears directly in `just --list`.

Commands such as `boards` and `journeys` read a local database file:

```sh
just denim boards .luminous/denim-starter.denim.sqlite
```

Commands such as `actions`, `queries`, `snapshot`, `query`, and `action` use
the storage server. The default server is `http://localhost:4080`; pass
`--server URL` to change it. For example:

```sh
just denim actions
just denim snapshot .luminous/denim-starter.denim.sqlite
  just denim action .luminous/denim-starter.denim.sqlite action.json
  just denim batch .luminous/denim-starter.denim.sqlite actions.json
```

The storage server applies `action.json` through the shared Denim action
executor and persists the database with revision checking. The browser UI
usually runs on port 5200; CLI server commands connect to the storage server,
not the browser client.

`batch` accepts an array of Denim actions in `actions.json` and submits them
as one revision-checked server request. The server applies every action before
writing the database, then broadcasts one change notification.

`just denim-dependencies <database> <board-id> <action-api-node-id> <query-api-node-id>`
reads the Denim action handlers and database module, then prints a batch-action
JSON plan for Module nodes and their read-helper dependencies. It matches
existing records by `unique_key`, adds missing container membership, and does
not submit the plan. Review the output before applying it with `just denim batch`.

## Changes and saving

- Creating a child inserts its node and parent-child edge in one SQLite
  transaction. Connecting an existing node inserts only the edge.
- `container.create` creates the shared regular Container record and saves
  its initial bounds on the active Board. Later Boards can show that same
  Container with independent bounds. The existing Container population controls
  continue to load member Nodes individually.
- Including a Node on a Board updates that Board's membership without changing
  graph edges. Dragging a Node saves its position on the active Board, so
  another Board can arrange the same Node independently.
- After a transaction, the session re-runs the active Board's queries and updates
  its reactive projection from the database.
- The session serializes database-file saves. A failed save leaves the in-memory
  edit visible and marks the database unsaved so the user can retry.
- A file revision guards writes when more than one editor can change the same
  database. A revision mismatch is a conflict; the session does not silently
  replace newer file contents.

## Testing

- Canvas component tests provide a fake session through the same Solid context
  used by the app. The fake supplies Board state, records requested actions, and
  can return save errors without opening SQLite or contacting the server.
- Session tests use an in-memory sql.js database and a fake file saver to check
  query refresh, atomic edits, and save ordering.
- Database-module tests use an in-memory database to check SQL behavior and
  serialization separately from the canvas.
