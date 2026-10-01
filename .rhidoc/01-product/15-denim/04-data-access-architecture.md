---
title: Data Access Architecture
summary: Denim separates SQLite access from canvas components through a per-database session that owns view state, edits, and saving.
tags: [denim, architecture, sqlite, components, testing, state]
deps: [doc01.15.01, doc01.15.02]
---

# Data Access Architecture

## Separation

- The `@luminous/core/denim` database module owns sql.js initialization, schema,
  queries, and database mutations. It has no Solid components or canvas state.
- Each open database has one client-side session. The session owns the database
  handle, collection of Tab Views, active Tab View, reactive projection, and
  file-save state.
- A Tab View is a workspace document, not a query result. Its persisted JSON
  payload can contain multiple source descriptors, independently included Node
  IDs, and per-Tab node positions. The SQLite table stores the payload as opaque
  JSON so the workspace document can change without changing the table schema.
- The current source descriptors are query recipes for Journeys, Capabilities,
  Resources, or one Journey. The session composes all sources with included
  Nodes by ID, then refreshes source results after graph edits. Future workspace
  shapes can replace or extend these descriptors without changing the session's
  database storage boundary.
- The three pinned views have fixed source definitions in code. Their included
  Nodes and positions are persisted as workspace state. Journey Tabs have
  unique identities, even when they open the same Journey.
- The active Tab ID and each Tab's camera are kept in browser session storage
  per database. Workspace content and per-Tab node positions live in SQLite
  with the authored graph; camera movement does not trigger a database-file
  save.
- The session loads the projection for the active Tab View. Node components
  receive node data as props and report user actions to the session; they do not
  query the database.
- Solid context provides the session to the active canvas subtree. Components
  use props for node-specific data and context for shared editing actions.

This keeps SQL access out of rendering components and gives one place to
coordinate a database edit with the visible canvas state.

## Changes and saving

- Creating a child inserts its node and parent-child edge in one SQLite
  transaction. Connecting an existing node inserts only the edge.
- Including a Node in a Tab View updates that Tab View's membership without
  changing graph edges. Dragging a Node saves its position in the active Tab
  View, so another Tab View can arrange the same Node independently.
- After a transaction, the session re-runs the active view query and updates
  its reactive projection from the database.
- The session serializes database-file saves. A failed save leaves the in-memory
  edit visible and marks the database unsaved so the user can retry.
- A file revision guards writes when more than one editor can change the same
  database. A revision mismatch is a conflict; the session does not silently
  replace newer file contents.

## Testing

- Canvas component tests provide a fake session through the same Solid context
  used by the app. The fake supplies view state, records requested actions, and
  can return save errors without opening SQLite or contacting the server.
- Session tests use an in-memory sql.js database and a fake file saver to check
  query refresh, atomic edits, and save ordering.
- Database-module tests use an in-memory database to check SQL behavior and
  serialization separately from the canvas.
