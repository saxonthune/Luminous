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

/** A user-managed Node Type: a name, drawn in one Color. Ids are author-chosen
 * and stable; the name is display text that may be renamed. */
export interface MerinoNodeType {
  id: string;
  name: string;
  color: MerinoColorToken;
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

export interface MerinoNode {
  id: string;
  tab: MerinoTab;
  /** Id of a Node Type in the registry. */
  type: string;
  name: string;
  /** Longer prose the Node carries — the detail a designer adds. */
  text?: string;
  /** Set on a Subnode: the parent Node it hangs off. The dotted parent link is
   * drawn from this field, never stored as an Edge. A Subnode shares its
   * parent's Tab. */
  parent?: string;
  /** Progressive disclosure: a Node is drawn at the uniform compact size until
   * the user pins it open, when it grows to show its detail body inline. */
  expanded?: boolean;
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

export interface MerinoDocument {
  v: number;
  nodeTypes: MerinoNodeType[];
  edgeTypes: MerinoEdgeType[];
  nodes: MerinoNode[];
  edges: MerinoEdge[];
}

export interface AddNodeTypeAction {
  type: 'addNodeType';
  id: string;
  name: string;
  color: MerinoColorToken;
}

export interface SetNodeTypeAction {
  type: 'setNodeType';
  id: string;
  name?: string;
  color?: MerinoColorToken;
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
  parent?: string;
  x?: number;
  y?: number;
}

export interface SetNodeAction {
  type: 'setNode';
  id: string;
  name?: string;
  text?: string;
  nodeType?: string;
  parent?: string | null;
  expanded?: boolean;
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
  | DisconnectAction;
