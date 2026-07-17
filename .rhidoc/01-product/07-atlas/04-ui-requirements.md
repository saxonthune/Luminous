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
| Node | left click + drag | Move the Node | R1 |
| Node | drag into a Container | Add the Node to the Container | R4 |
| Node | drag out of a Container | Remove the Node from the Container | R4 |
| Node | Ctrl + drag out of a Container | Expand the Container's boundary to contain the Node being moved | R5 |
| Node | double left click | Enter edit mode: name input, Content as a raw text area | R7, R8 |
| Node in edit mode | Ctrl+Enter, or blur | Commit the edits to the Document | R7 |
| Node in edit mode | Esc | Cancel the edits | R7 |
| Node switcher | left click | Switch the Node's Content Mode between markdown and code | R10 |
| Node | right click | Open the context menu | R15 |
| Container | right click | Open the context menu | R15 |
| Context menu Color option | hover | Open the Swatch submenu | R16, R17 |
| Swatch | hover | Draw the Node in that Swatch's Color, discarding it on leave | R18 |
| Swatch | left click | Set the Node's Color to that Swatch's Color | R19 |
