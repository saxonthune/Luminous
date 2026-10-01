---
title: Glossary
summary: Pending Denim terms for graph structure, views, and toolbar controls.
tags: [denim, glossary, vocabulary, graph]
deps: [doc01.15.01, doc01.15.02]
---

# Glossary

These initial entries capture terms and relationships named in the Denim
request. `[p]` means their wording and placement are pending review. Contract
relationships and contents were not specified in the source request.

## Journey structure

- **DTERM1.** [p] **Journey** — a business flow or similar, represented through Actions.
  - A Journey has Actions as child nodes. `parent-of(action, journey)`

- **DTERM2.** [p] **Action** — an abstract description of behavior a user observes.
  - An Action can have Actions as child nodes.
  - An Action can have Capabilities as child nodes.

- **DTERM3.** [p] **Capability** — a node type that an Action can have and a Resource can fulfill.
  - A Capability can have Capabilities as child nodes.
  - A Resource fulfills a Capability. `fulfills(resource, capability)`

## Resources and implementation

- **DTERM4.** [p] **Resource** — a server, UI server, worker, store, browser, or similar resource; comparable to a deployment in the source draft.
  - A Resource can have Resources as child nodes.
  - A Resource can have Organizations as child nodes.

- **DTERM5.** [p] **Organization** — a node representing modules, functions, guards, or other implementation details.

- **DTERM6.** [p] **Contract** — a node type requested for Denim; its contents and relationships remain unspecified.

## Editing and views

- **DTERM7.** [p] **Differentiate** — create a child node beneath a node, either as a new node or by connecting an existing node.

- **DTERM8.** [p] **View** — a query-based canvas shown in a tab.

- **DTERM9.** [p] **Table node** — a node that renders queried data as a table.

- **DTERM11.** [p] **Denim App Toolbar** — an always-visible toolbar below the Luminous header bar, organized into sections.

- **DTERM12.** [p] **Quick Select** — a speedy icon in the Denim App Toolbar that opens a dropdown of saved views.

- **DTERM13.** [p] **Tab Viewer** — the second section of the Denim App Toolbar, which shows a list of tabs.

- **DTERM14.** [p] **View Toolbar** — a floating toolbar below the Denim App Toolbar, centered horizontally over the canvas, with actions relevant to the current view.

- **DTERM15.** [p] **Node Toolbar** — a toolbar in the bottom-left of a Node area that presents actions as icons; its capabilities may vary by Node type.

- **DTERM16.** [p] **Tab View** — the content shown within one Tab.

## Graph relationship

- **DTERM10.** [p] Any node type can be a parent or child in a parent/child relationship. `parent-of(child, parent)`
