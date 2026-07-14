# Canvas cluster role: `'cluster'` EdgeRole, scene clusters, annotation-only underlays

## Motivation

In Luminous Canvas, containment is a view-time projection of `contain`-role
edges. The cluster is the weaker rung on the same ladder: a `cluster`-role
edge points from a member node to a hub node, and the view projects the
member set as an underlay envelope — no coordinate ownership, no layout
influence. Design: doc02.05.06. This is a pack-vocabulary addition, so the
luminous-pipeline skill updates in the same change.

## Do NOT

- Do NOT route cluster-role edges through `evaluateContainment` or impose
  its tree constraints (single kind, single parent, acyclic). Clusters get
  their own evaluator; multiple cluster kinds and overlapping membership
  are allowed and produce no warnings.
- Do NOT feed Canvas clusters into layout (`clusterId` stays unused here —
  annotation-only). `composeLayout`/ELK inputs are unchanged.
- Do NOT touch `NodeContainer`, `softContainer`, `sectionColorOf`, or paint
  order — envelope convergence is explicitly deferred (doc02.05.06
  "Adoption path" step 4).
- Do NOT add pack-file validation for the new role — views are passed
  verbatim (`parsePackJson.ts` passes `views` straight through); keep it
  that way.

## Plan

### 1. Core: role and evaluator

- `packages/core/src/types.ts`: add `'cluster'` to `EdgeRole`. Add a
  `ClusterProjection { hubId: string; memberIds: string[] }` (or similarly
  named) type and a `clusters: ClusterProjection[]` field on `SceneGraph`.
- New evaluator in `packages/core/src/graph.ts` (sibling to
  `evaluateContainment`): collect edges whose kind the view's `edgeRoles`
  maps to `'cluster'`; each edge contributes `edge.from` as a member of the
  cluster keyed by `edge.to` (the hub). A node may appear in several
  clusters; hubs with no members produce no cluster. No warnings, no
  constraints.
- `packages/core/src/view.ts` `evaluateView`: bucket cluster-role edges to
  the new evaluator (they must not fall through to arrows or hidden) and
  set `scene.clusters`.
- Core tests, following the existing `evaluateView`/`evaluateContainment`
  test style: cluster-role edges produce member sets keyed by hub;
  overlapping membership across two cluster kinds works; a view mapping the
  same kind to `arrow` still draws edges (role choice is per view).

### 2. Client: projection to cactus

In `packages/client/src/PgCanvasView.tsx`: a `clusterDeclarations` memo
(sibling to the `edgeDeclarations` memo at ~245) mapping `scene().clusters`
to cactus `ClusterDeclaration`s — `id` = hub id, `memberIds` filtered to
nodes actually rendered, `label` resolved from the hub node the same way
node titles resolve in the existing render context (fall back to the hub
id). Pass `clusters={...}` through to `<Canvas>` next to `edges`. Hub nodes
render (or not) purely by their own `nodeRoles` entry — no special-casing.

### 3. Skill update (same-change rule)

`.claude/skills/luminous-pipeline/SKILL.md`: document the `'cluster'` edge
role — the member→hub edge convention, that the hub node names/labels the
cluster, that membership may overlap, and that the projection is an
annotation underlay (no nesting, no layout effect). Follow the skill's
existing style for edge-role documentation.

## Files to Modify

- `packages/core/src/types.ts` — `EdgeRole` + `SceneGraph.clusters` + projection type
- `packages/core/src/graph.ts` — cluster evaluator
- `packages/core/src/view.ts` — bucketing in `evaluateView`
- core test file(s) — evaluator and view tests
- `packages/client/src/PgCanvasView.tsx` — `clusterDeclarations` memo + prop
- `.claude/skills/luminous-pipeline/SKILL.md` — `'cluster'` role documentation

## Verification

```bash
just test-core
just test-client
just typecheck
just build
just lint
```

## Out of Scope

- Layout-affecting clusters in Canvas (ELK/gridLayout know nothing of them).
- Container-envelope convergence, `sectionColorOf` coloring policy.
- Any graph mutation / nest-gesture writes.
- Deleting the dormant `computeAttach`/`computeDetach`/`findContainerAt`
  trio — separate cleanup task.

## Notes

- Cactus surface available (phase 1): `ClusterDeclaration {id, memberIds,
  label?, tint?}`; `Canvas clusters?: ClusterDeclaration[]` renders
  `data-cluster-id` underlay rects below the edge SVG.
- `evaluateContainment` throws when two kinds take `contain`; the cluster
  evaluator deliberately has no such rule — that asymmetry is the design.
- No example pack gains a cluster-role view here; a test fixture is enough.

## Surface after this phase

- `EdgeRole` includes `'cluster'`; `SceneGraph.clusters:
  {hubId, memberIds[]}[]` computed per view by a dedicated evaluator with
  no tree constraints.
- Luminous Canvas renders one underlay per hub with members on screen,
  labeled from the hub node.
- The luminous-pipeline skill documents the role.
- Negative space: containment evaluation, layout inputs, container visuals,
  and pack parsing/validation are unchanged; Canvas clusters have no layout
  effect.
