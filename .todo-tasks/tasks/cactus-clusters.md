# Cactus clusters: underlay layer, ClusterDeclaration, dagLayout clusterId

## Motivation

The cluster is cactus's envelope over a member set — a tinted rect computed
behind a set of nodes, with a label, and (when laminar) unit treatment in
layout. Design: doc02.05.06 (`.rhidoc/02-design/05-cactus/06-clusters.md`).
This phase adds the capability to the engine; the Dataflow Designer and
Luminous Canvas consume it in later phases.

## Do NOT

- Do NOT touch `NodeContainer`, `softContainer`, or any containment code
  (`parentId` handling, `resolveAbsolutePositionByParentOf`, `gridLayout`
  child policies). Clusters are a separate channel by design.
- Do NOT add interaction wiring (no pointer events, no drag, no label
  editing). The cluster rect and label are `pointer-events: none` — passive
  paint only.
- Do NOT render the underlay inside the nodes layer as a first child. It
  gets its own layer between the background and the edge SVG, so the tint
  never sits above edge lines.
- Do NOT let `dagLayout` return positions for the synthetic cluster
  containers — they are internal and resolved away before returning.
- Do NOT change existing `dagLayout` output for inputs without `clusterId`
  (regression guard: existing tests must pass unchanged).

## Plan

### 1. `ClusterDeclaration` and the underlay layer in `Canvas`

In `packages/cactus/src/Canvas.tsx` (layer stack around lines 271–360:
background → edge-lines SVG → nodes div → edge-labels SVG):

- Define and export `ClusterDeclaration { id: string; memberIds: string[];
  label?: string; tint?: string }` (place it next to `EdgeDeclaration`'s
  home).
- Add `clusters?: ClusterDeclaration[]` to the `Canvas` props.
- Insert a new full-size underlay layer div between the background and the
  edge-lines SVG, carrying the same viewport `transform` as the nodes layer,
  `pointer-events: none`.
- Render each cluster in it: a `createMemo` filters `getNodeRects()` (the
  reactive rect registry — same source `EdgeLayer` reads) to `memberIds`
  and runs `computeBounds` from `geometry/geometry.ts` with padding (~16).
  Empty member set or no registered rects → render nothing.
- The rect: semitransparent tint + border + radius, styled like the
  `softContainer` tint in `NodeContainer.tsx` (reuse
  `--cactus-container-tint` as the default; `tint` prop overrides). Stamp
  `data-cluster-id={id}` on the rect for tests and CSS.
- The label: small text at the bottom-right inside the rect, rendered when
  `label` is set.

### 2. `clusterId` in dagLayout

- Add `clusterId?: string` to `TidyNode` (defined in
  `packages/cactus/src/tidyLayout.ts` or `layout-types.ts` — follow where
  `parentId` lives).
- In `packages/cactus/src/dagLayout.ts`: before the recursion, for each set
  of same-parent siblings sharing a `clusterId`, synthesize one internal
  container node (id namespaced, e.g. `__cluster__:<parent>:<clusterId>`)
  and reparent those siblings onto it. Run the existing recursive layout
  unchanged — edge lifting already makes cross-cluster edges rank the
  synthetic container as a unit. Afterward, fold each synthetic container's
  position into its children (children of a synthetic container become
  positioned relative to the *real* parent scope) and drop the synthetic
  ids from the result. Nodes whose `clusterId` is unique among siblings, or
  absent, are unaffected.

### 3. Exports and tests

- Export `ClusterDeclaration` (and the `TidyNode` change flows through
  existing exports) from `packages/cactus/src/index.ts`.
- Tests in the cactus test suite, following the existing dagLayout test
  style:
  - siblings sharing a `clusterId` are placed contiguously and rank as one
    unit (an edge into one member ranks the whole cluster);
  - synthetic ids do not appear in the result; all real node ids do;
  - a cluster-free input produces identical output to before (snapshot or
    equality against the un-clustered call);
  - `computeBounds`-based cluster rect memo logic, if testable headlessly,
    via the existing component-test pattern — skip if cactus has no
    component-test precedent.

## Files to Modify

- `packages/cactus/src/Canvas.tsx` — `ClusterDeclaration`, `clusters` prop, underlay layer
- `packages/cactus/src/dagLayout.ts` — synthetic-container clustering
- `packages/cactus/src/tidyLayout.ts` or `layout-types.ts` — `TidyNode.clusterId?`
- `packages/cactus/src/index.ts` — export
- cactus test files next to `dagLayout` tests — new cluster tests

## Verification

```bash
just test-cactus
just typecheck
just lint
just build
```

## Out of Scope

- Interaction (label drag, rename) — extends `ClusterDeclaration` later.
- Any client/app usage — later phases.
- Cluster support in `gridLayout`/`composeLayout`/ELK — dagLayout only.

## Notes

- The laminar requirement (a node in at most one cluster, clusters not
  straddling parents) is guaranteed by callers passing a scalar per-node
  `clusterId`; dagLayout need not validate it.
- doc02.05.06 records the design; doc02.05.03 documents the layout
  primitives and can gain a `clusterId` sentence if quick.

## Surface after this phase

- `ClusterDeclaration { id, memberIds, label?, tint? }` exported from
  `@luminous/cactus`.
- `Canvas` accepts `clusters?: ClusterDeclaration[]` and renders each as a
  derived-bounds tinted rect with `data-cluster-id`, in an underlay layer
  below the edge SVG, live-updating from the node-rect registry.
- `TidyNode.clusterId?: string`; `dagLayout` lays out same-parent siblings
  sharing a `clusterId` contiguously as one rank unit; result contains only
  real node ids.
- Negative space: `NodeContainer`, `softContainer`, `EdgeDeclaration`,
  containment handling, and dagLayout output for cluster-free inputs are
  unchanged.
