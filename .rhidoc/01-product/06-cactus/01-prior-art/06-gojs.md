---
title: GoJS
summary: GoJS's mental model — Diagram-as-view over a plain-object Model, templates with data binding, transactions and a built-in UndoManager, built-in tools and layouts, and Groups with a bounds-deriving Placeholder
tags: [cactus, prior-art, gojs, diagram-engine, web-library, commercial]
deps: [doc01.06.01.01]
---

# GoJS

## What it is

GoJS (from Northwoods Software, current version 3.1) is a commercial,
closed-source JavaScript library for interactive diagrams and graphs in the
browser, with no runtime dependencies. It is licensed per developer rather
than per seat of the shipped application, with no runtime fees or royalties;
license keys are perpetual for a fixed major/minor version and are tied to the
serving domain. Private evaluation is allowed under a separate Evaluation
License Agreement before a license is bought. It is widely used in enterprise
applications for org charts, flowcharts, BPMN, state charts, and similar
diagramming.

## Mental model

- A **Diagram** is a view over a **Model**: "A Diagram can be thought of as a
  view of a Model." The Model holds the data; the Diagram visualizes it. The
  Model, not the Diagram, is what a host loads and saves.
- **Node data** and **link data** are plain JavaScript objects held in the
  Model's arrays. The host adds and edits data objects; GoJS constructs the
  visual **Parts** from templates. There are three Model classes:
  **GraphLinksModel** (arbitrary graphs with independent link data and groups —
  the recommended default), **TreeModel** (each node names a parent, no
  separate link data), and **Model** (many simple parts, no links or groups).
- A **template** describes how to render a kind of Part. A **Binding**
  connects a property of a **GraphObject** in the template to a property of the
  data object in the model, so the visual updates when the data changes.
- The visual tree is built from **GraphObject** subclasses. A **Part** (a
  **Node** or a **Link**) contains nested **Panel**s (layout containers —
  Auto, Vertical, Horizontal, Spot, Table) holding leaf objects: **Shape**,
  **TextBlock**, **Picture**. A Link is the Part that routes between nodes.
- A **transaction** groups many **ChangedEvent**s so that one user action —
  which may cause many changes — is undone and redone as a single operation.
  Programmatic edits are bracketed by `startTransaction` and
  `commitTransaction`; many tool and command handlers already run inside a
  transaction. The built-in **UndoManager** records these when
  `undoManager.isEnabled` is set; transient properties like `position` and
  `scale` are not recorded.
- A **tool** handles input. The **ToolManager** is the diagram's default
  current tool; it canonicalizes input as **InputEvent**s and promotes a
  specialized tool to active until its task finishes. Tools are grouped by
  trigger: mouse-down (ResizingTool, RotatingTool, RelinkingTool,
  LinkReshapingTool, ActionTool), mouse-move (DraggingTool, DragSelectingTool,
  LinkingTool, PanningTool), and mouse-up (ClickSelectingTool,
  ClickCreatingTool, TextEditingTool, ContextMenuTool).
- The **CommandHandler** implements editing commands bound to the keyboard:
  delete, copy, cut, paste, select-all, undo, redo, group, ungroup, edit-text,
  and zoom. Each command pairs an action method with a predicate
  (`copySelection` / `canCopySelection`) that a host UI can query to
  enable or disable a control.
- A **layout** positions nodes and routes links. Five ship built in:
  **GridLayout**, **TreeLayout**, **ForceDirectedLayout**,
  **LayeredDigraphLayout**, and **CircularLayout**. Further layouts ship as
  source extensions (for example DoubleTreeLayout, PackedLayout, TableLayout,
  TreeMapLayout, SwimLaneLayout).
- A **Group** is a Node that contains member Parts. Members belong to the same
  Diagram as the Group; they are reached through `Group.memberParts`, and each
  member names its Group through `Part.containingGroup`. Members are *not* in
  the Group's own visual tree.
- A **Placeholder** is the one object a Group template includes to represent
  its members: it "assumes the size and position of the union of the bounds of
  all of the group's member parts, plus some padding," so the Group resizes and
  repositions as members move.
- A Group has its own **`Group.layout`** that positions its member nodes and
  routes its member links, independent of the diagram layout; a Group with a
  layout is treated as a single node by the parent layout.
- Collapse and expand set **`Group.isSubGraphExpanded`**. The
  **SubGraphExpanderButton** is a predefined button panel that toggles it,
  hiding or showing members while the Group itself stays visible; the
  Placeholder readjusts when members reappear.

## Capabilities

GoJS owns interaction, rendering, transactions, and layout; the host owns the
model data, the templates, and what the data means.

The library ships built in: node dragging, resizing, and rotating; rubber-band
and click selection with adornments; drawing new links and relinking existing
ones between ports; panning and zooming; in-place text editing; context menus;
the UndoManager (undo/redo); the CommandHandler (copy, cut, paste, delete,
select-all, group, ungroup) on keyboard shortcuts; the five built-in layouts
and the group layouts; and Group collapse/expand through the
SubGraphExpanderButton.

The host implements: the Model data and its persistence (load and save the
Model, not the Diagram); the node, link, and group **templates** and their
**Binding**s; the choice of Model class and layout; and any domain rules —
what links are valid, what a node means, custom tools or commands beyond the
built-in set.

So the user can drag, resize, rotate, select, connect, relink, edit text,
copy, paste, group, ungroup, collapse, expand, undo, and redo out of the box;
the shape of the data and the look of every part are the host's templates and
model.

## Sources

Official docs at gojs.net, consulted 2026-07-14 at GoJS v3.1 — principally the
Introduction pages: intro/index (Diagram vs Model, models, templates and
bindings, the GraphObject tree), intro/groups (Group, Placeholder, group
layout, SubGraphExpanderButton), intro/transactions (transactions and the
UndoManager), intro/tools (the ToolManager and built-in tools),
intro/commands (the CommandHandler), and intro/layouts (built-in and
extension layouts). Licensing and pricing were read from gojs.net/latest/download
and nwoods.com/sales; the licensing model is per-developer, commercial,
perpetual for a fixed major/minor version and domain, with a separate
evaluation license. API signatures, the full option lists, and current prices
live behind those links and change over time.
