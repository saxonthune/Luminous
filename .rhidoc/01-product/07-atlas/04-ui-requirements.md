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

A selection's **Roots** are the selected Nodes that have no selected ancestor.
A selection box swept over a Container usually also covers its Children, so a
selection often mixes depths; the Roots are the unit that commands act on —
a selected descendant is carried by its Root's subtree.

- **R33.** The system shall allow the user to select Nodes by dragging a selection
  box over them.
- **R34.** The system shall begin a selection box when the user presses the left
  button on the canvas background or on a Container's interior.
- **R35.** When the user presses the left button on the canvas background and
  releases without dragging, the system shall clear the selection.
- **R67.** When the user presses the left button on a selected Node, the system
  shall keep the selection, so that a drag moves the selection together; when
  that press ends without a drag, the system shall select only that Node.
- **R68.** The system shall not select a Node whose box contains the whole
  selection box, so that a selection box drawn inside a Container selects the
  Container's Children and not the Container.
- **R83.** When a Node has Children, the context menu shall offer a "Select all
  children" option, which replaces the selection with that Node's Children at
  depth 1 — the Children themselves, not their descendants and not the Node.

## Moving and resizing

- **R36.** The system shall move a Node when the user drags the Node's header or
  frame, and shall not move a Node when the user drags a Container's interior. A
  leaf Node has no Container, so the user may move it by dragging anywhere on it.
- **R69.** When the user drags a selected Node and the selection's Roots all
  share the same Parent, the system shall move every Root by the drag's
  offset. Moving the Roots, not every selected Node, is what keeps a group
  drag well-formed: a selected descendant travels inside its Root's subtree
  (moving it separately would shift it twice), no moved Node is another's
  ancestor, and one membership resolution (the shared Parent, R29's arrange
  rule) serves the whole group.
- **R70.** When a drag moves several Nodes (R69), the system shall apply the
  membership change (R4) and the position write to every moved Node together,
  and shall refuse the whole drop when it is refused for any moved Node.
- **R71.** When the selection's Roots do not all share the same Parent, a
  drag shall move only the dragged Node.
- **R37.** The system shall allow the user to resize a Node from its frame.
- **R38.** The system shall not allow the user to resize a Node smaller than the
  extent of its Children.
- **R39.** The system shall allow a Container to be sized larger than the extent of
  its Children.
- **R95.** When a change makes a Container's computed size smaller — a Child moves
  inward, shrinks, or leaves — the system shall keep the Container's current size,
  so a Container only ever grows to wrap its Children. Discarding the stored size
  (R73) remains the way back to the computed size.
- **R72.** When the user double clicks a resize grip on a leaf Node that has
  Content, the system shall size the Node on that grip's axes to fit its
  Content without scrolling, within fixed bounds, and shall grow the Node's
  ancestors to accommodate it. The fit is a one-shot command, not a standing
  constraint, and it overrides a user-set size on those axes.
- **R73.** When the user double clicks a resize grip on a Container or on a
  leaf Node without Content, the system shall discard the Node's stored size
  on that grip's axes, returning the Node to its computed size — a Container
  shrink-wraps its Children, a contentless leaf takes the default size.
- **R74.** When the user commits a Content edit on a leaf Node, the system
  shall set each axis with no user-set size to the fitted size of the new
  Content, and shall never change an axis the user has set.

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
- **R96.** The "Arrange as" submenu (R28) shall offer "Row", arranging the
  selection into a horizontal row the way Column arranges a vertical column.
- **R97.** The context menu for a Container with two or more Children, and the
  canvas background context menu, shall offer a "Remove Overlap" option.
- **R98.** When the user selects Remove Overlap, the system shall move overlapping
  sibling Nodes — the Container's Children, or the top-level Nodes for the
  background — apart until no two overlap, shall grow the Container when the
  spaced Nodes need more area, and shall leave a set with no overlaps unchanged.

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
- **R84.** When an Edge crosses containment, the system shall draw one continuous
  route through the relevant Container boundaries without adding derived Nodes or
  Edges to the Document.
- **R85.** While the user drags a Node, the system shall keep authored Edge
  routes fixed; when the drag ends, the system shall redraw those routes from
  the Nodes' resulting positions.
- **R86.** When an Edge crosses a Container boundary, the system shall draw its
  contained segment to the Port's inside face and its external segment from the
  Port's outside face, as specified by doc01.07.06.
- **R87.** The system shall allow the user to drag an Entry Port or Exit Port
  around its Container's perimeter.
- **R88.** When the user finishes dragging an Entry Port or Exit Port, the
  system shall save its side and normalized offset to the Document.
- **R89.** The system shall keep a Container's Entry Port and Exit Port visible,
  draw unused Ports faintly, and strengthen a Port while it is used, hovered,
  or dragged.
- **R90.** The system shall draw an inward chevron on an Entry Port and an
  outward chevron on an Exit Port.
- **R91.** When a Node's last Child leaves or is removed, the system shall
  remove the Node's stored Port positions.
- **R92.** The system shall draw each Port longer than it is thick, wide enough
  across the boundary to clasp the Container border, and orient its long axis
  along its Container side.
- **R93.** The system shall align the center of each Port to the center of its
  Container's bezel.
- **R94.** When a Node is selected, the system shall strengthen every Edge
  incident to that Node or any of its descendants, at any depth, and shall not
  add those descendants to the selection.

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

## Legend

A **Legend** assigns a **Label** to a Color Token, recording what each Color
means in this Document (e.g. red = user-facing interface, blue = data store).
The Legend is part of the Document, so an agent reads the same meanings the
user sees. The Legend opens in a floating panel — not a blocking modal — so the
user reads the Legend and the canvas together.

- **R57.** The system shall display an info control in the Atlas view.
- **R58.** When the user activates the info control, the system shall open the
  Legend panel, and the system shall allow the user to close it.
- **R59.** While the Legend panel is open, the system shall keep the canvas
  visible and interactive alongside the panel, and shall not blur or cover the
  canvas.
- **R60.** The Legend panel shall display every Color Token, drawing a Swatch
  of the Color beside its Label.
- **R66.** When a Color has no Label, the Legend panel shall show the Color
  with a clear indication that no Label is set.
- **R61.** The system shall store the Legend in the Document.
- **R62.** The Legend panel shall offer an edit control.
- **R63.** When the user activates the edit control, the system shall enter
  edit mode, offering a text input for every Color Token's Label, with a Save
  control and a Cancel control.
- **R64.** When the user activates the Save control, the system shall save the
  Labels to the Document and leave edit mode.
- **R65.** When the user activates the Cancel control, the system shall discard
  the edits and leave edit mode.

## Data File

A **Data File** is a sidecar beside the Document — `<name>.atlasdata.json` next to
`<name>.atlas.json` — holding a map from key to text. A Node's Content may name a
key. When the Data File provides that key, the Node draws the Data File's text and
the Content is **Filled**; otherwise the Node draws its own authored text, which
stands as the fallback. A script writes the Data File, extracting text from the
source a repository already holds, so Filled Content tracks that source. The
Document stays authored: a script fills Content and never adds, removes, or moves
a Node.

- **R75.** When a Node's Content names a key that the Data File provides, the
  system shall draw the Data File's text; when it does not, the system shall draw
  the Node's authored text.
- **R76.** The system shall draw Filled Content differently from authored Content,
  so the user tells generated text from written text without selecting the Node.
- **R77.** When a Node's Content names a key the Data File does not provide, the
  system shall indicate that the Node is drawing its authored fallback.
- **R78.** The system shall not allow the user to edit Filled Content, and shall
  show the key that fills it and the source the key was extracted from. A Node's
  Name and Mode stay editable, because both are authored.
- **R79.** When the Data File changes, the system shall redraw every Node whose
  Content is Filled, and shall not move the camera (R23).
- **R80.** When the Data File changes, the system shall discard the undo history.
- **R81.** The system shall not offer the Data File in the file selector.
- **R82.** When the system fits a Node to its Content (R72, R74), it shall fit to
  the text the Node draws, Filled or authored.

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
| Selected Node (Roots share one Parent) | left click + drag | Move every Root of the selection by the drag's offset, as one drop | R69, R70 |
| Selected Node (Roots at mixed Parents) | left click + drag | Move only the dragged Node | R71 |
| Selected Node | left click | Collapse the selection to that Node | R67 |
| Node frame | left click + drag | Resize the Node | R37, R38, R39 |
| Resize grip (edge or corner) | double left click | Fit the Node to its Content on that grip's axes; a Container or contentless leaf returns to its computed size | R72, R73 |
| Canvas background | left click + drag | Draw a selection box, selecting the Nodes it covers | R33, R34, R68 |
| Container interior | left click + drag | Draw a selection box, selecting the Nodes it covers | R33, R34, R68 |
| Canvas background | left click | Clear the selection | R35 |
| Canvas or Node | middle click + drag | Pan the camera | R41 |
| Canvas or Node | right click + drag | Pan the camera | R43 |
| Node | drag into a Container | Add the Node to the Container | R4 |
| Node | drag out of a Container | Remove the Node from the Container | R4 |
| Node | Ctrl + drag out of a Container | Expand the Container's boundary to contain the Node being moved | R5 |
| Node with authored Content | double left click | Enter edit mode: name input, Content as a raw text area | R7, R8 |
| Node with Filled Content | double left click | Enter edit mode with the Name editable and the Content read-only, showing the key that fills it and that key's source | R78 |
| Node with Filled Content | hover | Show the key that fills the Content and the source it was extracted from | R78 |
| Node in edit mode | Ctrl+Enter, or blur | Commit the edits to the Document; axes with no user-set size adopt the fitted size of the new Content | R7, R74 |
| Node in edit mode | Esc | Cancel the edits | R7 |
| Node switcher | left click | Switch the Node's Content Mode between markdown and code | R10 |
| Node | right click | Open the context menu | R15 |
| Container | right click | Open the context menu | R15 |
| Node selection (2+) | right click | Open the context menu with an "Arrange as" submenu | R15, R28 |
| Select all children (context menu) | left click | Replace the selection with the Node's Children at depth 1 | R83 |
| Arrange as ▸ Column | left click | Arrange the selected Nodes as a column, without overlapping other Nodes in the Container | R27, R28, R30 |
| Arrange as ▸ Row | left click | Arrange the selected Nodes as a row, without overlapping other Nodes in the Container | R27, R30, R96 |
| Remove Overlap (context menu) | left click | Push overlapping sibling Nodes apart until none overlap, growing the Container when needed | R97, R98 |
| Context menu Color option | hover | Open the Swatch submenu | R16, R17 |
| Swatch | hover | Draw the Node in that Swatch's Color, discarding it on leave | R18 |
| Swatch | left click | Set the Node's Color to that Swatch's Color | R19 |
| Delete (context menu) | left click | Remove the Node, its descendants, and their Edges | R53, R54 |
| Edge | right click | Open the context menu with a "Bisect" option | R32 |
| Port | left click + drag | Move the Port around its Container boundary and persist its placement | R87, R88 |
| Node | hover | Show the Node's Edge Tab | R44, R45 |
| Edge Tab | left click + drag | Draw a preview Edge; on release over a Node, create an Edge to it | R47, R49, R50, R51 |
| Edge Tab | left click | Begin Edge creation, drawing a preview Edge from the Node to the pointer | R48, R49, R50, R51 |
| Node (Edge preview active) | left click | Create an Edge from the source Node to this Node | R48 |
| Canvas or Container (Edge preview active) | Ctrl + left click or Ctrl + release | Create a new Node under the pointer and complete the Edge into it | R52 |
| Bisect (context menu) | left click | Bisect the Edge, inserting a new Node between its ends | R31 |
| Fit control | left click | Move the camera to frame every Node | R22 |
| Info control | left click | Open the Legend panel | R57, R58 |
| Legend close control | left click | Close the Legend panel | R58 |
| Legend edit control | left click | Enter Legend edit mode, turning Labels into inputs | R62, R63 |
| Legend Save control | left click | Save the Labels to the Document and leave edit mode | R64 |
| Legend Cancel control | left click | Discard the Label edits and leave edit mode | R65 |
