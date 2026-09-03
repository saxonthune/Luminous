import type { MerinoColorToken } from './colors.ts';

/** The two Tabs. An Edge never crosses between them — both endpoints and the
 * Edge itself carry the same Tab. */
export type MerinoTab = 'requirements' | 'deployments';

export const MERINO_TABS: readonly MerinoTab[] = ['requirements', 'deployments'];

export function isMerinoTab(v: unknown): v is MerinoTab {
  return v === 'requirements' || v === 'deployments';
}

export type MerinoDash = 'solid' | 'dashed' | 'dotted';

export const MERINO_DASHES: readonly MerinoDash[] = ['solid', 'dashed', 'dotted'];

export function isMerinoDash(v: unknown): v is MerinoDash {
  return v === 'solid' || v === 'dashed' || v === 'dotted';
}

/** How a Node Type arranges the children hung off it. `container` draws them
 * freely placed inside the box; `list` stacks them top-to-bottom in an explicit
 * order. Absent means the Type is a leaf — its children tether as dotted
 * Subnodes instead. */
export type MerinoContainerLayout = 'container' | 'list';

export const MERINO_CONTAINER_LAYOUTS: readonly MerinoContainerLayout[] = ['container', 'list'];

export function isMerinoContainerLayout(v: unknown): v is MerinoContainerLayout {
  return v === 'container' || v === 'list';
}

/** A user-managed Node Type: a name, drawn in one Color. Ids are author-chosen
 * and stable; the name is display text that may be renamed. */
export interface MerinoNodeType {
  id: string;
  name: string;
  color: MerinoColorToken;
  /** When set, a Node of this Type holds its children inside its box rather than
   * tethering them by a dotted Edge — `container` for free placement, `list`
   * for a vertical ordered stack. Membership is never type-restricted; either
   * flavor accepts a child of any Type. Omitted when the Type is a leaf. */
  layout?: MerinoContainerLayout;
  /** Instructions for an agent editing any Node of this Type. */
  agentGuidance?: string;
}

/** A user-managed Edge Type: a name plus the style every Edge of this Type is
 * drawn in. */
export interface MerinoEdgeType {
  id: string;
  name: string;
  color: MerinoColorToken;
  dash: MerinoDash;
  /** Whether the Edge is drawn with an arrowhead at its target. */
  arrowHead: boolean;
  /** Whether the Edge means a direction (source → target) rather than a plain
   * association. Recorded for meaning; the arrowhead controls the drawing. */
  directed: boolean;
}

/** A side of a Container's box a boundary Port clasps. */
export type MerinoPortSide = 'top' | 'right' | 'bottom' | 'left';

export const MERINO_PORT_SIDES: readonly MerinoPortSide[] = ['top', 'right', 'bottom', 'left'];

export function isMerinoPortSide(v: unknown): v is MerinoPortSide {
  return v === 'top' || v === 'right' || v === 'bottom' || v === 'left';
}

/** Where one boundary Port sits: which side of the box, and how far along it
 * (0 at the top/left corner, 1 at the bottom/right). */
export interface MerinoPortPosition {
  side: MerinoPortSide;
  offset: number;
}

/** A Container's two shared boundary Ports — where Edges leaving the box cross
 * out (`exit`) and where Edges arriving cross in (`entry`). Copied from Atlas's
 * port model; Merino keeps its own copy so the two can diverge. */
export interface MerinoPorts {
  entry?: MerinoPortPosition;
  exit?: MerinoPortPosition;
}

export interface MerinoNode {
  id: string;
  tab: MerinoTab;
  /** Id of a Node Type in the registry. */
  type: string;
  name: string;
  /** Longer prose the Node carries — the detail a designer adds. */
  text?: string;
  /** Instructions or context specific to this Node for an agent author. */
  agentGuidance?: string;
  /** Set on a Subnode: the parent Node it hangs off. The dotted parent link is
   * drawn from this field, never stored as an Edge. A Subnode shares its
   * parent's Tab. */
  parent?: string;
  /** Progressive disclosure: a Node is drawn at the uniform compact size until
   * the user pins it open, when it grows to show its detail body inline. */
  expanded?: boolean;
  /** Ordinal within a `list`-layout Container parent — children are stacked by
   * ascending order. Meaningful only while the parent's Type is a `list`; x/y
   * are ignored there. Omitted otherwise. */
  order?: number;
  /** Authored placements for this Container's two shared boundary Ports. Only
   * meaningful on a Container Node; a leaf carries none. */
  ports?: MerinoPorts;
  /** User-set floors for a Container's outer box. Its children can always make
   * either dimension larger; they can never be clipped by a smaller floor. */
  width?: number;
  height?: number;
  x?: number;
  y?: number;
}

export interface MerinoEdge {
  id: string;
  tab: MerinoTab;
  /** Id of an Edge Type in the registry. */
  type: string;
  from: string;
  to: string;
}

export interface MerinoOverviewRequirements {
  /** Ordered stable Node ids shown as root Cards in the Requirements Overview. */
  rootNodeIds: string[];
}

export interface MerinoOverviewConfig {
  requirements?: MerinoOverviewRequirements;
}

export interface MerinoDocument {
  v: number;
  nodeTypes: MerinoNodeType[];
  edgeTypes: MerinoEdgeType[];
  nodes: MerinoNode[];
  edges: MerinoEdge[];
  /** Persisted membership and ordering for Merino's semantic Overview. */
  overview?: MerinoOverviewConfig;
  /** Workspace-wide instructions for an agent author. */
  agentGuidance?: string;
}

export interface AddNodeTypeAction {
  type: 'addNodeType';
  id: string;
  name: string;
  color: MerinoColorToken;
  layout?: MerinoContainerLayout;
  agentGuidance?: string;
}

export interface SetNodeTypeAction {
  type: 'setNodeType';
  id: string;
  name?: string;
  color?: MerinoColorToken;
  layout?: MerinoContainerLayout;
  agentGuidance?: string;
}

export interface RemoveNodeTypeAction {
  type: 'removeNodeType';
  id: string;
}

export interface AddEdgeTypeAction {
  type: 'addEdgeType';
  id: string;
  name: string;
  color: MerinoColorToken;
  dash: MerinoDash;
  arrowHead: boolean;
  directed: boolean;
}

export interface SetEdgeTypeAction {
  type: 'setEdgeType';
  id: string;
  name?: string;
  color?: MerinoColorToken;
  dash?: MerinoDash;
  arrowHead?: boolean;
  directed?: boolean;
}

export interface RemoveEdgeTypeAction {
  type: 'removeEdgeType';
  id: string;
}

export interface AddNodeAction {
  type: 'addNode';
  id: string;
  tab: MerinoTab;
  nodeType: string;
  name: string;
  text?: string;
  agentGuidance?: string;
  parent?: string;
  /** Semantic placement inside a Container. `append` deliberately omits stale
   * world coordinates; freeform placement is derived by the projection and a
   * list receives its next order. */
  placement?: 'append';
  order?: number;
  x?: number;
  y?: number;
}

export interface SetNodeAction {
  type: 'setNode';
  id: string;
  name?: string;
  text?: string;
  agentGuidance?: string;
  nodeType?: string;
  parent?: string | null;
  placement?: 'append';
  expanded?: boolean;
  order?: number;
  /** Whole-record replacement of the Node's boundary Ports. Omission leaves
   * them unchanged. */
  ports?: MerinoPorts;
  width?: number;
  height?: number;
  x?: number;
  y?: number;
}

export interface RemoveNodeAction {
  type: 'removeNode';
  id: string;
}

export interface ConnectAction {
  type: 'connect';
  id: string;
  edgeType: string;
  from: string;
  to: string;
}

export interface SetEdgeAction {
  type: 'setEdge';
  id: string;
  edgeType: string;
}

export interface DisconnectAction {
  type: 'disconnect';
  id: string;
}

export interface SetDocumentGuidanceAction {
  type: 'setDocumentGuidance';
  agentGuidance?: string;
}

export interface SetOverviewRequirementsRootsAction {
  type: 'setOverviewRequirementsRoots';
  rootNodeIds: string[];
}

export type MerinoAction =
  | AddNodeTypeAction
  | SetNodeTypeAction
  | RemoveNodeTypeAction
  | AddEdgeTypeAction
  | SetEdgeTypeAction
  | RemoveEdgeTypeAction
  | AddNodeAction
  | SetNodeAction
  | RemoveNodeAction
  | ConnectAction
  | SetEdgeAction
  | DisconnectAction
  | SetOverviewRequirementsRootsAction
  | SetDocumentGuidanceAction;

/** A batch action may name the id it creates.  Later actions may use
 * `$ref:<name>` anywhere an id is accepted.  Merino ids are author-supplied,
 * so a reference is an ordering aid, not an additional id generator. */
export type MerinoBatchAction = MerinoAction & { ref?: string };
