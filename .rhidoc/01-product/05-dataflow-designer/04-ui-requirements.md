---
title: UI requirements
summary: The Dataflow Designer's UI capabilities as a controlled, EARS-like list of shall-statements, grouped by area
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
