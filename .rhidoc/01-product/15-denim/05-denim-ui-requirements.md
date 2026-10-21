---
title: UI Requirements
summary: Denim's persistent Boards, tab navigation, toolbars, and node component behavior.
tags: [denim, ui, requirements, boards, toolbar, tabs, nodes, icons, dragging]
deps: [doc01.15.01, doc01.15.03]
---

# UI Requirements

These user-interface requirements capture Denim's current direction. `[p]`
means wording and placement are pending review. Identifiers are stable and
never reused. Requirement identifiers use a short prefix and local numbering
for each feature section. If a feature grows, split it into smaller,
hierarchically nested sections with their own prefixes and sequences instead of
extending one global counter.

## Boards and tabs

- **VT1.** [p] When the user opens a Journey, Denim creates a persistent Board for it and opens that Board in a tab.
- **VT2.** [p] The Board Strip shows user Boards; built-in Journeys, Capabilities, and Instances Boards are not toolbar buttons or tabs.
- **VT3.** [p] The user can open the same Journey in more than one independent Board.

## Project picker

- **PRJ1.** [p] The Denim database picker provides an icon button to create a new project in a listed root.
- **PRJ2.** [p] Creating a project creates a `.denim.sqlite` database, hydrates it with the starter Journey and User Action, and opens it.
- **PRJ3.** [p] Creating a project registers all default Node types, including types not used by the starter graph.

## Startup status

- **STA1.** [p] While Denim is starting or opening a database, a status label shows the current startup phase.
- **STA2.** [p] Denim provides elapsed timing for startup phases in development tools so slow phases can be diagnosed.

## Startup status

- **STA1.** [p] While Denim loads its database list or opens a database, a status label shows the current startup phase.
- **STA2.** [p] In development, Denim reports each startup phase's elapsed time to the browser console and performance timeline.

## Board content

- **TVC1.** [p] The user can pull additional Nodes onto a Board independently of the source queries that provide its initial content.

## App Toolbar

- **AT1.** [p] The Denim App Toolbar appears below the Luminous header bar.
- **AT2.** [p] The Denim App Toolbar remains visible at all times.
- **AT3.** [p] The Denim App Toolbar contains sections.
- **AT4.** [p] The Denim App Toolbar is square-cornered and fills the entire row across the user's viewport.

- **AT5.** [p] An Open User Journey icon opens a scrollable picker of all Journey Nodes, using their List Representations. Selecting a Journey creates and activates a new Board for it, even when another Board already shows that Journey.
- **AT6.** [p] When no user Board is open, Denim prompts the user to open a User Journey or create a New Board.

## Quick Select

- **QS1.** [p] Quick Select uses a general-menu icon and opens app-level actions, including New Board and Types.
- **QS2.** [p] Quick Select does not offer Journeys, Capabilities, or Instances category shortcuts.
- **QS3.** [p] For now, the user cannot add their own Boards to Quick Select.
- **QS4.** [p] Selecting Types in Quick Select opens and activates a Types tab in the Board Strip, reusing the existing Types tab if it is already open.
- **QS5.** [p] Selecting New Board in Quick Select creates a Board.

## Types page

- **TYP1.** [p] The Types page lists all Node types.
- **TYP2.** [p] The user can create and rename Node types from the Types page.
- **TYP3.** [p] The Journey Node type cannot be renamed from the UI.
- **TYP5.** [p] The Types tab groups its title, type list, and Create type button in a floating themed panel.
- **TYP6.** [p] The user can choose a shared theme color for each Node type from the Types tab. The choice is saved with the type and applies to its Nodes across Boards.
- **TYP4.** [p] The user can switch between the Types tab and Board tabs, navigate to it with the tab-strip keyboard controls, and close it. Closing the active Types tab returns to the previously active Board.

## Board Strip

- **TV1.** [p] The Board Strip is the second section in the Denim App Toolbar and shows open Boards as tabs.
- **TV2.** [p] When Boards overflow in the Board Strip, chevron icons let the user scroll left and right.
- **TV3.** [p] The user can scroll the Board Strip while the pointer is inside it.
- **TV4.** [p] When the user opens a Board without a saved camera, Denim fits its Nodes into the viewport.

## Board tab context menu

- **BCTX1.** [p] Right-clicking a Board tab opens its context menu.
- **BCTX2.** [p] The Board tab context menu offers Export, with Excalidraw as an export format.
- **BCTX3.** [p] Choosing Excalidraw downloads the selected Board's visible graph as an editable `.excalidraw` file.

## Board Toolbar

- **VWT1.** [p] The Board Toolbar contains actions relevant to the current Board.
- **VWT2.** [p] The canvas has no floating Add Journey button; users can create Journey Nodes through the Board Context Menu and type controls.
- **VWT3.** [p] The Board Toolbar has rounded corners and floats below the Denim App Toolbar, centered horizontally over the canvas.
- **VWT4.** [p] The Board Toolbar does not show the Add child node, Connect to node, or Query result buttons.
- **VWT5.** [p] Adding a Node to a Board is accessed through the Board Context Menu; the canvas has no floating Add Node button. The Board Toolbar is absent when it has no actions.

## Save status

- **SS1.** [p] Denim shows save status in a small round floating badge at the bottom-right of the canvas.
- **SS2.** [p] While changes are saving, the badge shows a spinning indicator icon.
- **SS3.** [p] When changes are saved, the badge shows a check icon.

## Status Toast

- **ST1.** [p] Denim shows a Status Toast immediately to the left of the save-status badge at the bottom-right of the canvas.
- **ST2.** [p] An in-progress action can provide its own label to the Status Toast.
- **ST3.** [p] While the user is differentiating to an existing Node and hovers a valid target, the Status Toast reads “Differentiating to "<truncated beginning of target text>" (<target type>)”.
- **ST4.** [p] The Status Toast is hidden when no action is in progress.

## Node appearance and movement

- **NODE1.** [p] The user can drag Nodes.
- **NODE2.** [p] Nodes have mild background shading based on their type so users can distinguish Node types at a glance.
- **NODE3.** [p] Each Node has a drag bar indicator on the same visual row as the Node type dropdown.
- **NODE4.** [p] The Node type dropdown occupies 80–90% of that row, with the drag bar right-justified.
- **NODE5.** [p] The user can drag a Node by dragging its drag bar or from its top padding.
- **NODE6.** [p] Each Node has a very thin greyish border.
- **NODE7.** [p] When the user differentiates a Node, Denim places the new Node below the parent Node.
- **NODE8.** [p] The drag bar indicator does not change appearance when the pointer hovers over it.
- **NODE9.** [p] When the user differentiates a Node, Denim shows the new Node at its final position below the parent without an intermediate layout position.
- **NODE10.** [p] A wheel gesture over overflowing Node text scrolls the text; when it cannot scroll in that direction, the gesture zooms the canvas.
- **NODE11.** [p] The Node type selector lists types from the database, including Module.
- **NODE12.** [p] Each Node has a dedicated Node Status Bar underneath its content area.
- **NODE13.** [p] The Node Status Bar shows the Node type label at the bottom-left and Node indicators at the bottom-right.
- **NODE14.** [p] The Node Status Bar sits close to the Node's bottom edge, with little empty space beneath it.
- **NODE15.** [p] When editing a Node's text, clicking outside the input or pressing Escape ends editing and saves the text.

## Selection

- **SEL1.** [p] Clicking the canvas background deselects all Nodes.
- **SEL2.** [p] Pressing Escape deselects all Nodes.
- **SEL3.** [p] Dragging across the canvas selects Nodes and Containers intersected by the selection box, including when the drag starts in a Container's content area.
- **SEL4.** [p] Dragging a selected Node moves all selected Nodes together.
- **SEL5.** [p] Dragging a selected Container moves all selected Containers together, along with each Container's visually contained Nodes and nested Containers.

## Graph Primitives

- **GP1.** [p] Every Graph Primitive can be toggled between Special Presentation and Graph Presentation.
- **GP2.** [p] The user can load the same Graph Primitive onto multiple Boards.
- **GP3.** [p] Each Board stores its own presentation mode for each Graph Primitive loaded onto it.

## Node Toolbar

- **NT1.** [p] Each Node has a Node Toolbar.
- **NT2.** [p] A Node Toolbar may provide different capabilities according to the Node's type, while all Nodes have the same minimal capabilities.
- **NT3.** [p] Node Toolbar affordances are represented by icons.
- **NT4.** [p] Always-visible Toolbar actions remain visible when the pointer is outside the component. Hovering the component reveals an ellipsis when hidden actions are available. Hovering any part of the Toolbar, including its always-visible actions or ellipsis, hides the ellipsis and expands the Toolbar to show the always-visible actions followed by the hidden actions; keyboard focus also provides access to hidden actions.
- **NT5.** [p] A Node Toolbar appears over the Node type label at the left of the Node Status Bar, vertically centered within that bar.
- **NT6.** [p] Present Node Toolbar actions appear first on the left. While the Toolbar is collapsed, an ellipsis marks the first hidden option; when expanded, hidden actions replace the ellipsis and continue to the right.
- **NT7.** [p] The hidden Node Toolbar options end with a trash icon for deleting the Node.
- **NT8.** [p] A Node Toolbar menu aligns its left edge with the triggering button when space permits and shifts as needed to remain inside the viewport.
- **NT9.** [p] A Node Toolbar has an opaque, rounded background using the white base token also used by sequence badges. A Container Toolbar matches its Container Node's type color. When a Node Toolbar expands, its background covers the full row of icons, including the trailing trash icon.
- **NT10.** [p] Hover highlights for individual Node and Container Toolbar icons are circular.
- **NT11.** [p] The hidden Node Toolbar options include a Change Node Type icon immediately before the Spawn Container icon.
- **NT12.** [p] A Node Toolbar is drawn above the full Node Status Bar, including its indicators and label.
- **NT13.** [p] The hidden Node Toolbar options include an action to create a Sequence Container.
- **NT14.** [p] A Node Toolbar may extend beyond the Node's boundaries so every action remains accessible.

## Node deletion

- **DEL1.** [p] Selecting the Node Toolbar trash icon opens a menu with “Delete Node” and “Delete Node and Children” options.
- **DEL2.** [p] Hovering over “Delete Node” opens a confirmation submenu to its right; the submenu stays open while the pointer moves into it.
- **DEL3.** [p] Hovering over “Delete Node and Children” opens a confirmation submenu to its right; the submenu stays open while the pointer moves into it.
- **DEL4.** [p] Confirming “Delete Node” removes only the selected Node and its incident Edges; its child Nodes remain and appear on the active Board as independent Nodes.
- **DEL5.** [p] Confirming “Delete Node and Children” removes the selected Node, all of its descendant Nodes, and their incident Edges.

## Edges

- **EDGE1.** [p] Left-clicking an Edge opens a floating menu below its midpoint with a trash icon and the label “Delete”.
- **EDGE2.** [p] Clicking “Delete” removes the Edge immediately and keeps its endpoint Nodes; this is the final confirmation action.
- **EDGE3.** [p] The Edge click target extends beyond the visible line, while Nodes remain on top and receive clicks where they overlap an Edge.
- **EDGE4.** [p] The user can draw a literal line between two Nodes to create an Edge of the literal-line type.
- **EDGE5.** [p] When an Edge connects to a Node in a Container, the portion inside the Container is visible above the Container background and below Nodes, while the Container header remains above the Edge.


## Containers

- **CNT1.** [p] When the user Ctrl-drags a Node into a Container, Denim creates a `contains` Edge from the Container's head Node to the dragged Node, replacing any existing `contains` Edge for that Node.
- **CNT2.** [p] A Node linked to a Container by a `contains` Edge is in the Contained visual state when its bounds touch or overlap the Container area; while the user drags the Container, each Node in this state moves visually with it, and Denim saves their final positions when the drag ends. A nested Container moves with its containing Container only when its own bounds touch or overlap the containing Container's content area, and nested movement propagates only through overlapping Containers.
- **CNT3.** [p] While the user Ctrl-drags a Node to change containment, the Status Toast describes the containment change in progress.
- **CNT4.** [p] Denim renders a Container's outer border using the same border as a Node.
- **CNT5.** [p] A Container's top border is taller than its other edges and can be dragged to move the Container.
- **CNT6.** [p] A dashed curved line connects a Container to the Node it represents.
- **CNT7.** [p] The user can spawn a Container from any Node's Node Toolbar.
- **CNT8.** [p] Spawn Container appears in the hidden Node Toolbar options before Sequence options.
- **CNT9.** [p] A Container's header separator uses the same border as its outer border.
- **CNT10.** [p] A Container header uses the same background color as its head Node.
- **CNT11.** [p] The Container label is right-justified in the header, and the Container Toolbar is left-justified in the header.
- **CNT12.** [p] The bottom-right corner of a Container's area has a resize handle; resizing changes the Container's saved Board bounds.
- **CNT13.** [p] A Node linked to a Container by a `contains` Edge enters the Detached visual state when its bounds no longer touch or overlap the Container area; the Node remains linked by the Edge and does not move with the Container.
- **CNT14.** [p] Denim draws a dotted curved Edge from a Container to each Detached Node linked to it by a `contains` Edge.
- **CNT15.** [p] Hovering over a dotted Edge shows a small badge at its midpoint and opens a fixed-screen Detached Edge Toolbar to its right; the toolbar matches Node and Container Toolbar sizing and stays the same size as the canvas zooms.
- **CNT16.** [p] The Detached Edge Toolbar contains a trash icon; selecting it reveals “Confirm Detachment”, and selecting that label removes the `contains` Edge while keeping the Node on its current Board at its current position.
- **CNT17.** [p] When a Container moves, each visually contained Node moves with it; any Container owned by those Nodes moves with them as well.
- **CNT18.** [p] Nested Containers alternate between the default surface and a slightly greyer surface.
- **CNT19.** [p] A dashed curved line connects a Container Node to its Container when both are nested inside another Container.
- **CNT20.** [p] A Container header label shows the first 16 characters of its owner Node's text followed by a “Container” badge, matching the Sequence Container badge styling.

## Container Toolbar

- **CTB1.** [p] A Container Toolbar is located at the left of the Container header, vertically centered in the header, and uses the Node Toolbar's present and hidden icon pattern.
- **CTB2.** [p] The first Container Toolbar icon is Create Node.
- **CTB3.** [p] When the user creates a Node from a Container Toolbar, Denim creates it inside that Container with the same type as the Container's owner Node.

## Board node visibility

- **VIS1.** [p] A Board stores the exact set of Nodes loaded into its projection, independently from other Boards.
- **VIS2.** [p] The user can load an individual Node onto or unload it from the active Board without deleting the Node or its Edges.
- **VIS3.** [p] A Container Population Indicator appears at the top-right of each Container header and shows `N/M` for Nodes linked by direct `contains` Edges that are loaded on the active Board / total; Nodes inside nested Containers are not included.
- **VIS4.** [p] The Container label is right-justified immediately to the left of the Container Population Indicator.
- **VIS5.** [p] Clicking the Container Population Indicator opens a placeholder Container Membership component containing only its label.
- **VIS6.** [p] A Downstream Nodes Indicator appears right-justified at the bottom-right of each Node Status Bar and shows `N/M` for direct downstream Nodes loaded on the active Board / total direct downstream Nodes. It uses the white base token also used by sequence badges.
- **VIS7.** [p] Clicking the Downstream Nodes Indicator opens a placeholder component containing only its label.
- **VIS8.** [p] The Node Visibility Menu lets the user load or unload Nodes individually on the active Board.
- **VIS9.** [p] Clicking a Container Population Indicator opens the Node Visibility Menu populated with Nodes directly linked to its Container owner by `contains` Edges.
- **VIS10.** [p] Clicking a Downstream Nodes Indicator opens the Node Visibility Menu populated with direct downstream Nodes.
- **VIS11.** [p] The Node Visibility Menu has a header showing its purpose and the number of listed Nodes loaded on the active Board.
- **VIS12.** [p] The Node Visibility Menu has a text input that filters Nodes by their text content; it does not provide a separate type filter.
- **VIS13.** [p] Each Node Visibility Item contains the Node's List Representation, using the background color associated with the Node's type and showing its type and text.
- **VIS14.** [p] Each Node Visibility Item shows whether the Node is loaded on the active Board and has a control that loads or unloads it.
- **VIS15.** [p] Each Node has an Upstream Nodes Indicator immediately to the left of its Downstream Nodes Indicator. It shows `N/M` for direct upstream Nodes loaded on the active Board / total direct upstream Nodes in the database, uses the same white base token as the Downstream Nodes Indicator, and opens the Node Visibility Menu so the user can load or unload those Nodes.
- **VIS16.** [p] When the user loads a Node onto a Board, Denim also shows that Node's regular Container if one exists in the database.
- **BCM1.** [p] Right-clicking the bare canvas background opens the Board Context Menu, which offers Add node and Create new node.
- **BCM2.** [p] Selecting Add node closes the Board Context Menu and opens the Node Visibility Menu with Nodes from the shared database.
- **BCM3.** [p] Selecting Create new node in the Board Context Menu creates a new Node and loads it onto the active Board.

## Node differentiation controls

- **ND1.** [p] The first hidden Node Toolbar icon differentiates the Node and is hidden by default.
- **ND2.** [p] The second hidden Node Toolbar icon differentiates the Node using an existing Node and is hidden by default.
- **ND3.** [p] When hidden options are not shown, an ellipsis occupies the first hidden option's position; on hover, the ellipsis disappears and that option takes its place.
- **ND4.** [p] The Find a node submenu has a circular plus affordance centered in its header row.
- **ND5.** [p] The user can drag from the circular plus affordance and release on a Node to connect it as the differentiated Node.
- **ND6.** [p] The user can click the circular plus affordance and then click a Node to connect it as the differentiated Node.
- **ND7.** [p] While either connection gesture is active, Denim draws a dashed Bezier curve from the circular plus affordance to the pointer.
- **ND8.** [p] The user can press Escape to cancel an active connection gesture.
- **ND9.** [p] The Find a node submenu closes when the user clicks outside it or completes a differentiated connection.
- **ND10.** [p] Each Node result in Find a node uses the List Representation.

## Step priority display

- **SP1.** [p] The user can set a User Action relationship's numeric priority to reorder the User Action among its siblings.
- **SP2.** [p] The Sequence options dropdown has a control that toggles child Edge labels between raw priority values and derived rank numbers.
- **SP3.** [p] In ranked display, Denim orders child User Actions by ascending priority value and displays ranks starting at 1.
- **SP4.** [p] Denim displays each User Action relationship's raw priority value or derived rank as text at the midpoint of its Edge.
- **SP5.** [p] Before a Node's child sequence is initialized, its child Edges have no priority values.
- **SP6.** [p] Initializing a sequence assigns a priority value to every child Edge of the Node.
- **SP7.** [p] Clearing a sequence removes the priority value from every child Edge of the Node.
- **SP8.** [p] By default, Denim displays derived ranks on Edges that have priority values.
- **SP9.** [p] Denim displays each priority label over a white circular badge centered at its Edge label position.
- **SP10.** [p] Step labels use a heavier font weight and a slightly larger font size.
- **SP11.** [p] When the user focuses a sequence label badge, Denim shows the raw priority values on every Edge in that sequence.
- **SP12.** [p] The user can edit a focused sequence label with any finite numeric value, including decimals; Denim saves the value when the input loses focus.
- **SP13.** [p] While editing, the input may extend beyond the badge and appears above it so the value remains legible.

## Journey navigation

- **JN1.** [p] Journey Nodes have an always-visible icon that opens the Journey on a new Board.

## Sequence Container

- **SC1.** [p] A Sequence Container is connected to its owner Node by a dashed line.
- **SC2.** [p] The user can toggle a Sequence Container between Special Presentation and Graph Presentation.
- **SC3.** [p] Graph Presentation for a Sequence Container looks like a regular Container.
- **SC4.** [p] Special Presentation shows a list of Nodes similar to the Node Visibility Menu.
- **SC5.** [p] Each Node in the Special Presentation list uses the List Representation.
- **SC6.** [p] The sequence order supports arbitrary depth, including labels such as `1`, `2`, `2a`, `2b`, `2b-i`, and `2b-ii`, and list items are indented according to their depth.
- **SC7.** [p] Sequence order labels belong to the Sequence Container and appear in its left border or margin, outside the Node representation.
- **SC8.** [p] The Special Presentation has a Default State and a Drafting State.
- **SC9.** [p] In Default State, the user can drag and drop Nodes to change their order.
- **SC10.** [p] In Default State, the user can change a Node's type.
- **SC11.** [p] In Drafting State, the user can type into Nodes.
- **SC12.** [p] When the user presses Enter while drafting a Node, Denim inserts a new Node immediately after the Node being edited in sequence order, at the same indentation depth and with the same type.
- **SC13.** [p] When the user presses Tab while drafting a Node, Denim indents that Node in the sequence.
- **SC14.** [p] When the user presses Shift+Tab while drafting a Node, Denim de-indents that Node in the sequence.
- **SC15.** [p] The existing Sequence options remain available alongside the Sequence Container.
- **SC16.** [p] The Sequence Container Toolbar is vertically centered in the header with a white base-token background. Its presentation toggle and Default/Drafting toggle are always visible. Additional actions follow the always-visible actions using the ellipsis pattern described in NT4. Activating a hidden action with the pointer collapses the hidden section while leaving always-visible actions visible.
- **SC17.** [p] The Sequence Container Toolbar lets the user switch between Special Presentation and Graph Presentation; the header does not show a “Graph” label.
- **SC18.** [p] The Sequence Container Toolbar has a Default/Drafting toggle immediately after the presentation toggle. If the user activates it in Graph Presentation, Denim switches to Special Presentation and then changes to the other editing state.
- **SC19.** [p] When the Sequence Container's Special Presentation content overflows its viewport, scrolling over the content scrolls the sequence instead of zooming the canvas.
- **SC20.** [p] In Drafting State, each Node has a Sequence Container Drafting Mode Node Toolbar in a left-justified column in the left padding beside its sequence position label. The toolbar has one delete icon, and deletion uses the Node Toolbar's existing confirmation.
- **SC21.** [p] In Default State, the Sequence Container Drafting Mode Node Toolbar is hidden or positioned elsewhere so it does not occupy the drag-and-drop control's position.
- **SC22.** [p] A Node's List Representation in a Sequence Container has the same height in Default State and Drafting State.
- **SC23.** [p] In Default State and Drafting State, each Node's List Representation fills the remaining available width in its sequence row, after its indentation and sequence order label.
- **SC24.** [p] In Drafting State, the user can click a Node's type label to open a dropdown and change its type.
- **SC25.** [p] The Sequence Container header shows “Sequence Container” in a badge. Its owner title fills the available header width after the Toolbar's visible actions and badge, truncating with an ellipsis only when it does not fit.

- **SC26.** [p] In Graph Presentation, sequence edges appear above Container contents' backgrounds and below Container headers.
- **SC27.** [p] In Graph Presentation, the Sequence Container Toolbar has a hidden Layout sequence action.
- **SC28.** [p] Applying sequence layout places siblings left to right at their depth, starting at the Container's top-left content area. The first child is directly below its parent; sibling subtrees receive additional spacing only where their Nodes would overlap at a shared depth.
- **SC29.** [p] Applying sequence layout loads the sequence's Nodes onto the Board and expands its Container only when needed to fit them. Layout never reduces the Container's width or height and does not change sequence order or Node text.
- **SC30.** [p] The CLI can read ordered Sequence Container entries, insert Nodes before or after a sibling or under a parent, indent/outdent entries, and move entries between parents using the shared action layer.
- **SC31.** [p] CLI insertion supports relative placement below or right of an anchor. The user can request sequence layout separately or together with an insertion or move on a specified Board.

## Sequence options

- **SQ1.** [p] The hidden section of a Node Toolbar includes a Sequence options icon.
- **SQ2.** [p] Clicking Sequence options opens a dropdown.
- **SQ3.** [p] The dropdown offers initialize sequence followed by clear sequence.
- **SQ4.** [p] The Sequence options dropdown opens below its icon.
