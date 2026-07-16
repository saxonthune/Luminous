---
title: UI requirements
summary: The Dataflow Designer's UI capabilities as a controlled, EARS-like list of shall-statements, plus the input-command bindings table mapping each (target, interaction) pair to its command
tags: [dataflow, ui, requirements]
deps: [doc01.05.01, doc02.23]
---

# UI requirements

The Dataflow Designer's UI capabilities, written as a controlled list of
EARS-style requirements (Easy Approach to Requirements Syntax). Each requirement
has a stable identifier (R1, R2, …); identifiers are never reused once assigned.
Capitalized terms — Document, Box, Flow, Description, Contract, Group — are the
glossary terms (doc01.05.03).

## File selector view

- **R1.** When the user opens the overflow (triple-dot) menu on a file selector
  entry, the system shall offer Rename, Duplicate, and Delete actions.
- **R2.** When the user selects Duplicate on a file selector entry, the system
  shall create a copy of the Document, changing the name from `<slug>.dataflow.json`
  to `<slug>-copy.dataflow.json`.
- **R3.** When the user selects Rename on a file selector entry, the system shall
  present a modal with a text input for the slug and a fixed `.dataflow.json`
  label to the right of the input; the user edits only the slug.
- **R4.** When the user submits the rename modal (Ok button or Enter), the system
  shall rename the Document to the entered slug; the Cancel button dismisses the
  modal without renaming.
- **R5.** When the user selects Delete on a file selector entry, the system shall
  present a confirmation modal before removing the Document.

## Dataflow view

- **R6.** The system shall allow the user to drag Boxes.
- **R7.** The system shall allow the user to duplicate a Box; duplication copies
  the Box's contents.
- **R8.** When the user duplicates a Box, the system shall allow the user to
  choose whether the Box's connected Flows are copied.
- **R9.** The system shall allow the user to insert a Box onto a Flow; inserting
  removes the original Flow and adds two Flows so the inserted Box intercepts it —
  the original source connects to the inserted Box, and the inserted Box connects
  to the original target.
- **R10.** The system shall allow the user to delete a Box; deleting a Box also
  deletes its connected Flows.
- **R11.** The system shall allow the user to add a Box to an existing Group or to
  a new Group.
- **R12.** The system shall allow the user to rename a Group.
- **R13.** The system shall allow the user to select multiple Boxes for bulk
  operations.
- **R14.** The system shall allow the user to duplicate a selection of Boxes.
- **R15.** The system shall allow the user to add a selection of Boxes to a Group.
- **R16.** The system shall allow the user to edit a Box's contents.
- **R17.** The system shall allow the user to add a new Box to the Document.
- **R18.** While a Box is selected, the system shall highlight it.
- **R19.** While two or more Boxes are selected, the system shall display a
  floating count indicator at the bottom center of the view.

## Input-command bindings

An **input** is an ordered pair — a target (Box, Flow, Group label, background,
file selector entry) and an interaction method (left click, right click, double
click, drag, a key). Each row binds one input to the command it performs and
the requirement it serves. Rows with `—` in the Req column are baseline
navigation or gaps with no assigned requirement yet.

### File selector view

| Target | Interaction | Action | Req |
|---|---|---|---|
| Entry overflow (⋮) button | left click | Open menu: Rename, Duplicate, Delete | R1 |
| Menu: Duplicate | left click | Copy the Document as `<slug>-copy.dataflow.json` | R2 |
| Menu: Rename | left click | Open the rename modal (slug input, fixed `.dataflow.json` label) | R3, R4 |
| Menu: Delete | left click | Open the delete confirmation modal | R5 |

### Dataflow view

| Target | Interaction | Action | Req |
|---|---|---|---|
| Box | left click | Select the Box (replaces the selection) | R13 |
| Box | Shift/Ctrl + left click | Toggle the Box in the selection | R13 |
| Box | drag | Move the Box; the position is ephemeral — the next layout run wins | R6 |
| Box | right click | Context menu: Duplicate, Duplicate with Flows, Add to Group ▸ (existing Groups + New Group…), Delete | R7, R8, R10, R11 |
| Box in a multi-selection | right click | The same menu with the count in its labels (e.g. "Delete 3 Boxes"), applied to every selected Box; the selection is kept | R14, R15 |
| Box | double left click | Enter edit mode: name input, Description as a raw-markdown textarea, Contract format and text fields; the view fits to the Box | R16 |
| Box in edit mode | Ctrl+Enter, or blur | Commit the edits to the Document | R16 |
| Box in edit mode | Esc | Cancel the edits | R16 |
| Flow | right click | Context menu: Insert Box | R9 |
| Group label | double left click | Rename the Group | R12 |
| Group label | drag | Move every member Box | — |
| Background | drag | Marquee-select Boxes (replaces the selection) | R13 |
| Background | left click | Clear the selection | — |
| Any target | middle click + drag | Pan | — |
| Background | scroll wheel | Zoom | — |
| Background | right click | Context menu: Add Box | R17 |
| Selection | Delete key | Delete the selected Boxes and their connected Flows | R10 |
