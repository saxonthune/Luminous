/**
 * @luminous/core — property-graph contract types.
 *
 * The interface shared by every part of the system: pipelines, packs, the
 * canvas runtime, MCP, and persistence all speak this vocabulary. See PDR
 * doc02.11 for the design rationale.
 *
 * Pure contract — no implementation. Implementation lives in the engine
 * (cactus, canvas client) and in packs (statechart, solid, rust, ...).
 *
 * Open contract questions are marked `// OPEN:`.
 */
import type { RenderNode } from './render/types.ts';

// ============================================================================
// Primitives
// ============================================================================

export type NodeId  = string;
export type EdgeId  = string;
export type KindId  = string;       // namespaced; e.g. "statechart.state", "rtp.concept"
export type ViewId  = string;
export type LayerId = string;
export type PackId  = string;

/**
 * A node in the property graph.
 *
 * Note: there is NO `parent` field. Containment is per-view and is computed
 * from `contain`-role edges by `evaluateContainment(graph, view)`.
 */
export interface Node {
  id: NodeId;
  kind: KindId;
  /** Typed per kind via NodeKind.propsSchema. */
  props: Record<string, unknown>;
  /** Free-form labels for ad-hoc filtering. Graduate to props when load-bearing. */
  tags: string[];
  /** Prior ids this node has had — used by the rename detector. Optional. */
  prevIds?: NodeId[];
}

/**
 * A directed-or-undirected edge in the property graph. Directedness is a
 * property of the edge's kind (see EdgeKind.directed), not the edge.
 */
export interface Edge {
  id: EdgeId;
  kind: KindId;
  from: NodeId;
  to: NodeId;
  props: Record<string, unknown>;
  tags: string[];
  prevIds?: EdgeId[];
}

/**
 * The composed, in-memory graph. Built by a GraphSource; consumed by views.
 *
 * Immutable. Live updates produce a new Graph reference. Solid signals re-fire
 * on the reference change; fine-grained re-evaluation happens via lookups.
 */
export interface Graph {
  nodes: ReadonlyMap<NodeId, Node>;
  edges: ReadonlyMap<EdgeId, Edge>;
  /** Edges grouped by kind — fast layer/role evaluation. */
  edgesByKind: ReadonlyMap<KindId, ReadonlySet<EdgeId>>;
  /** Adjacency indices for traversal. */
  outgoing: ReadonlyMap<NodeId, ReadonlySet<EdgeId>>;
  incoming: ReadonlyMap<NodeId, ReadonlySet<EdgeId>>;
  /** The single pack this graph declares, or '' if none. */
  pack: string;
  /** Optional markdown describing this canvas, shown in the info modal. */
  info?: string;
}

// ============================================================================
// Kind schemas — what a pack declares
// ============================================================================

/**
 * Minimal schema validator interface. Zod implements this shape; any
 * equivalent (Valibot, ArkType, hand-rolled) works.
 *
 * Kept as a structural type to avoid pulling Zod into core itself.
 */
export interface PropsSchema<T = unknown> {
  parse(input: unknown): T;
  safeParse(input: unknown): { success: true; data: T } | { success: false; error: unknown };
}

export interface NodeKind {
  id: KindId;
  label: string;
  propsSchema: PropsSchema;
  /** Derives a stable, deterministic id from source-key inputs. */
  idDerivation: (input: unknown) => NodeId;
  /** Default size hint for the canvas. Overridable per view. */
  defaultSize?: { w: number; h: number };
  /** Declarative renderer — interpreted instead of code when present. */
  render?: Partial<Record<DisclosureLevel, RenderNode>>;
}

export interface EdgeKind {
  id: KindId;
  label: string;
  propsSchema: PropsSchema;
  directed: boolean;
  /** UI hint, not enforced — which node kinds are legal at each end. */
  acceptsSource?: KindId[];
  acceptsTarget?: KindId[];
  /** Declarative renderer — interpreted instead of code when present. */
  render?: Partial<Record<DisclosureLevel, RenderNode>>;
}

// ============================================================================
// View semantics — the role system
// ============================================================================

/**
 * The role a node kind plays in a particular view.
 *
 * - `spatial` — has a position; rendered.
 * - `latent`  — present in the graph, not directly rendered (may appear via
 *               a `summary` chip on a spatial node).
 * - `hidden`  — excluded from this view entirely.
 */
export type NodeRole = 'spatial' | 'latent' | 'hidden';

/**
 * The role an edge kind plays in a particular view.
 *
 * - `contain` — child rendered inside parent's coordinate system. At most one
 *               edge kind per view may take this role.
 * - `arrow`   — drawn as a visible edge between two spatial nodes.
 * - `summary` — collapsed into a badge/count/chip on the source node.
 * - `hidden`  — present in the graph, not rendered in this view.
 */
export type EdgeRole = 'contain' | 'arrow' | 'summary' | 'hidden';

export type LayerState = 'on' | 'peek' | 'off';

export interface View {
  id: ViewId;
  name: string;
  description?: string;
  /** Role per scoped node kind. Unscoped kinds are implicitly hidden. */
  nodeRoles: Record<KindId, NodeRole>;
  /** Role per scoped edge kind. Unscoped kinds are implicitly hidden. */
  edgeRoles: Record<KindId, EdgeRole>;
  /** Default layer states for this view. User toggles override at runtime. */
  layers: Record<LayerId, LayerState>;
  layout: LayoutChoice;
  filter?: GraphQuery;
  camera?: { x: number; y: number; zoom: number };
  /** Zoom-scale → disclosure-level mapping. */
  zoomToLevel?: Array<{ minZoom: number; level: DisclosureLevel }>;
}

export type LayoutChoice =
  | { algorithm: 'manual' }
  | { algorithm: 'dagre'; options?: Record<string, unknown> }
  | { algorithm: 'elk'; direction?: 'RIGHT' | 'DOWN'; options?: Record<string, unknown> }
  | { algorithm: 'mrtree'; direction?: 'RIGHT' | 'DOWN'; options?: Record<string, unknown> }
  | { algorithm: 'grid'; options?: Record<string, unknown> }
  | { algorithm: 'treemap'; options?: Record<string, unknown> }
  | { algorithm: 'hierarchy'; options?: Record<string, unknown> }
  | { algorithm: 'force'; options?: Record<string, unknown> };

// OPEN: GraphQuery shape — textual DSL, JSON pattern, or both. PDR §15.3.
// For now, leave as unknown so the contract doesn't pre-commit.
export type GraphQuery = unknown;

// ============================================================================
// Containment — computed, not stored
// ============================================================================

/**
 * The per-view nesting tree. Produced by `evaluateContainment(graph, view)`,
 * not stored on nodes. PDR §4.3 invariants:
 *
 *   1. At most one edge kind plays `contain`.
 *   2. The containment subgraph is acyclic.
 *   3. Each node has exactly one containment parent per view (multiple edges
 *      of the contain kind to one node → take first, warn on the rest).
 */
export interface ContainmentTree {
  /** Nodes with no contain-edge parent in this view. */
  rootIds: NodeId[];
  /** Root id → its index in `rootIds`, for O(1) palette lookup. */
  rootIndex: ReadonlyMap<NodeId, number>;
  /** Parent → ordered children. */
  childrenOf: ReadonlyMap<NodeId, NodeId[]>;
  /** Child → its single containment parent in this view. */
  parentOf: ReadonlyMap<NodeId, NodeId>;
  /** Warnings emitted during evaluation (multiple parents, etc.). Non-fatal. */
  warnings: ContainmentWarning[];
}

export interface ContainmentWarning {
  code: 'multiple-parents' | 'cycle' | 'missing-node';
  nodeId: NodeId;
  message: string;
}

// ============================================================================
// Layers
// ============================================================================

export interface Layer {
  id: LayerId;
  name: string;
  /** Which edge kinds populate this layer. May be one kind or several. */
  edgeKinds: KindId[];
  defaultState: LayerState;
  style?: {
    color?: string;
    lineStyle?: 'solid' | 'dashed' | 'dotted';
    zIndex?: number;
  };
}

// ============================================================================
// Disclosure
// ============================================================================

export type DisclosureLevel = 'peek' | 'card' | 'open' | 'deep';

export interface DisclosureSchema {
  kind: KindId;
  /** Field paths into node.props selected at each level. */
  peek: string[];
  card: string[];
  open: string[];
  deep: string[];
}

// ============================================================================
// Renderers
// ============================================================================

/**
 * Reactive context passed to every renderer. The level signal updates as
 * the user zooms; renderers re-evaluate fine-grainedly through Solid.
 *
 * `JSX.Element` is intentionally `unknown` here so core does not
 * depend on solid-js. The canvas client narrows it to Solid's JSX type
 * at the boundary.
 */
export interface RenderContext {
  level: () => DisclosureLevel;
  zoom: () => number;
  view: View;
  /** The full graph — renderers query this for summary chips, related items, etc. */
  graph: Graph;
  /** True when this node has at least one child via the current view's containment relation. */
  hasChildren: (nodeId: NodeId) => boolean;
  /** Imperative: open the inspector on this node/edge. */
  inspect: (id: NodeId | EdgeId) => void;
  /** Section color for this node — the palette color of its top-level
   *  container ancestor. Undefined for top-level nodes. */
  sectionColorOf: (nodeId: NodeId) => string | undefined;
  /** The node currently being rendered — lets clamp primitives call inspect without an explicit id. */
  currentNodeId?: () => NodeId | undefined;
  /** True in the inspector panel — suppresses clamping so full content is visible. */
  expanded?: () => boolean;
}

// ============================================================================
// Packs — what a pipeline ships
// ============================================================================

/**
 * A pack bundles everything a domain needs: typed kinds, renderers, default
 * views, layers, disclosure schemas, and (optionally) named MCP queries.
 *
 * One object with four implicit buckets (schema / presentation / config /
 * MCP). PDR §5 commits to a three-part separation at the *module* level;
 * the Pack type unifies them at the import boundary.
 *
 * OPEN: when MCP-only consumers need schema without renderers, we may split
 * to PackSchema + PackPresentation + PackConfig. Not needed for v0.
 */
export interface Pack {
  id: PackId;
  version: string;
  description?: string;
  dependsOn?: Record<PackId, string>;

  // Schema (UI-free; loadable headless)
  nodeKinds: NodeKind[];
  edgeKinds: EdgeKind[];

  // Configuration (declarative)
  disclosureSchemas: DisclosureSchema[];
  layers: Layer[];
  views: View[];
  namedQueries?: NamedQuery[];
}

// ============================================================================
// GraphSource — where the graph comes from
// ============================================================================

/**
 * Abstraction over how the graph is loaded. The canvas takes a GraphSource;
 * it doesn't care whether the data lives on local disk, in a Yjs sync
 * server, or in an HTTP-served static bundle.
 *
 * For v0 there is exactly one implementation: a single-file static loader
 * that reads a `.graph.json` v3 document. Multi-doc composition (PDR §3.4)
 * lands later as another implementation behind this same interface.
 */
export interface GraphSource {
  load(): Promise<Graph>;
  /** Optional live updates. Returns an unsubscribe function. */
  subscribe?(cb: (graph: Graph) => void): () => void;
}

/**
 * The on-disk shape of a v3 single-file canvas. Read by the static loader.
 *
 * Schema, renderers, and views do not live here — they come from imported
 * packs. This file is data only.
 */
export interface GraphFileV3 {
  version: 3;
  /** The single pack this graph declares. Absent means no pack. */
  pack?: string;
  nodes: Node[];
  edges: Edge[];
  /** Which view id to open with. */
  defaultView?: ViewId;
  /** Optional markdown describing this canvas, shown in the info modal. */
  info?: string;
}

// ============================================================================
// MCP surface (forward-compatible; v0 ships no MCP server)
// ============================================================================

export interface NamedQuery {
  id: string;
  description: string;
  argsSchema: PropsSchema;
  /** Pure function over the graph. Returns ids or projected records. */
  execute: (graph: Graph, args: unknown) => unknown;
}

// ============================================================================
// Scene graph — the view evaluator's output
// ============================================================================

/**
 * Produced by `evaluateView(graph, view)`. Partitions the in-scope graph
 * according to the view's role assignments. Consumed by the renderer.
 */
export interface SceneGraph {
  /** Spatial nodes — have a position; rendered. Deterministic order. */
  spatialNodes: Node[];
  /** Latent nodes — present, not rendered; may appear via summary chips. */
  latentNodes: Node[];
  /** Edges with role `arrow` — drawn as visible lines. */
  arrows: Edge[];
  /** Edges with role `summary` — collapsed into chips on the source node. */
  summaryEdges: Edge[];
  /** Per-view nesting tree from the contain-role edge subset. */
  containment: ContainmentTree;
  /** Non-fatal evaluation warnings. */
  warnings: SceneWarning[];
}

export interface SceneWarning {
  code: 'latent-without-summary' | 'orphan-summary-edge' | 'unknown-kind-role';
  /** Node or edge id this warning pertains to, when applicable. */
  id?: NodeId | EdgeId;
  message: string;
}
