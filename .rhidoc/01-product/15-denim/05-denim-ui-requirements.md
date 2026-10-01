---
title: UI Requirements
summary: Denim's views, tabs, toolbars, and node component behavior.
tags: [denim, ui, requirements, toolbar, tabs, views, nodes, icons, dragging]
deps: [doc01.15.01, doc01.15.03]
---

# UI Requirements

These user-interface requirements capture Denim's current direction. `[p]`
means wording and placement are pending review. Identifiers are stable and
never reused. Requirement identifiers use a short prefix and local numbering
for each feature section. If a feature grows, split it into smaller,
hierarchically nested sections with their own prefixes and sequences instead of
extending one global counter.

## Views and tabs

- **VT1.** [p] When the user opens a Journey, Denim opens a tab for it in the app.
- **VT2.** [p] The Journeys, Capabilities, and Resources views behave like pinned tabs.
- **VT3.** [p] The user can open the same Journey in more than one Tab.

## Tab View content

- **TVC1.** [p] The user can pull additional Nodes into a Tab View independently of the source queries that provide its initial content.

## App Toolbar

- **AT1.** [p] The Denim App Toolbar appears below the Luminous header bar.
- **AT2.** [p] The Denim App Toolbar remains visible at all times.
- **AT3.** [p] The Denim App Toolbar contains sections.
- **AT4.** [p] The Denim App Toolbar is square-cornered and fills the entire row across the user's viewport.

## Quick Select

- **QS1.** [p] Quick Select is a speedy icon that opens a dropdown containing saved views.
- **QS2.** [p] The default saved views in Quick Select are Journeys, Capabilities, and Resources.
- **QS3.** [p] For now, the user cannot add their own views to Quick Select.

## Tab Viewer

- **TV1.** [p] The Tab Viewer is the second section in the Denim App Toolbar and shows a list of tabs.
- **TV2.** [p] When tabs overflow in the Tab Viewer, chevron icons let the user scroll left and right.
- **TV3.** [p] The user can scroll the tabs while the pointer is inside the Tab Viewer.
- **TV4.** [p] When the user opens a Tab View without a saved camera, Denim fits its Nodes into the viewport.

## View Toolbar

- **VWT1.** [p] The View Toolbar contains actions relevant to the content of the current view.
- **VWT2.** [p] On the Journeys view, the View Toolbar has a button to add a new Journey.
- **VWT3.** [p] The View Toolbar has rounded corners and floats below the Denim App Toolbar, centered horizontally over the canvas.
- **VWT4.** [p] The View Toolbar does not show the Add child node, Connect to node, or Query result buttons.

## Save status

- **SS1.** [p] Denim shows save status in a small round floating badge at the bottom-right of the canvas.
- **SS2.** [p] While changes are saving, the badge shows a spinning indicator icon.
- **SS3.** [p] When changes are saved, the badge shows a check icon.

## Node appearance and movement

- **NODE1.** [p] The user can drag Nodes.
- **NODE2.** [p] Nodes have mild background shading based on their type so users can distinguish Node types at a glance.
- **NODE3.** [p] Each Node has a drag bar indicator on the same visual row as the Node type dropdown.
- **NODE4.** [p] The Node type dropdown occupies 80–90% of that row, with the drag bar right-justified.
- **NODE5.** [p] The user can drag a Node by dragging its drag bar or from its top padding.
- **NODE6.** [p] Each Node has a very thin greyish border.
- **NODE7.** [p] When the user differentiates a Node, Denim places the new Node below the parent Node.

## Node Toolbar

- **NT1.** [p] Each Node has a Node Toolbar.
- **NT2.** [p] A Node Toolbar may provide different capabilities according to the Node's type, while all Nodes have the same minimal capabilities.
- **NT3.** [p] Node Toolbar affordances are represented by icons.
- **NT4.** [p] A Node Toolbar has icons that are always visible and icons that appear on hover.
- **NT5.** [p] A Node Toolbar appears in the bottom-left of the Node area.

## Node differentiation controls

- **ND1.** [p] The first Node Toolbar icon differentiates the Node and is hidden by default.
- **ND2.** [p] The second Node Toolbar icon differentiates the Node using an existing Node and is hidden by default.
- **ND3.** [p] When a Node Toolbar has hidden options, an ellipsis fills the first icon's space and disappears on hover, when the first hidden option takes its place.

## Journey navigation

- **JN1.** [p] Journey Nodes have an always-visible icon that opens the Journey in a new tab.
