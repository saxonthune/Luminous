---
title: Glossary
summary: Nylon's controlled vocabulary for Nodes, Arcs, containment, differentiation, Standard View, Continuous View, and Tabs
tags: [nylon, glossary, vocabulary, nodes, arcs, transformations, contracts, views, tabs]
deps: [doc01.12.02]
---

# Glossary

Nylon docs use these terms exactly.

## Document

- **Document** — the persisted Nylon design in a `*.nylon.json` file.
  - A Document holds Nodes and Arcs.

- **Doctor** — a whole-Document repair that restores unambiguous Nylon
  invariants after direct file editing.
  - Doctor reports every repair it applies.
  - Doctor does not arrange valid Nodes or guess between ambiguous meanings.

## Network

- **Action** — a request to change a Document, executed identically for UI,
  CLI, and API callers.
  - An Action identifies its origin, its unique action ID, and its base Revision.
  - A batch is one Action containing ordered operations.

- **Revision** — an identifier for the Document state against which an Action
  is prepared. A changed Document receives a new Revision.

- **History** — the bounded sequence of committed Document changes available
  for undo and redo during a session.
  - History belongs to one Document and is shared by its callers in server mode.
  - Undo restores the state before a change; redo restores its recorded result.
  - A direct file edit clears History.

- **Node** — a positioned participant in a Nylon network.
  - Every Node is exactly one of: Transformation, Contract.
  - A Node may belong to one Parent Transformation.

- Each **Transformation** is a Node that changes data, explained by a name, prose,
  and an informal list of the data it needs.
  - Continuous View draws a leaf Transformation as a square.
  - Standard View draws a Transformation as a card with its responsibility
    and a schematic when it contains Children.
  - A Transformation can contain Transformations and Contracts after it is
    differentiated.

- Each **Contract** is a Node that states the data available between
  Transformations.
  - A Contract carries freeform multiline text.
  - A Contract is drawn as an oval or a box with strongly rounded corners.
  - Not: "Place".

- **Contract Kind** — an optional open-vocabulary label that distinguishes a
  Contract's role without changing the Contract–Transformation alternation.
  - An `environment-settings` Contract states configuration supplied by an
    external environment or configuration provider.
  - An `options` Contract states typed application configuration available for
    dependency injection.

- **Contract Pair** — the boundary that states which input type a
  Transformation changes into which output type.
  - A Contract Pair belongs to one Transformation.
  - A Contract Pair holds one Input Contract and one Output Contract.
  - Both Contracts in a Contract Pair belong to the same coordinate space.
  - The Contract Nodes remain endpoints of Arcs.
  - Moving a Contract Pair moves both of its Contracts as one object.

- Each **Input Contract** is the Contract that supplies the input type of one
  Contract Pair.

- Each **Output Contract** is the Contract that supplies the output type of one
  Contract Pair.

- **Arc** — a directed connection between one Contract and one Transformation.
  - Every Arc has exactly one Contract end and one Transformation end.
  - Not: "Flow".

- **Ghost Node** — a view-only stand-in that keeps a relevant off-screen Node
  visible at the edge of the viewport.
  - A Ghost Node identifies one existing Node without adding a Node to the
    Document.
  - Activating a Ghost Node navigates to the Node it identifies.

## Structure

- **Differentiation** — replacing one Transformation's role in a path with a
  nested alternating network that explains the same behavior in more detail.
  - Differentiation preserves the incoming and outgoing Contracts of the
    Transformation.
  - The smallest Differentiation adds two child Transformations and one Contract
    between them.
  - Differentiation preserves the Parent Transformation's Contract Pair as the
    boundary of the expanded detail.

- **Parent Transformation** — the Transformation whose differentiated detail
  contains other Transformations and Contracts.
  - In Continuous View, every Parent Transformation is exactly one of:
    expanded, covered, collapsed.
  - An expanded Parent Transformation shows its Children according to their
    individual states.
  - A covered Parent Transformation hides its descendants and retains its
    expanded bounds.
  - A collapsed Parent Transformation hides its descendants in a compact container.

- **Cover** — hiding an expanded Parent Transformation's descendants without
  changing its container size or any Node's position.
  - Expand reveals a covered Parent Transformation's content.
  - Cover and collapse preserve each descendant's individual state.

- **Child** — a Transformation or Contract contained by one Parent
  Transformation.

- **Depth** — the number of Parent Transformations that contain a Node.
  - A root Node has depth zero.
  - A Child has a greater depth than its Parent Transformation.

- **Relative Zoom** — the ratio between a Node's rendered footprint and the
  canvas viewport.
  - Relative Zoom is derived from the camera, Node bounds, and viewport bounds.
  - Depth does not scale Node geometry.

- **Reparenting** — changing the Parent Transformation that contains a Node.
  - Reparenting preserves the Node's rendered canvas position by translating
    its stored coordinates into the new Parent Transformation's coordinate
    space.

- **Arc Insertion** — replacing one Arc with an alternating path through new
  Nodes.
  - Each new Node accepts canvas coordinates.
  - insertion parent := the Parent Transformation of the deeper endpoint Node.
  - If both endpoint Nodes have the same depth and different parents, the
    caller supplies the insertion parent.

- **Partial Order** — the ordering imposed by data dependencies while leaving
  unrelated Transformations independent.

- **Fan-out** — one Contract supplying data to multiple independent
  Transformations.

- **Fan-in** — one Transformation requiring the Contracts produced by multiple
  branches.

- Each **Entry Transformation** is a Child Transformation that receives or
  prepares an input of its Parent Transformation.

- Each **Exit Transformation** is a Child Transformation that produces an
  output promised by its Parent Transformation.

## Views and navigation

- **View** — a representation of Nodes and Arcs from one Document for
  understanding part or all of its network.
  - A View refers to existing Nodes and Arcs without copying their meaning.
  - Node positions belong to the Document and are shared by its Views.

- Each **Continuous View** is a View that shows nested Parent Transformations
  with individual expand, collapse, and Cover states.
  - Continuous View is deprecated and remains available as the first Tab.

- Each **Standard View** is a View that shows the immediate Children of one
  Focus Transformation and the endpoints of Arcs crossing its boundary.
  - A Standard View at the Document root shows root Nodes.
  - Child Parent Transformations show an Open contents control in place of
    disclosure controls, including those containing only Contracts.
  - Arcs attached to hidden descendants appear at their visible Child ancestor.
  - Standard View preserves the Document's bipartite structure and
    Differentiation rules.

- **Focus Transformation** — the Transformation whose detail a Standard View
  presents.
  - Its ancestry provides navigation to containing Transformations.

- **Context Node** — a representation of an existing Node outside the focused
  detail that explains an Arc crossing the Focus Transformation's boundary.
  - A Context Node exposes its Node's identity and data.
  - Its other connections do not add further Context Nodes.

- **Tab** — an open View that retains a working context while another View
  is active.
  - A Tab retains its camera and selection, and its Continuous View disclosure.
  - Tabs share Document changes and History.
  - Each Tab owns its camera independently of other Tabs.
  - Each Document source retains its Tabs for the browser tab's session,
    including hot reloads and page refreshes.
