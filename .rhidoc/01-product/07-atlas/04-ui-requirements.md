---
title: UI requirements
summary: Atlas's UI capabilities as a controlled, EARS-like list of shall-statements, plus the input-command bindings table mapping each (target, interaction) pair to its command
tags: [atlas, ui, requirements]
deps: [doc01.07.01, doc01.07.03]
---

# UI requirements

Atlas's UI capabilities, written as a controlled list of EARS-style requirements
(Easy Approach to Requirements Syntax). Each requirement has a stable identifier
(R1, R2, …); identifiers are never reused once assigned. Capitalized terms —
Node, Container, Child, Parent — are the glossary terms (doc01.07.03).

## File selector view

> No requirements assigned yet.

## Atlas view

- **R1.** The system shall allow the user to drag Nodes.
- **R2.** The system shall allow the user to duplicate Nodes.
- **R3.** The system shall allow the user to add new Nodes.
- **R4.** The system shall allow the user to add a Node to a Container and to
  remove a Node from a Container.
- **R5.** When the user drags a Node out of a Container while holding Ctrl, the
  system shall expand the Container's boundary to contain the Node being moved.
- **R6.** While a drag will add a Node to or remove a Node from a Container, the
  system shall display a toast notification at the bottom of the screen saying so.
- **R7.** The system shall allow the user to edit a Node's contents.
- **R8.** The system shall allow the user to edit a Node's contents in the Node
  itself, and not in an inspector panel or a similar separate surface.
- **R9.** The system shall draw a Node's contents either as markdown or as code,
  drawing code monospaced.
- **R10.** The system shall offer a switcher on each Node that sets whether the
  Node's contents are drawn as markdown or as code.
- **R11.** The system shall save each Node's switcher setting to the Document, so
  that an agent can read the intention of the contents.
- **R12.** The system shall allow the user to change a Node's Color.
- **R13.** The system shall draw a Node in the Color the Node is set to, and shall
  draw that Node's Container in the same Color, drawing the Container lighter than
  the Node so the two are told apart.
- **R14.** The system shall set a Color from a fixed set of Color Tokens, and shall
  not offer the user an arbitrary color.
- **R15.** When the user right clicks a Node or a Container and releases without
  dragging, the system shall open a context menu.
- **R16.** The context menu shall offer a Color option.
- **R17.** When the user hovers the Color option, the system shall open a submenu of
  Swatches, laid out as two rows of Swatches.
- **R18.** While the user hovers a Swatch, the system shall draw the Node in that
  Swatch's Color, and shall discard that Color if the user does not select the
  Swatch.
- **R19.** When the user selects a Swatch, the system shall set the Node's Color to
  that Swatch's Color.
- **R40.** The system shall draw a Container as a box nested inside its Node — a
  component alongside the Node's title and contents — inset so a bezel separates
  the Node's edge from the Container's edge.
- **R42.** The system shall draw a space for Content on every Node, including a
  Node that has no Content, and shall allow the user to add Content to a Node that
  has none.
- **R53.** The context menu shall offer a Delete option.
- **R54.** When the user selects Delete, the system shall remove the Node, the
  Node's descendants, and every Edge that touches a removed Node.

## Selection

- **R33.** The system shall allow the user to select Nodes by dragging a selection
  box over them.
- **R34.** The system shall begin a selection box when the user presses the left
  button on the canvas background or on a Container's interior.
- **R35.** When the user presses the left button on the canvas background and
  releases without dragging, the system shall clear the selection.

## Moving and resizing

- **R36.** The system shall move a Node when the user drags the Node's header or
  frame, and shall not move a Node when the user drags a Container's interior. A
  leaf Node has no Container, so the user may move it by dragging anywhere on it.
- **R37.** The system shall allow the user to resize a Node from its frame.
- **R38.** The system shall not allow the user to resize a Node smaller than the
  extent of its Children.
- **R39.** The system shall allow a Container to be sized larger than the extent of
  its Children.

## UI chrome

- **R20.** The system shall display a toolbar in the Atlas view.
- **R21.** The toolbar shall offer a fit control.
- **R22.** When the user activates the fit control, the system shall move the camera
  to frame every Node.
- **R23.** The system shall move the camera only when the user pans, zooms, or
  activates the fit control, and shall not move the camera when the Document
  changes.
- **R41.** The system shall pan the camera on a middle-button drag.
- **R43.** The system shall pan the camera on a right-button drag, and shall open the
  context menu instead when the user releases the right button without dragging (R15,
  R32).

## Layout

Where a Node sits, and how the user controls it. A Node's position is either
computed for it or set by the user; a user-set position is kept in the Document.
An arrange command lets the user set several Nodes' positions at once.

- **R24.** The system shall allow the user to place a Node at a custom position,
  both for a top-level Node and for a Child within its Container.
- **R25.** When the user moves a Node, the system shall persist the Node's position
  to the Document, so the Node remains where it was placed when the Document is
  reloaded.
- **R26.** When a Node has no stored position, the system shall compute a position
  for it.
- **R27.** The system shall allow the user to arrange a selection of Nodes with a
  layout command.
- **R28.** The system shall offer the arrange command as an "Arrange as" submenu in
  the context menu, with "Column" as an option.
- **R29.** When the selected Nodes are not all in the same Container, the system
  shall disable the arrange command.
- **R30.** When the system arranges Nodes within a Container, it shall place them
  without overlapping other Nodes in the Container.

## Edges

An Edge connects one Node to another and carries no label. Where an Edge needs
explanation, the user bisects it, inserting a Node that carries the explanation
(doc01.07.03, Bisection). Containment, not an Edge, expresses that one Node
holds another: a Node and any of its ancestors are never also connected by an
Edge (R55, R56). Siblings, and any pair where neither contains the other, may
be connected.

- **R31.** The system shall allow the user to bisect an Edge, inserting a new Node
  between the Edge's two ends so that `A → B` becomes `A → N → B`.
- **R55.** The system shall not create an Edge between a Node and any of the
  Node's ancestors.
- **R56.** When adding a Node to a Container makes one Node an ancestor of
  another, the system shall remove any Edge between them.
- **R32.** When the user right-clicks an Edge, the system shall open a context menu
  with a "Bisect" option.

### Edge creation

An **Edge Tab** is the affordance for creating an Edge: a tab protruding from a
Node, shown on hover. Pressing or clicking it starts Edge creation; while Edge
creation is in progress, a preview Edge is drawn from the source Node to the
pointer.

- **R44.** The system shall draw an Edge Tab on each Node, protruding from the top
  of the Node's right side.
- **R45.** While the pointer hovers a Node, the system shall show the Node's Edge
  Tab; while the pointer does not hover the Node, the system shall hide it.
- **R46.** The Edge Tab shall carry a circular badge in the theme's green, bearing
  a plus mark in the theme's white.
- **R47.** When the user presses the left button on an Edge Tab, drags to another
  Node, and releases on it, the system shall create an Edge from the Edge Tab's
  Node to the Node under the release.
- **R48.** When the user clicks an Edge Tab and then clicks another Node, the
  system shall create an Edge from the Edge Tab's Node to the clicked Node.
- **R49.** While Edge creation is in progress, the system shall draw a preview
  Edge from the source Node to the pointer.
- **R50.** While a preview Edge is drawn, the system shall light up the Edge Tab
  to indicate the state.
- **R51.** While a preview Edge is drawn, the system shall display a toast
  notification (the R6 surface) saying what is happening.
- **R52.** While a preview Edge is drawn, when the user releases or clicks with
  Ctrl held, the system shall create a new Node at the pointer and complete the
  Edge into it — making the new Node a Child of the Container under the pointer,
  or a top-level Node when the pointer is not over a Container.

## Input-command bindings

An **input** is an ordered pair — a target and an interaction method (left click,
right click, double click, drag, a key). Each row binds one input to the command
it performs and the requirement it serves. Rows with `—` in the Req column are
baseline navigation or gaps with no assigned requirement yet.

A **click** is a press and release with no movement past a small drag threshold; a
**drag** is a press, movement past that threshold, then a release. A button's click
and its drag are therefore different inputs, bound to different commands: a right
click opens the context menu, while a right click + drag pans the camera. The same
holds for the left button — a left click clears the selection, a left click + drag
draws a selection box.

### File selector view

| Target | Interaction | Action | Req |
|---|---|---|---|

### Atlas view

| Target | Interaction | Action | Req |
|---|---|---|---|
| Node header or frame | left click + drag | Move the Node and persist its position | R1, R24, R25, R36 |
| Node frame | left click + drag | Resize the Node | R37, R38, R39 |
| Canvas background | left click + drag | Draw a selection box, selecting the Nodes it covers | R33, R34 |
| Container interior | left click + drag | Draw a selection box, selecting the Nodes it covers | R33, R34 |
| Canvas background | left click | Clear the selection | R35 |
| Canvas or Node | middle click + drag | Pan the camera | R41 |
| Canvas or Node | right click + drag | Pan the camera | R43 |
| Node | drag into a Container | Add the Node to the Container | R4 |
| Node | drag out of a Container | Remove the Node from the Container | R4 |
| Node | Ctrl + drag out of a Container | Expand the Container's boundary to contain the Node being moved | R5 |
| Node | double left click | Enter edit mode: name input, Content as a raw text area | R7, R8 |
| Node in edit mode | Ctrl+Enter, or blur | Commit the edits to the Document | R7 |
| Node in edit mode | Esc | Cancel the edits | R7 |
| Node switcher | left click | Switch the Node's Content Mode between markdown and code | R10 |
| Node | right click | Open the context menu | R15 |
| Container | right click | Open the context menu | R15 |
| Node selection (2+) | right click | Open the context menu with an "Arrange as" submenu | R15, R28 |
| Arrange as ▸ Column | left click | Arrange the selected Nodes as a column, without overlapping other Nodes in the Container | R27, R28, R30 |
| Context menu Color option | hover | Open the Swatch submenu | R16, R17 |
| Swatch | hover | Draw the Node in that Swatch's Color, discarding it on leave | R18 |
| Swatch | left click | Set the Node's Color to that Swatch's Color | R19 |
| Delete (context menu) | left click | Remove the Node, its descendants, and their Edges | R53, R54 |
| Edge | right click | Open the context menu with a "Bisect" option | R32 |
| Node | hover | Show the Node's Edge Tab | R44, R45 |
| Edge Tab | left click + drag | Draw a preview Edge; on release over a Node, create an Edge to it | R47, R49, R50, R51 |
| Edge Tab | left click | Begin Edge creation, drawing a preview Edge from the Node to the pointer | R48, R49, R50, R51 |
| Node (Edge preview active) | left click | Create an Edge from the source Node to this Node | R48 |
| Canvas or Container (Edge preview active) | Ctrl + left click or Ctrl + release | Create a new Node under the pointer and complete the Edge into it | R52 |
| Bisect (context menu) | left click | Bisect the Edge, inserting a new Node between its ends | R31 |
| Fit control | left click | Move the camera to frame every Node | R22 |
