---
title: Requirements
summary: Merino's capabilities as a controlled, EARS-like list of shall-statements, prefixed per section, plus an agent-capabilities section for MCP and the input-command bindings table
tags: [merino, ui, requirements, mcp]
deps: [doc01.10.01]
---

# Requirements

Merino's capabilities, written as a controlled list of EARS-style requirements
(Easy Approach to Requirements Syntax). Each requirement has a stable identifier
prefixed by its section — **C** for Canvas, **N** for Nodes, **E** for Edges,
**T** for Types, **M** for agent capabilities. Identifiers are never reused once
assigned. Capitalized terms — Node, Subnode, Edge, Node Type, Edge Type, Tab,
Container, Port — name Merino's constructs (doc01.10.01).

## Canvas

Merino is one Document with two Tabs. Both Tabs are the same node-and-edge
canvas with the same authoring vocabulary; they differ only in what the user
draws on them. Each Tab can be presented through more than one View. The Edit
View is the authoring canvas; the Overview View is reserved for a summary
presentation of the same Tab.

- **C1.** The system shall present two Tabs, Requirements and Deployments, and
  shall allow the user to switch between them.
- **C2.** In the Edit View, the system shall draw each Tab as the same
  node-and-edge canvas with the same authoring vocabulary.
- **C3.** The system shall store which Tab each Node and Edge belongs to in the
  Document.
- **C4.** The system shall allow the user to add a Node from the canvas
  background.
- **C5.** The system shall allow the user to pan and zoom the canvas.
- **C6.** The system shall allow the user to select one Node by clicking it and
  a collection of Nodes by dragging a marquee across the canvas background or a
  Container's empty interior — a drag begun over a Container's children area
  marquees rather than moving the Container. It shall select Nodes where the
  marquee is drawn under the current camera, and visibly distinguish selected
  Nodes and their incident Edges while leaving other Edges fully visible.
- **C7.** When the user drags a selected Node, the system shall move every
  selected Node by the same distance without moving a selected contained child
  a second time when its selected Container also moves.
- **C8.** The system shall preserve each open Document's viewport through
  Document updates, drag completion, and development reloads without writing
  the viewport to the Document.
- **C9.** The system shall draw a grid across the canvas background to make the
  workspace visible behind its Nodes and Edges.
- **C10.** When a Node has one or more outbound Edges, the system shall let the
  user center the viewport on a downstream Node without changing the current
  zoom level; where several downstream Nodes exist, it shall offer a list of
  their distinct destinations.
- **C11.** The system shall present an Overview/Edit View switcher beside the
  Requirements and Deployments Tabs, and shall allow the user to switch Views
  without writing the selected View to the Document.
- **C12.** The Edit View shall contain the existing node-and-edge authoring
  canvas.
- **C13.** On the Requirements Tab, the Overview View shall present the existing
  UI Transition Graph and Resources Nodes as light-background root
  Cards on a fixed-scale freeform canvas, without an outer section around either
  Card and without storing a separate overview projection in the Document. Each
  root Card's header shall show its title and Node Type, and its tall, vertically
  scrollable body shall list its direct children without losing its scroll
  position when the Card is moved. The user shall be able to resize any Card's
  child list vertically. Selecting any child shall open
  a darker-background Card to the right whose body lists its direct children or
  identifies that it has none. The open Cards shall remain transient UI state.
- **C14.** Each opened child Card in the Overview View shall show the first line
  of that Node's existing detail text in its header above its child count,
  or identify that no description exists. Clicking the description shall expand
  or collapse the full text without changing the Document. Double-clicking it
  shall open an inline editor for the same detail field used by the Edit View;
  leaving the editor or pressing the platform primary modifier with Enter shall
  save, and Escape shall cancel.
- **C15.** The Overview View shall allow the user to drag each Card freely while
  keeping the camera scale fixed. It shall connect every opened child Card's
  header to its parent Card's header with a dotted Bézier Edge. Selecting a
  different child shall close the replaced unpinned branch. The user shall be
  able to pin an opened Card so that Card and the ancestor chain needed to reach
  it remain open when another branch is selected; unpinning a Card that is not
  on the active branch shall close it unless a pinned descendant still requires
  it. Pin, position, disclosure, and camera state shall stay out of the
  Document; the system retains them for the browser tab's life (C24).
- **C16.** While the Overview View is active, the system shall present an
  In/Out zoom switcher beside the View switcher. The In level shall present the
  interactive Overview Cards. The Out level shall present the same disclosed
  Cards as substantially smaller, spatially compressed, read-only identities
  containing only each Node's legible title and Node Type. Switching levels
  shall preserve the point at the center of the viewport rather than resetting
  the camera. At the Out level, the user shall be able to pan
  the canvas and return to the In level, but shall not be able to open, move,
  resize, pin, or edit Cards. Changing levels shall preserve the transient
  disclosure and Card state and shall not change the Document.
- **C17.** In the Edit View, a Node's context menu shall allow the user to pin
  that Node to, or remove it from, the Requirements Overview root list by its
  stable Node identifier. The newly
  pinned root shall appear without closing or resetting existing Overview
  Cards. The ordered root list shall persist with the Document. A Document
  without a stored list shall use the product's default roots until the user
  first changes the list. A Node shall not appear twice, and deleting a pinned
  Node or its ancestor shall remove the deleted identifiers from the list.
- **C18.** In the Overview View at the In level, the system shall let the user
  edit a Card's title from its header — on a root Card and on an opened child
  Card — and shall write the change to the Node's name.
- **C19.** In the Overview View at the In level, the system shall let the user
  change a Card's Node Type from its header through a menu that shows every Node
  Type in its Color. When the Card's Node has children, the menu shall offer
  only Container Types as selectable and shall show the others disabled (N30).
- **C20.** In the Overview View at the In level, when a Card's Node Type is a
  Container, the system shall let the user add a child Node to that Card. The
  new child shall take its parent's Node Type, append to the parent (the next
  order in a list, a derived slot in a freeform Container), and open as a new
  Card.
- **C21.** In the Overview View at the In level, right-clicking a Card shall open
  a context menu whose Delete option names the Card's Node, and right-clicking
  one of its child-list rows shall open a context menu that names that row's Node
  and offers Clone (C22) and Delete. Deleting removes the named Node, its
  Subnodes, and every Edge that touches a removed Node (N7), and closes that
  Node's Card and every Card disclosed beneath it.
- **C22.** In the Overview View at the In level, cloning a child-list row's Node
  shall create a sibling Node under the same parent with the same Node Type and
  description, name the sibling from the row Node's name with " (copy N)"
  appended, copy none of the row Node's Subnodes, and open the sibling as a new
  Card.
- **C23.** In the Overview View at the In level, each child-list row shall show
  its Node's Type through the same Color menu the Card header uses (C19) and
  shall obey the same Container rule (N30).
- **C24.** The system shall retain, for the life of the browser tab and
  separately for each open Document, the selected Tab, the selected View, the
  Overview zoom level, the opened Overview Cards with their positions and pins,
  and each View's camera. Leaving Merino and returning, and a development
  reload, shall restore them. None of this is written to the Document.
- **C25.** The system shall offer the Manage types control in every View.

## Nodes

A Node is the unit the user places and types. A Subnode is a Node the user hangs
off another to carry more detail; it is joined to its parent by a dotted Edge.
Differentiation (doc01.10.01) has no control of its own — it is the practice of
adding Subnodes, and shows only as the dotted Edges they hang on.

A parent link is read three ways, decided by the parent's Node Type (T8). When
the parent's Type is a Container, the child sits inside the parent's box —
freely placed for a `container`, or stacked in an explicit order for a `list`.
When the parent is neither, the child hangs off it by the dotted Edge above. A
Container accepts a child of any Type — it never restricts which Types it holds.

- **N1.** The system shall allow the user to add a Node to the canvas.
- **N2.** The system shall allow the user to drag a Node.
- **N3.** The system shall allow the user to edit a Node's name and contents.
- **N4.** The system shall give each Node a Node Type, and shall draw the Node so
  its Type is legible — in its Type's Color.
- **N5.** When the user right-clicks a Node, the system shall open a context menu
  offering Copy, Paste, Add subnode, a Type submenu, and Delete; a Node with an
  outbound Edge shall also offer downstream navigation.
- **N6.** When the user adds a Subnode, the system shall create a child Node of
  the same Node Type as its parent, joined to its parent by a dotted Edge when
  the parent is not a Container.
- **N7.** When the user deletes a Node, the system shall remove the Node, its
  Subnodes, and every Edge that touches a removed Node.
- **N8.** The Node context menu's Type submenu shall list the Document's Node
  Types and an option to create a new Type; selecting a Type retypes the Node.
  A Type that N30 forbids for this Node shall be shown disabled.
- **N9.** The system shall allow the user to copy selected Nodes and paste them
  through the context menu or the platform primary copy and paste shortcuts. A
  paste shall create fresh Nodes, preserve copied parent links and Edges whose
  endpoints were copied, and select the pasted Nodes.
- **N10.** The system shall allow a Node of any Type to be a child of a Container
  Node, without restricting which Types a Container accepts. A contained child
  shares its Container's Tab.
- **N11.** The system shall draw a child of a Container Node inside the
  Container's box, and a child of a non-Container parent as a Subnode joined by a
  dotted Edge.
- **N12.** When the user drags a single Node onto a Container Node, the system
  shall make it a child of that Container; when the user drags it onto the canvas
  background, the system shall detach it to the top level.
- **N13.** When the user drags a Container Node, the system shall move its child
  Nodes with it.
- **N14.** While the user drags a Node, the system shall display a gesture-scoped
  indicator describing what releasing it would do — filing it into a Container,
  detaching it to the top level, moving it in place, or, over a list Container,
  the position it would take in that list.
- **N15.** The system shall draw a list Container's children as a vertical stack
  in an explicit order, and shall size the Container to fit the stacked children
  as their sizes change.
- **N16.** When the user drags a Node within a list Container, the system shall
  let the user reorder it, opening a gap at the slot under the pointer while the
  drag is in progress and committing the new order on release; when the user
  drags a Node onto a list Container, the system shall file it at that slot.
- **N17.** When a Node's details editor has focus, clicking outside it or
  pressing Escape shall blur the editor.
- **N18.** The system shall allow the user to resize a Container, keeping its
  box at least large enough for its children and their padding.
- **N19.** When a Container's child extent shrinks, the system shall keep the
  Container's current size until the user resizes it.
- **N20.** The system shall label a freeform Container "Freeform Container" and
  a list Container "List Container" inside its box, left-aligned above its
  children.
- **N21.** The system shall offer a Tidy control beside a freeform Container's
  label that pushes the Container's overlapping children apart until no two
  overlap, then grows the Container to fit them. A list Container has no Tidy
  control — it orders its children itself.
- **N22.** The system shall offer two Flow controls beside a freeform
  Container's label that arrange the Container's direct children into stacked
  ranks so that directed Edges flow one way — a downward control that stacks
  ranks top-to-bottom (the target of a directed Edge placed below its source)
  and a rightward control that stacks ranks left-to-right (the target placed
  right of its source). An Edge whose endpoints are nested deeper than the
  Container's direct children counts for the direct child each endpoint sits
  within, and an undirected Edge Type imposes no order. Children with no
  ordering Edge share the first rank. A list Container has no Flow control.
- **N23.** A Node with an outbound Edge shall show a downstream-navigation
  control. With one downstream Node it shall navigate directly; with several it
  shall also offer the downstream-destination list.
- **N24.** When the user zooms out, the system shall replace each Node's ordinary
  title presentation with a screen-readable overview identity containing its
  name and colored Node Type badge. It shall make identities of less deeply
  contained Nodes more prominent through size and surface tone; identities
  shall become slightly darker with containment depth. Containment depth and
  presentation shall be derived from the Document rather than stored in it.
- **N25.** When overview identities would overlap, the system shall first try
  nearby alternate positions around their Nodes, including positions within a
  bounded distance above them, and hide an identity when none is collision-free.
  It shall give less deeply contained Nodes priority and, at the same depth,
  give Containers priority over leaf Nodes. Within each top-level containment
  subtree, it shall show identities at a deeper level only when every identity
  at each shallower level is visible. During continuous zoom, visible identities
  shall retain their relative placement, identities shall not enter newly opened
  space, and an identity hidden by collision shall remain hidden until zoom
  settles. After zoom settles, the system shall reconcile placement while
  preferring identities and positions that were already visible.
- **N26.** The system shall tint a Container's child area with a faint wash of its
  Node Type's Color, so the Container's interior carries its Type identity beneath
  its children.
- **N27.** Before the overview presentation replaces ordinary Node content, the
  system shall keep each Node's title and Node Type badge readable as one bounded
  identity while the surrounding Node continues to scale geometrically and the
  identity's allocated header area remains useful on screen. The ordinary
  identity shall hand off as a unit when the overview identity becomes eligible.
- **N28.** As a Node's allocated areas become smaller on screen, the system shall
  counter-scale related controls as units and withdraw a unit when its area can
  no longer retain a useful screen size. It shall withdraw secondary detail and
  controls before Node identity. A resize-enabled Container whose projected
  geometry remains useful shall retain a screen-sized resize handle regardless
  of the camera's semantic viewing scale. Editing a detail body remains an
  editing-scale interaction.
- **N29.** At the structural and overview viewing scales, the system shall let
  the user focus a Node at an editing scale by double-clicking its visible
  identity or pressing Enter while it is selected. After such a focus, Escape
  shall restore the camera position and scale from before the first focus.
- **N30.** When a Node has children, the system shall not retype it to a Node
  Type that is not a Container. A list Container and a freeform Container remain
  interchangeable for such a Node. This holds wherever a Type is chosen — the
  Edit View Type submenu, the Overview View's Card-header and child-row Type
  menus, and an agent mutation.
## Edges

An Edge connects two Nodes and carries a user-managed Edge Type. The dotted Edge
of a Subnode (N6) is drawn by the system from the parent link, not authored as a
typed Edge.

- **E1.** The system shall draw an indicator on a Node from which the user starts
  an Edge.
- **E2.** When the user drags from a Node's indicator to another Node and
  releases, the system shall create an Edge between them.
- **E3.** The system shall give each Edge an Edge Type, and shall draw the Edge in
  its Type's style — Color, dash, and arrowhead.
- **E4.** The system shall allow the user to change an Edge's Type.
- **E5.** The system shall allow the user to delete an Edge.
- **E6.** When the user holds the platform primary modifier while releasing an
  in-progress Edge, the system shall create a new Node of the source Node's
  Type at the pointer and connect the Edge to it. When the release is over a
  Container, it shall file the new Node into that Container as a drag-drop would
  (N12); over the background, it shall leave the Node at the top level.
- **E7.** While an Edge is in progress, the system shall display a gesture-scoped
  indicator describing its current outcome, including the new-Node outcome when
  the platform primary modifier is held.
- **E8.** When an Edge crosses a Container's box, the system shall route it
  through boundary Ports on that box — one where it leaves the source side, one
  where it enters the destination side — so the crossing is legible rather than
  cutting straight through the box.
- **E9.** The system shall give each Container two boundary Ports, an entry and an
  exit, shared by every Edge crossing that Container, and shall let the user drag
  each Port to any side of the box. Absent a placement, the entry sits on the
  left and the exit on the right.
- **E10.** When an Edge targets a Container, the system shall route it through
  that Container's entry Port; when an Edge starts at a Container, the system
  shall route it through that Container's exit Port.
- **E11.** When several Edges cross the same Container Port, the system shall fan
  them out along that Port's side so they read as separate lines rather than
  converging on a single point.
- **E12.** When several Edges share a source group, a destination group, and an
  Edge Type — a group being the Nodes of one Node Type in one Container — the
  system shall consolidate them through their shared Container Ports into one
  trunk, frayed into a spoke to each member Node, rather than drawing a separate
  parallel line per Edge. Consolidation is derived from the Nodes and Edges, not
  stored.
- **E13.** When the user selects a Node, the system shall emphasize its incident
  Edges and dim unrelated Edges so the selected Node's relationships can be
  traced through the surrounding graph.
- **E14.** At the structural viewing scale, the system shall retain Edges as
  subdued relationship context and withdraw their labels. Selecting a Node
  shall restore the prominence and labels of its incident Edges. At the
  overview viewing scale, Edge lines shall become quieter but remain discernible
  as relationship structure, while detailed Edge labels remain withdrawn.

## Types

Node Types and Edge Types are user-managed sets kept in the Document. The common
act — picking or coining a Type while drawing — is a context-menu gesture, not a
modal; only editing the set as a whole opens a panel.

- **T1.** The system shall keep a registry of Node Types in the Document, seeded
  with a starter set: event, requirement, resource, and deployment.
- **T2.** The system shall allow the user to add a Node Type, change a Node Type's
  name and Color, and remove a Node Type.
- **T3.** The system shall keep a registry of Edge Types in the Document.
- **T4.** The system shall allow the user to add an Edge Type, set its style
  (Color, dash, arrowhead, and whether it is directed), change it, and remove it.
- **T5.** A Type submenu (N8, and the Edge context menu's Type submenu) shall
  offer an option to create a new Type and apply it to the Node or Edge in the
  same step.
- **T6.** When the user removes a Type that Nodes or Edges still use, the system
  shall require reassigning those Nodes or Edges to another Type first.
- **T7.** The system shall offer a Manage types panel listing the Document's Node
  Types and Edge Types, each editable, each with a control to remove it.
- **T8.** The system shall let the user set a Node Type's layout in the Manage
  types panel — to hold nothing (a leaf), a `container` (children freely placed),
  or a `list` (children stacked in order) — and clear it back to a leaf. A Node's
  Type being a Container is what makes the Node hold its children inside its box
  (N11), and its being a list is what orders them (N15).

## Agent capabilities (MCP)

Merino exposes an MCP tool group, the sibling of the other apps' groups. This
section states what an agent can do through it, not the individual verbs.

- **M1.** The system shall allow an agent to create a Merino Document and to read
  its Nodes, Edges, and Type registries.
- **M2.** The system shall allow an agent to add, rename, retype, reparent, and
  remove Nodes and Subnodes. A retype is subject to N30.
- **M3.** The system shall allow an agent to connect and disconnect Nodes with
  typed Edges, and to change an Edge's Type.
- **M4.** The system shall allow an agent to manage the Node Type and Edge Type
  registries — adding, changing, and removing Types.
- **M5.** The system shall allow an agent to validate a Document, reporting
  invariant breaks (an Edge naming a missing Node, a Node or Edge whose Type is
  not in the registry, duplicate identifiers) and structural smells that do not
  block a write.
- **M6.** The system shall allow an agent to apply a batch of mutations
  atomically, so a reader never sees a half-applied change.
- **M7.** The system shall route every agent mutation through the same write path
  the browser uses, so an agent's edits and the user's edits reach the Document
  the same way.
- **M8.** The system shall let an agent search Nodes and inspect a Node's
  descendants, incident Edges, or bounded Edge neighborhood without loading the
  complete Document.
- **M9.** When an agent batch fails, the system shall report the failing action's
  position and reason. A batch shall let a later action refer to an earlier
  action's explicit id by a local reference name.
- **M10.** The system shall store optional agent guidance on the Document, a
  Node Type, and an individual Node, and shall return it to an agent reading or
  editing the Document.
- **M11.** The system shall let an agent append a Node to a Container by intent,
  without supplying canvas coordinates; a list Container shall assign its next
  order and a freeform Container shall derive a local child position.

## Input-command bindings

An **input** is an ordered pair — a target and an interaction method (left click,
right click, double click, drag, a key). Each row binds one input to the command
it performs and the requirement it serves. Rows with `—` in the Req column are
baseline navigation with no assigned requirement yet.

| Target | Interaction | Action | Req |
|---|---|---|---|
| Tab (Requirements / Deployments) | left click | Switch to that Tab | C1 |
| View (Overview / Edit) | left click | Switch the current Tab's presentation | C11, C12 |
| Overview zoom (In / Out) | left click | Switch between the interactive Cards and read-only identity projection | C16 |
| Edit View Node | right click, then Pin to Overview | Persist the Node's stable identifier in the Requirements Overview root list | C17 |
| Edit View Node | right click, then Remove from Overview | Remove the Node's stable identifier from the Requirements Overview root list | C17 |
| Overview child | left click | Open the child as a Card to the right, including when it has no children | C13, C15 |
| Overview Card header | left click + drag | Move the Card on the freeform canvas | C15 |
| Overview Card bottom edge | left click + vertical drag | Resize the Card's child list vertically | C13 |
| Overview Card Pin / Pinned control | left click | Keep the Card open when its branch loses focus, or release it | C15 |
| Overview Card description | left click | Expand or collapse the full description | C14 |
| Overview Card description | double left click | Edit the Node's detail text inline | C14, N3 |
| Overview description editor | blur or Ctrl/Cmd+Enter | Save the Node's detail text | C14, N3 |
| Overview description editor | Escape | Cancel the in-progress edit | C14 |
| Overview Card title | double left click | Edit the Node's name inline; Enter or blur saves, Escape cancels | C18, N3 |
| Overview Card Type badge | left click | Open the Node Type menu, each Type shown in its Color | C19, N30 |
| Overview Card Add child control | left click | Add a child of the parent's Node Type and open its Card | C20, N6 |
| Overview Card | right click, then Delete | Delete the Card's Node and its subtree, closing the Card and its disclosed branch | C21, N7 |
| Overview child row | right click, then Clone | Duplicate the row's Node as a sibling and open its Card | C22 |
| Overview child row | right click, then Delete | Delete the row's Node and its subtree | C21, N7 |
| Overview child row Type badge | left click | Open the Node Type menu, each Type shown in its Color | C23, N30 |
| Canvas background | right click | Context menu: Add Node | C4, N1 |
| Canvas or Node | middle click + drag | Pan the camera | C5 |
| Canvas background | scroll wheel | Zoom the camera | C5 |
| Canvas background | left click + drag | Marquee-select intersecting Nodes | C6 |
| Node | left click | Select that Node | C6 |
| Node | left click + drag | Move the Node, or every selected Node when it belongs to the selection | N2, C7 |
| Container Node | left click + drag | Move the Container and its children together | N13, N2 |
| Node | left click + drag onto a Container Node | Make the Node a child of the Container | N12 |
| Node | left click + drag onto a list Container | File the Node into the list at the pointer's slot | N16 |
| Node (child of a list Container) | left click + drag within its list | Reorder the Node in the list | N16 |
| Node | left click + drag onto the canvas background | Detach the Node to the top level | N12 |
| Node identity (editing scale) | double left click | Edit the Node's name and contents | N3 |
| Node identity (structural or overview scale) | double left click | Focus the Node at editing scale | N29 |
| Selected Node | Enter | Focus the Node at editing scale | N29 |
| Canvas after Node focus | Escape | Restore the camera from before focus | N29 |
| Node details editor | click outside, or Escape | Blur the details editor | N17 |
| Container resize grip | left click + drag | Resize the Container without clipping its children | N18 |
| Tidy control (freeform Container label) | left click | Push the Container's overlapping children apart | N21 |
| Flow control (freeform Container label) | left click | Arrange the Container's children into rows so directed Edges flow downward | N22 |
| Downstream navigation control | left click | Center the viewport on the first downstream Node without changing zoom | C10, N23 |
| Downstream navigation chevron | hover | Open the list of downstream Nodes | C10, N23 |
| Downstream Node (list) | left click | Center the viewport on that downstream Node without changing zoom | C10 |
| Node | right click | Context menu: Copy, Paste, Add subnode, Type ▸, View Downstream Node ▸, Delete | N5, N9, C10 |
| View Downstream Node (context menu) | left click | Center the viewport on the first downstream Node without changing zoom | C10 |
| View Downstream Node chevron | hover | Open the list of downstream Nodes | C10 |
| Canvas background | right click | Context menu: Paste | N9 |
| Canvas | Ctrl/Cmd+C | Copy selected Nodes | N9 |
| Canvas | Ctrl/Cmd+V | Paste copied Nodes | N9 |
| Add subnode (context menu) | left click | Create a Subnode of the parent's Node Type, joined by a dotted Edge | N6 |
| Type ▸ (Node context menu) | hover | Open the Node Type submenu (Types + New type…) | N8, T5 |
| Node Type (submenu) | left click | Set the Node's Type | N8 |
| New type… (Node Type submenu) | left click | Create a Node Type and apply it to the Node | T2, T5 |
| Connection indicator | left click + drag | Draw a preview Edge; on release over a Node, create an Edge to it | E1, E2, E7 |
| In-progress Edge | hold Ctrl/Cmd and release | Create a same-Type Node at the pointer and connect the Edge | E6, E7 |
| Container boundary Port | left click + drag | Move the Port to another side or position on the box | E9 |
| Edge | right click | Context menu: Type ▸, Delete | E4, E5 |
| Type ▸ (Edge context menu) | hover | Open the Edge Type submenu (Types + New type…) | E4, T5 |
| Edge Type (submenu) | left click | Set the Edge's Type | E4 |
| Delete (context menu) | left click | Remove the Node (with its Subnodes and Edges) or the Edge | N7, E5 |
| Manage types control (any View) | left click | Open the Manage types panel | T7, C25 |
| Node Type layout select (Manage types) | change | Set the Node Type's layout — nothing, a container, or a list | T8 |
