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
- **R15.** When the user right clicks a Node or a Container, the system shall open a
  context menu.
- **R16.** The context menu shall offer a Color option.
- **R17.** When the user hovers the Color option, the system shall open a submenu of
  Swatches, laid out as two rows of Swatches.
- **R18.** While the user hovers a Swatch, the system shall draw the Node in that
  Swatch's Color, and shall discard that Color if the user does not select the
  Swatch.
- **R19.** When the user selects a Swatch, the system shall set the Node's Color to
  that Swatch's Color.

## UI chrome

- **R20.** The system shall display a toolbar in the Atlas view.
- **R21.** The toolbar shall offer a fit control.
- **R22.** When the user activates the fit control, the system shall move the camera
  to frame every Node.
- **R23.** The system shall move the camera only when the user pans, zooms, or
  activates the fit control, and shall not move the camera when the Document
  changes.

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
(doc01.07.03, Bisection).

- **R31.** The system shall allow the user to bisect an Edge, inserting a new Node
  between the Edge's two ends so that `A → B` becomes `A → N → B`.
- **R32.** When the user right-clicks an Edge, the system shall open a context menu
  with a "Bisect" option.

## Input-command bindings

An **input** is an ordered pair — a target and an interaction method (left click,
right click, double click, drag, a key). Each row binds one input to the command
it performs and the requirement it serves. Rows with `—` in the Req column are
baseline navigation or gaps with no assigned requirement yet.

### File selector view

| Target | Interaction | Action | Req |
|---|---|---|---|

### Atlas view

| Target | Interaction | Action | Req |
|---|---|---|---|
| Node | left click + drag | Move the Node and persist its position | R1, R24, R25 |
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
| Edge | right click | Open the context menu with a "Bisect" option | R32 |
| Bisect (context menu) | left click | Bisect the Edge, inserting a new Node between its ends | R31 |
| Fit control | left click | Move the camera to frame every Node | R22 |
