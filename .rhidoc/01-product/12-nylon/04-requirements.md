---
title: Requirements
summary: Nylon's Standard View, Tabs, Continuous View, document actions, differentiation, and command-line requirements
tags: [nylon, ui, cli, requirements, differentiation, views, tabs]
deps: [doc01.12.02, doc01.12.03]
---

# Requirements

Nylon's capabilities are written as EARS-style requirements. Each requirement
has a stable identifier. Identifiers are never reused. Capitalized terms name
Nylon constructs from doc01.12.03.

## Document

- **D1.** The system shall read a Document from a `*.nylon.json` file.
- **D2.** The system shall diagnose a Data Arc whose ends are both Transformations or
  both Contracts, or a Control Pass Arc whose ends are not both Transformations.
- **D3.** The system shall diagnose an Arc that references an unknown
  Transformation or Contract.
- **D4.** The system shall reject duplicate identifiers across Transformations
  and Contracts.
- **D5.** The system shall allow a Contract to carry freeform multiline text.
- **D6.** The system shall allow a Transformation to carry prose and a list of
  the data it needs.
- **D7.** The system shall save a changed Document through the Luminous storage
  server.
- **D8.** The .NET specimen shall differentiate its API into
  `CustomerController.cs`, `CustomerService.cs`, and `CustomerRepository.cs`
  Parent Transformations.
- **D9.** The system shall allow a Transformation to declare one existing
  Contract as the Input Contract and one existing Contract as the Output
  Contract of its Contract Pair.
- **D10.** The .NET specimen's rate-limit policy shall show mutually exclusive
  admitted and rejected paths, and the rejected path shall lead to an HTTP 429
  response.
- **D11.** The .NET specimen shall give GET and contact-refresh their own
  endpoint boundaries. GET shall use an HTTP Control Contract and
  invocation-owned Control Contracts for `CustomerLookup → Customer result`,
  `Customer query → customer database result`, and `SQL query → SQL result`.
  All specimen pairs, including HTTP, startup, and provider loading, shall belong
  to invocation Arcs rather than Transformations. External client and host
  Transformations shall make the HTTP and startup invocations explicit.
- **D12.** The `CustomerRepository.cs` Parent Transformation shall contain the
  Transformations and Contracts that use Entity Framework to turn a customer
  query into a customer database result.
- **D13.** The system shall allow every Node to carry canvas coordinates.
- **D14.** The .NET specimen shall place the customer database outside the API,
  connect its internal query Transformation to the Entity Framework detail
  through a SQL Control Contract, and contain `Customers`, `CustomerContacts`,
  `ContactSummaries`, and `AppOptions` table Contracts.
- **D15.** The system shall allow a Contract to carry an optional open-vocabulary
  Contract Kind.
- **D16.** The .NET specimen shall place Application startup and the typed
  `IOptions` Contracts it produces inside the API. Startup shall contain the
  provider-loading steps; their settings Contracts shall feed binding. The
  database shall remain outside the API.
- **D17.** The .NET specimen's startup shall connect `Application starting`
  through provider loading and options binding to `Configured application`.
  These boundary Contracts shall remain outside the startup detail, and request
  handling shall depend on the configured application.
- **D18.** A root Node's canvas coordinates shall be relative to the Document's
  canvas, and a Child's canvas coordinates shall be relative to its Parent
  Transformation.
- **D19.** The Input Contract and Output Contract of a Contract Pair shall have
  the same Parent Transformation or shall both belong to the document root.
- **D20.** A Control Pass Arc shall identify an invocation, return, or continuation.
  A return shall reference the invocation it completes and may resume at a
  different Transformation from the caller.
- **D21.** An invocation may reference a Control Contract consisting of two
  distinct Contract Nodes in the same coordinate space.
- **D22.** The .NET specimen shall include a contact-refresh endpoint whose
  service reads customer details through one repository before writing a
  contact-summary table through another and returning HTTP 204 after write completion.
- **D23.** When the contact lookup returns NotFound, the specimen shall show a
  mutually exclusive continuation returning HTTP 404 without invoking the
  summary-write repository.
- **D24.** The details repository shall expose internal read and result
  Transformations. The read shall depend on Customers and CustomerContacts;
  return control shall leave the internal result Transformation. The summary
  write shall expose its committed effect on ContactSummaries separately from
  its completion acknowledgement.

## Canvas

The subsections retain the stable C-identifiers. Disclosure, expansion spacing,
and selection-dependent boundary projections (C2, C5, C9, C15–C18, C26–C32,
C48–C51, C53–C64) describe Continuous View. Standard View follows the
V-requirements below. Shared selection, inspection, camera, and Document
actions apply to both Views.

### Nodes and Contract Pairs

- **C1.** The system shall list the available Documents and open the Document
  selected by the user.
- **C2.** The system shall draw each leaf Transformation as a square.
- **C3.** The system shall draw each Contract as an oval or a box with strongly
  rounded corners.
- **C4.** The system shall draw each Arc as a directed connection.
- **C5.** The system shall draw the visible Children of a Parent Transformation
  inside a labelled container.
- **C6.** The system shall allow the user to pan and zoom the canvas.
- **C7.** The system shall allow the user to select a Transformation or Contract
  and inspect its full prose or text.
- **C8.** The system shall keep every Arc visually legible when none of its
  endpoints is selected and when it crosses a Parent Transformation's area.
- **C9.** The system shall distinguish adjacent containment depths with
  alternating container background colors.
- **C10.** The system shall allow the user to drag any Transformation or
  Contract and shall save its changed position. Dragging a Parent
  Transformation shall also move its descendants.
- **C11.** The system shall draw a Contract Pair as one compound object with a
  distinct Input Contract half and Output Contract half, labelled "Control Contracts".
- **C12.** The system shall identify the called Transformation and the direction
  from input type to output type on invocation-owned pairs. The frame shall use
  the control-Arc color, and inspection of either endpoint or Contract shall
  identify its invocation and input/output Contracts. Older Transformation-owned
  pairs shall use the same presentation with their owner's name.
- **C13.** The system shall allow the user to drag a Contract Pair by its frame
  and shall move both Contracts together. When the user drags either Contract
  half, the system shall move only that Contract as it would any other Node.
- **C14.** The system shall identify a non-default Contract Kind with both a
  distinct color treatment and visible text.
### Continuous View disclosure

- **C15.** Each Parent Transformation shall provide expand, collapse, and Cover buttons
  at the top right of its container.
- **C16.** When the user collapses a Parent Transformation, the system shall
  hide its descendants without changing the Document's Nodes or Arcs.
- **C17.** When an Arc endpoint is hidden, the system shall draw that endpoint
  at its nearest visible collapsed or covered Parent Transformation. When the user expands
  the Parent Transformation, the system shall draw the Arc at its declared
  endpoint again.
- **C18.** An expanded Parent Transformation shall enclose all of its visible
  descendants, including expanded Parent Transformations nested within it.
### Off-screen Contracts

- **C19.** When a leaf Transformation is selected, the system shall show a
  Ghost Node for each directly connected incoming Contract that is outside the
  viewport.
- **C20.** When a Parent Transformation is selected, the system shall show a
  Ghost Node for each off-screen Contract whose Arc crosses into a descendant
  of that Parent Transformation.
- **C21.** The system shall place a Ghost Node where its Contract's Arc meets
  the viewport edge and shall connect the visible part of the Arc to the Ghost
  Node.
- **C22.** A Ghost Node shall use a dotted outline and shall show the name and
  Contract Kind of the Contract it identifies.
- **C23.** Activating a Ghost Node shall move the viewport to the Node it
  identifies.
- **C24.** The system shall remove a Ghost Node when its identified Node becomes
  visible or is no longer relevant to the selection.
- **C25.** Showing, removing, or activating a Ghost Node shall not add a Node or
  change an Arc in the Document.
### Continuous View expansion geometry

- **C26.** The system shall compose a Node's stored coordinates with its
  ancestors to calculate its rendered canvas position. Expand and collapse
  state shall change descendant visibility and Parent Transformation size.
- **C27.** Collapsing a Parent Transformation shall not change any Node's
  stored coordinates.
- **C28.** Expanding a Parent Transformation shall save any sibling
  translations needed to make room as one Document change when expanding from
  collapsed. Expanding from covered shall reveal content without moving Nodes.
- **C29.** When an expanded Parent Transformation overlaps a sibling Node that
  was positioned beyond its collapsed right or bottom edge, the system shall
  translate the sibling's stored position beyond the matching expanded edge.
- **C30.** When a sibling Node is beyond both the right and bottom edges, the
  system shall displace it in both directions.
- **C31.** The system shall resolve expansion from the deepest Parent
  Transformation outward, so a changed container boundary can displace its
  siblings at each containing depth through the document root.
- **C32.** Collapsing a Parent Transformation shall not reverse translations
  saved by an earlier expansion.
- **C33.** For spacing and collision behavior, a Contract Pair shall act as one
  container whose bounds enclose its two Contract Nodes. Translating that
  container shall translate both Contracts by the same amount.
### Selection and viewport

- **C34.** The Node inspector shall provide a close button. Closing the
  inspector shall deselect the selected Node.
- **C35.** A left click on empty canvas background shall deselect the selected
  Node and close its inspector.
- **C36.** Pressing Escape shall deselect the selected Node and close its
  inspector.
- **C37.** The system shall provide continuous camera zoom without changing a
  Node's stored size or position.
- **C38.** A screen-space bar below the application header shall show the
  current camera zoom and a breadcrumb for the current canvas context.
- **C39.** In Continuous View, when a Node is selected, the breadcrumb shall show its Parent
  Transformation ancestry followed by the selected Node.
- **C40.** In Continuous View, when no Node is selected, the breadcrumb shall show the Parent
  Transformation at the camera center whose Relative Zoom identifies it as
  the current context, preceded by its immediate parent. When no Parent
  Transformation qualifies, the breadcrumb shall identify the Document
  canvas.
- **C41.** The system shall show a screen-space minimap of the visible Nylon
  projection and shall mark the current viewport within it.
- **C42.** Clicking or dragging within the minimap shall pan the camera while
  retaining its zoom.
- **C43.** The system shall not start a drag for a Parent Transformation or
  Contract Pair whose Relative Zoom fills the viewport beyond the configured
  drag limit. Selection and the contained controls shall remain available.
- **C44.** The system shall derive zoom-dependent display and interaction
  behavior from one shared Relative Zoom policy.
- **C45.** At low projected screen sizes, a Node shall omit secondary prose
  and data while retaining its identity and stored geometry. At overview zoom,
  Standard View cards and Contracts shall emphasize larger wrapping names and
  omit schematics, counts, and secondary labels. Zoom changes shall not resize
  or reposition Nodes. Names at working zoom and PIP titles shall remain prominent.
- **C46.** The system shall allow the user to select Nodes by dragging a
  selection box across empty canvas or the interior of an expanded Parent
  Transformation.
- **C47.** When the user drags a selected Node, the system shall move every
  selected Node. A selected descendant whose ancestor is also selected shall
  move once with that ancestor.
### Ordering

- **C48.** Each expanded Parent Transformation shall provide an ordering
  button to the left of its expand and collapse buttons. The system shall hide
  the ordering button while the Parent Transformation is collapsed or covered.
  The ordering button shall open a menu with left-to-right, top-to-down,
  right-to-left, and down-to-top DAG layouts.
- **C49.** A DAG layout shall order a Parent Transformation's immediate
  Children from whole-network Arc reachability. A path may pass through
  descendants or leave and return through an external Contract Pair. The
  layout shall preserve the positions of deeper descendants within those
  Children.
- **C50.** A DAG layout shall treat each Contract Pair as one geometry unit and
  shall preserve the positions of its two Contract Nodes relative to its
  frame.
- **C51.** Applying a DAG layout shall save all changed Child positions as one
  Document change.
- **C52.** The system shall give Node names and kinds enough visual weight to
  remain legible before secondary prose and data at the same camera zoom.
### Continuous View boundary projections

- **C53.** When an external Contract Pair connects an outgoing Transformation
  and a returning Transformation inside the same Parent Transformation, the
  system shall draw a dotted connection between those Transformations while
  neither the Parent Transformation nor any of its descendants is selected.
- **C54.** When that Parent Transformation or any of its descendants is
  selected, the system shall draw a compact boundary projection of the
  external Contract Pair near the midpoint of the dotted connection. The
  projection may straddle the Parent Transformation's edge when at least half
  of its area remains inside the Parent Transformation.
- **C55.** A boundary projection shall represent the same Contract Nodes as the
  external Contract Pair. The user shall be able to select and drag either
  projected Contract as a normal Contract. Showing or hiding the boundary
  projection shall not add a Node or change an Arc in the Document.
- **C56.** A boundary projection shall use the nearest candidate position that
  remains visible, satisfies its minimum containment, and does not overlap a
  visible Node. When every candidate overlaps, the system shall use the
  candidate with the least overlap.
- **C57.** A DAG layout shall treat each boundary projection as a geometry unit
  between its outgoing and returning Transformations. The layout shall reserve
  space for that unit and shall save positions only for Document Nodes.
### Spacing

- **C58.** Each expanded Parent Transformation shall provide a spacing button
  beside its ordering button. The system shall hide the spacing button while
  the Parent Transformation is collapsed or covered.
- **C59.** A spacing layout shall arrange only the Parent Transformation's
  immediate Children, remove their overlaps, and leave each Child's deeper
  descendants unchanged. The layout shall treat a Contract Pair as one
  geometry unit.
- **C60.** After spacing immediate Children, the system shall remove overlaps
  between the changed Parent Transformation and its siblings, then repeat that
  sibling check through each ancestor level. The system shall save all changed
  positions as one Document change.
### Continuous View Cover

- **C61.** Cover shall hide an expanded Parent Transformation's descendants
  without changing its container bounds or any Node's stored position.
- **C62.** A Parent Transformation shall be exactly one of expanded, covered,
  or collapsed. Expand shall be available from covered and collapsed. Collapse
  shall be available from expanded and covered. Cover shall be available only
  from expanded.
- **C63.** Cover and collapse shall preserve descendants' individual states.
  Covered and collapsed content shall be absent from selection by canvas
  gestures and from the minimap. Internal Arcs and boundary projections shall
  be hidden with the content. Hiding content shall deselect its Nodes while
  preserving the selection of visible Nodes.
- **C64.** A covered Parent Transformation shall retain its header at the top
  and act as one Transformation for selection and dragging. Clicking its body
  or header shall select it and open its data in the Node inspector.
### Control density

- **C65.** The UI shall use screen space efficiently. Controls and panels shall
  use compact padding and spacing while keeping text legible and controls
  usable. Container controls shall use consistent label sizes.

## Standard View

- **V1.** Opening a Document without a retained Tab session shall activate a
  Standard View at the Document root. A retained session shall restore its
  active Tab. The deprecated Continuous View shall remain the first Tab.
- **V2.** A Standard View shall draw its Focus Parent Transformation as a
  labelled container enclosing its immediate Children, or show the root Nodes
  when focused at the Document root. Child Parent
  Transformations shall remain compact without expand, collapse, or Cover controls.
- **V3.** For every Arc entering or leaving the Focus Transformation or any
  descendant, Standard View shall show the external endpoint as a Context Node.
  It shall not add further Nodes through the Context Node's other connections.
- **V4.** An Arc attached to a hidden descendant shall appear at its visible
  Child ancestor. Inspection shall identify the Arc's declared endpoints.
  Internal Arcs with both ends represented by the same Child shall be hidden.
- **V5.** Context Nodes shall remain represented regardless of selection. Each
  shall identify its external role and allow inspection of its source Node.
  A Contract Pair frame shall appear only when both Contracts are represented.
- **V6.** Each Transformation containing Transformations or Contracts shall
  provide an Open contents control that identifies the contents and opens its
  Standard View. A simple Transformation shall be visually distinguishable.
  The inspector shall allow any Transformation to open in a Tab.
- **V7.** Standard View shall show a navigable breadcrumb from the Document
  root through the Focus Transformation's full ancestry. Selection and camera
  movement shall not change the focus.
- **V8.** Moving Children or arranging the Focus Transformation's Children
  shall save their positions in the shared Document. Other Views shall reflect
  those positions while retaining their own camera and selection.
- **V9.** Context Nodes shall be placed around the focused detail. Their
  placement shall not change stored positions. Context inspection and
  navigation shall remain available without dragging Context Nodes.
- **V10.** Opening, closing, or activating a View shall not change the
  Document, its bipartite rules, its Differentiation rules, or its History.
- **V11.** When the Focus Transformation no longer exists, its Tab shall
  explain the absence and provide navigation to the Document root. Restoring
  the Transformation shall restore the View's content.

### Transformation cards and workspace

- **V12.** Standard View shall draw each Transformation as a card with a
  prominent name and a short excerpt of its existing prose. A simple
  Transformation shall show its data needs without a contents schematic or
  Open contents control.
- **V13.** Each card with Children shall show a miniature schematic of its
  immediate Children and their connections. Transformations and Contracts
  shall use distinct shapes; nested Parent Transformations shall have a
  contents indicator. The schematic shall omit Node labels and shall not
  change stored positions or add Nodes or Arcs.
- **V14.** A card with Children shall show their Transformation and Contract
  counts beside its Open contents control, including Contracts-only contents.
- **V15.** The workspace heading shall show the Focus Transformation's name,
  a short prose excerpt, an Inspect control, and arrangement and camera
  controls. The focused Parent Transformation's canvas container shall have
  a visible name and boundary, with no expand, collapse, Cover, or Open contents
  controls. The boundary shall enclose the immediate Children and their Contract
  Pair frames, with Context Nodes outside it. Its bounds shall follow Child
  arrangements without changing stored positions. A simple Focus Transformation shall remain drawn
  as a card to connect its Arcs.
- **V16.** Arrange children shall compact the immediate Children or root Nodes
  using their displayed card and Contract Pair sizes. It shall preserve each
  Contract Pair's internal arrangement and deeper descendant positions, and
  save the changed Child positions as one undoable Document action. Opening
  a View shall not automatically arrange its Nodes.
- **V17.** Opening a new Standard View and activating Readable zoom shall keep
  card text readable, even when the complete network does not fit on screen.
  Fit view shall show the complete View. Arranging Children shall also frame
  the result at a readable zoom.
- **V18.** External Contracts shall be grouped by Contract Pair when both
  halves are represented and ordered by their connections to the focused
  detail. Their display positions shall remain outside Document history.

## Picture in picture (PIP)

- **P1.** In Standard View, each Transformation's Open contents control shall
  have an adjacent PIP control. The inspector shall allow any Transformation
  to open its Standard View in a PIP.
- **P2.** Each PIP shall use Standard View content with optional external context, in a
  labelled container on the active Tab's canvas. All PIPs shall share the
  canvas camera. Their containers shall fit their contents.
- **P3.** A thick, dotted, curved tether shall connect a PIP to the particular appearance
  of the Node from which it opened. The tether shall follow both ends as they
  move and shall not be a Document Arc.
- **P4.** Opening a PIP from inside another PIP shall create a peer container
  on the same canvas, never a nested PIP. Moving a PIP shall not move PIPs
  opened from it.
- **P5.** A new PIP shall occupy clear space with a buffer from existing content
  and PIPs. Placement shall bring it as close to its source as the buffered
  obstacles allow, without moving existing content. The camera shall reveal it.
- **P6.** The user shall be able to drag a PIP by its header. After initial
  placement, deliberate overlaps shall be allowed. Moving the container shall
  not change Document coordinates or History.
- **P7.** PIP content inspection and movement shall use the same Document and
  actions as Tabs. Each rendered appearance shall remain distinguishable for
  selection and navigation. A PIP shall offer Arrange children and Open in tab.
- **P8.** Reopening the same destination from the same source appearance shall
  reveal its existing PIP instead of creating a duplicate.
- **P9.** Closing a PIP shall close its downstream PIPs. Reopen closed PIP shall
  restore the most recently closed group with its retained positions.
- **P10.** Each Tab shall retain its PIPs, source references, positions, and
  closed groups through hot reload, page refresh, and closing/reopening the Tab,
  within the browser tab's session. Restoring a session shall preserve positions
  rather than repeat initial placement. Existing sessions without PIPs shall
  continue to restore their Tabs.
- **P11.** A PIP whose Transformation is removed shall retain a missing-content
  placeholder. An unavailable source appearance shall be identified in its
  header. Restoring the source or destination shall restore its presentation.

- **P12.** PIPs shall initially omit external Context Nodes and their connections.
  A Show context toggle shall restore them within that PIP. Each PIP shall
  retain its context visibility with its Tab session.
- **P13.** Selecting a PIP member while context is hidden shall temporarily show
  straight dotted connections to its external Contracts represented in the
  main View. These connections shall use the Standard View's endpoint
  projection, shall not duplicate Contract Nodes or change Document Arcs, and
  shall disappear on deselection. The curved source tether shall remain distinct.

## Tabs

- **T1.** A Tab shall identify its View by the Focus Transformation's name or
  the Document root, and identify Continuous View as deprecated. Its full
  ancestry and Node identifier shall distinguish repeated names.
- **T2.** Opening a Transformation or the Document root shall activate its
  existing Standard View Tab or create and activate a new Tab.
- **T3.** Switching Tabs shall retain each Tab's camera and selection and
  Continuous View's disclosure. Node arrangements and History shall remain
  shared across Tabs of the Document.
- **T4.** The user shall be able to close a Standard View Tab. Closing the
  active Tab shall activate an adjacent Tab. Continuous View shall remain
  available as the first Tab.
- **T5.** The user shall be able to reopen the most recently closed Tab with
  its retained camera and selection. Opening a closed View through navigation
  shall also restore its retained context.
- **T6.** Tabs, their order, the active Tab, and retained contexts shall survive
  hot reloads, page refreshes, and leaving and reopening the same Document
  within the browser tab's session. Closing the browser tab may discard them.
  Each Document source shall retain its own Tab session.
- **T7.** The Tab strip shall support keyboard activation and movement between
  Tabs, and shall indicate the active Tab.
- **T8.** Each Tab shall own its camera position, zoom, selection, and
  Continuous View disclosure independently. Activating an existing Tab shall
  restore its camera exactly; opening a new Tab shall frame its own contents.
  Node arrangements shall remain shared Document state.
- **T9.** The active Tab's context shall be retained as it changes, including
  when a reload occurs before the user switches Tabs. Closed Tabs shall remain
  available to reopen after a reload within the browser tab's session.
- **T10.** Missing or unusable retained context shall not prevent opening a
  Document. The system shall use the default Tabs when the retained session
  cannot be read. Browser session retention shall not change the Document or
  its History.

## Actions and history

- **H1.** Every UI, CLI, and API change to a Document shall execute through
  the same Nylon action handler. The server shall execute actions in server
  mode; the static demo shall execute them locally with the same behavior.
- **H2.** Each completed drag, layout, reparenting, differentiation, Node
  creation, deletion, replacement, or batch shall form one undo step
  when it changes the Document. Failed actions, dry runs, and unchanged results
  shall not add history entries.
- **H3.** Undo shall restore the Document before the latest committed action,
  regardless of whether the UI, CLI, or API initiated it. Redo shall restore
  the recorded result without recalculating a layout or generating new IDs.
- **H4.** Each Document shall have bounded session history. Server restart
  may discard history; reloading the static demo shall discard its local edits
  and history. History shall not be stored in the authored Document.
- **H5.** A direct file edit shall clear the Document's undo and redo history.
  A new committed change after undo shall clear redo history.
- **H6.** Actions shall identify the Document revision they were prepared
  against. The system shall reject stale actions without overwriting newer
  changes and shall let the user refresh and try again.
- **H7.** Retrying an action with the same action ID shall not apply its change
  twice. Reusing an action ID for a different request shall be rejected.
- **H8.** Nylon shall determine layout geometry from the Document and explicit
  container states before calling cactus. Identical inputs shall have the same
  layout behavior in server and demo modes. The CLI shall default to expanded
  containers and allow explicit covered and collapsed states.
- **H9.** The UI shall provide Undo and Redo controls identifying the next
  action and its origin. The CLI and API shall expose history, undo, and redo.
- **H10.** Camera, selection, Cover, and collapse shall remain local view state
  outside Document history. Expansion that moves siblings shall record those
  movements as one action; undoing it shall leave disclosure state unchanged.
- **H11.** Drag previews shall remain local. The system shall commit the move
  on release and retain its released position while awaiting confirmation.
  The user shall be able to perform further actions while earlier actions save.
- **H12.** Change notifications shall identify the revision and action when
  available. Reconnecting clients shall refresh the Document and history.
- **H13.** History shortcuts shall leave native undo and redo available while
  the user is editing text.
- **H14.** The UI shall immediately display the predicted result of each
  accepted Action, including layout, differentiation, undo, and redo. It shall
  use the same executor as the server and static demo.
- **H15.** The UI shall send pending Actions in order. Confirming an earlier
  Action shall preserve the display of later pending Actions without flicker
  or applying a movement twice.
- **H16.** When an Action is refused or its result differs from the prediction,
  the UI shall discard dependent pending previews, show authoritative state,
  and explain the refusal. It shall not silently recalculate pending layouts
  against externally changed data.
- **H17.** If the authoritative state cannot be refreshed after a failed save,
  the UI shall provide Refresh and prevent further Actions until refresh succeeds.

## Differentiation

- **F1.** When the user differentiates a leaf Transformation, the system shall
  add two child Transformations and one Contract between them.
- **F2.** Differentiation shall replace each incoming Data Arc to the Parent
  Transformation with an Arc to the first child Transformation.
- **F3.** Differentiation shall replace each outgoing Data Arc from the Parent
  Transformation with an Arc from the second child Transformation.
- **F4.** Differentiation shall connect the first child Transformation to the
  new Contract and the new Contract to the second child Transformation.
- **F5.** After Differentiation, the Parent Transformation shall contain its new
  Children and shall not remain an endpoint of a Data Arc. Control Pass Arcs
  shall retain their endpoints until the author explicitly assigns them to Children.
- **F6.** The system shall refuse to differentiate a Transformation that already
  has Children.
- **F7.** Differentiation shall preserve the Parent Transformation's Contract
  Pair.

## Prototype diagnostics and control appearance

- **C66.** Control Pass Arcs shall use a theme-aware color and dashed stroke,
  and identify their role. A Control Contract frame shall identify its invocation.
- **C67.** Affected Nodes shall show expandable warning indicators. A visible
  ancestor shall report issues on hidden descendants. Affected visible Arcs
  shall expose their warning messages in their labels.
- **C68.** The UI shall list all Document diagnostics. Semantic warnings shall
  not block ordinary movement. When structural errors prevent projection, the
  UI shall retain the Document and Tabs and show the issues until corrected.
- **C69.** A Control Contract shall show separate input and output Nodes and
  allow moving both together by its frame. When both Contracts belong to a
  larger selection, dragging the frame shall move the whole selection.

## Command-line interface

- **L1.** The command-line interface shall call the Luminous storage server to
  list, read, check, and change Nylon Documents.
- **L2.** The command-line interface shall expose every Document-changing action
  exposed by the Nylon UI.
- **L3.** The command-line interface and the UI shall apply the same core domain
  operation for Differentiation.
- **L4.** The check command shall report structural errors without changing the
  Document.
- **L5.** The move command and UI drag shall apply the same translation to a
  Node and its descendants.
- **L6.** The command-line interface and UI shall apply the same operation when
  moving a Contract Pair.
- **L7.** The `node add` command shall accept canvas coordinates when it adds a
  Transformation or Contract Node.
- **L8.** The `node reparent` command shall allow the user to reparent a Node to
  a Parent Transformation or to the document root.
- **L9.** When the `arc insert` command inserts an alternating path into an
  Arc whose endpoints have different depths, it shall give the new Nodes the
  Parent Transformation of the deeper endpoint.
- **L10.** When an Arc's endpoints have the same depth and different parents,
  the command-line interface shall require the user to supply the insertion
  parent.
- **L11.** The command-line interface shall allow the user to supply canvas
  coordinates for each Node created by Arc Insertion.
- **L12.** The `node update` command shall change a Node's kind-appropriate
  content, and the `node delete` command shall refuse to remove a Node with
  dependants unless the user explicitly requests cascading deletion.
- **L13.** The `arc add`, `arc remove`, and `arc replace` commands shall identify
  an Arc by its ordered endpoint pair. Adding or replacing a Data Arc shall
  retain semantic violations for diagnosis, as direct JSON authoring does.
  Removal or replacement shall refuse an ambiguous endpoint pair.
- **L14.** The `contract-pair set`, `contract-pair clear`, and
  `contract-pair move` commands shall create, remove, and spatially translate a
  Transformation's Contract Pair.
- **L15.** Every command that changes a Document shall accept `--dry-run`,
  validate the resulting Document, report it, and leave storage unchanged.
- **L16.** The `node add` and `node update` commands shall accept a Contract Kind
  for Contract Nodes.
- **L17.** The `batch` command shall apply an ordered JSON operation list in
  memory, allow temporarily invalid intermediate states, validate the final
  Document, and write it once or not at all.
- **L18.** When a batch operation fails, the command-line interface shall report
  its one-based index, operation name, and reason.
- **L19.** The `export` command shall write only canonical Nylon JSON to standard
  output so the caller can pipe or redirect it to a chosen destination.
- **L20.** The `doctor` and `check` commands shall report rule identifiers,
  severity, explanations, and affected Node and Arc IDs without writing the Document.
- **L21.** Doctor shall never delete or repair authored content, including
  ambiguous content such as duplicate Node identifiers.
- **L22.** The `layout dag` command shall apply the same directional DAG layout
  as the Parent Transformation's ordering menu.
- **L23.** The `layout space` command shall apply the same immediate-Child
  spacing and ancestor overlap removal as the Parent Transformation's spacing
  button.
- **L24.** The `action` command shall accept one JSON Action and expose the
  same requests as the UI and API, including selection movement and expansion.
- **L25.** The `history`, `undo`, and `redo` commands shall use the Document's
  shared session history.
- **L26.** Setting a Contract Pair shall retain incomplete or non-distinct
  Contract references for diagnosis. Semantic warnings shall not prevent the
  change; the owning Transformation must exist.

## Input-command bindings

An input is an ordered pair: a target and an interaction method. Each row binds
one input to the command it performs and the requirement it serves.

| Target | Interaction | Action | Req |
|---|---|---|---|
| File selector entry | left click | Open the Document | C1 |
| Tab | left click or Enter/Space | Activate the View | T2, T3, T7 |
| Tab | Left/Right arrow, Home/End | Activate the adjacent, first, or last Tab | T7 |
| Standard View Tab close button | left click | Close the Tab | T4 |
| Reopen closed tab button | left click | Restore the most recently closed Tab | T5 |
| Document root button | left click | Open the root Standard View | V1, T2 |
| Transformation PIP control | left click | Open or reveal a peer PIP of its contents | P1, P4, P8 |
| Transformation inspector Open in PIP button | left click | Open or reveal the Transformation's PIP | P1, P8 |
| PIP header | left drag | Move the PIP container | P6 |
| PIP Show context toggle | left click | Show or hide external Context Nodes within this PIP | P12 |
| PIP member | select / deselect | Show / hide temporary connections to external Contracts in the main View | P13 |
| PIP Open in tab button | left click | Open the PIP's Standard View in a Tab | P7 |
| PIP Arrange children button | left click | Arrange and save the Focus Transformation's immediate Children | P7 |
| PIP close button | left click | Close the PIP and its downstream PIPs | P9 |
| Reopen closed PIP button | left click | Restore the most recently closed PIP group | P9 |
| Transformation Open contents control | left click | Open the Transformation's Standard View | V6, T2 |
| Transformation inspector Open in new tab button | left click | Open the Transformation's Standard View | V6, T2 |
| Standard View breadcrumb | left click | Open the identified ancestor or Document root | V7, T2 |
| Context Node | left click | Inspect the represented Node | V5, V9 |
| Standard View heading Inspect button | left click | Inspect the Focus Transformation | V15 |
| Standard View focus container header | left click | Select and inspect the Focus Transformation | V15, C7 |
| Standard View Arrange children button | left click | Compact and save immediate Child positions, then frame the result | V16, V17 |
| Standard View Fit view button | left click | Fit the complete View on screen | V17 |
| Standard View Readable zoom button | left click | Frame the View at a readable zoom | V17 |
| Canvas | middle click + drag | Pan the camera | C6 |
| Canvas background | scroll wheel | Zoom the camera | C6 |
| Canvas background | left click | Deselect the selected Node and close its inspector | C35 |
| Canvas background or expanded Parent Transformation interior | left drag | Select the Nodes crossed by the selection box | C46 |
| Covered Parent Transformation body or header | left click | Select the Transformation and open its data in the Node inspector | C64 |
| Covered Parent Transformation body or header | left drag | Move the Transformation and its descendants | C10, C64 |
| Canvas | Escape | Deselect the selected Node and close its inspector | C36 |
| Undo button | left click | Undo the latest Document action | H3, H9 |
| Redo button | left click | Redo the next recorded Document action | H3, H9 |
| Canvas outside a text editor | Ctrl/Cmd+Z | Undo the latest Document action | H3, H13 |
| Canvas outside a text editor | Ctrl/Cmd+Shift+Z or Ctrl+Y | Redo the next recorded Document action | H3, H13 |
| Transformation or Contract | left click | Select and inspect the Node, including its relevant off-screen inputs | C7, C19, C20 |
| Transformation or Contract | left drag | Move the Node and save its position | C10 |
| Selected Transformation or Contract | left drag | Move the selected Nodes together and save their positions | C47 |
| Contract Pair frame | left drag | Move both Contracts in the Contract Pair | C13 |
| Control Contract frame | left drag | Move both Contracts, or the whole selection when both are selected | C47, C69 |
| Node warning indicator | click or keyboard activation | Reveal rule violations | C67 |
| Document issues summary | click or keyboard activation | Reveal all rule violations | C68 |
| Contract half | left drag | Move only that Contract Node | C10, C13 |
| Parent Transformation expand button | left click | Show the Parent Transformation's descendants and declared Arc endpoints | C15, C17 |
| Parent Transformation collapse button | left click | Hide the Parent Transformation's descendants and project their Arc endpoints onto the Parent Transformation | C15–C17 |
| Parent Transformation Cover button | left click | Hide descendants while retaining container bounds | C61–C64 |
| Parent Transformation ordering button | left click | Open the DAG direction menu | C48 |
| DAG direction menu item | left click | Arrange the Parent Transformation's immediate Children in the chosen direction | C49–C51 |
| Parent Transformation spacing button | left click | Space immediate Children and remove resulting overlaps through ancestor levels | C58–C60 |
| Projected Contract | left click | Select and inspect the Contract represented by the boundary projection | C55 |
| Projected Contract | left drag | Move the represented Contract and save its position | C55 |
| Ghost Node | left click | Move the viewport to the identified Node | C23 |
| Leaf Transformation | inspector Differentiate control | Differentiate the Transformation | F1–F6 |
| Node inspector close button | left click | Deselect the selected Node and close its inspector | C34 |
| Minimap | left click or drag | Pan the camera without changing its zoom | C41, C42 |
