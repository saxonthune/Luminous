import type { AtlasColorToken } from './colors.ts';

export interface AtlasDocument {
  v: number;
  /** What each color means in this document (doc01.07.04 R61). Sparse: an
   * unlabeled token has no entry. */
  legend?: AtlasLegend;
  nodes: AtlasNode[];
  edges: AtlasEdge[];
}

export type AtlasLegend = Partial<Record<AtlasColorToken, string>>;

export interface AtlasNode {
  id: string;
  name: string;
  parent?: string;
  content?: AtlasContent;
  /** Offset from the parent's origin; canvas-absolute for a root node (no `parent`). */
  x?: number;
  /** Offset from the parent's origin; canvas-absolute for a root node (no `parent`). */
  y?: number;
  color?: AtlasColorToken;
  /** Stored override for the header band's height (a leaf's whole box, a
   * container's own-content band). Absent falls back to the fixed constant. */
  contentHeight?: number;
  /** Stored override for a leaf's width, or a container's own-content width
   * floor (still clamped up to children extent). Absent falls back to the
   * fixed constant. */
  contentWidth?: number;
}

export type AtlasContentMode = 'markdown' | 'code';

export interface AtlasContent {
  text: string;
  mode: AtlasContentMode;
  /** The Data File key that fills this Content; `text` is the fallback when the
   * key is absent (doc "Atlas Data File" phase). */
  from?: string;
}

export interface AtlasEdge {
  from: string;
  to: string;
}

export interface AddNodeAction {
  type: 'addNode';
  id: string;
  name: string;
  parent?: string;
  x?: number;
  y?: number;
  color?: AtlasColorToken;
}

export interface SetNodeAction {
  type: 'setNode';
  id: string;
  name?: string;
  content?: AtlasContent;
  x?: number;
  y?: number;
  color?: AtlasColorToken;
  contentHeight?: number;
  contentWidth?: number;
}

export interface RemoveNodeAction {
  type: 'removeNode';
  id: string;
}

export interface ReparentAction {
  type: 'reparent';
  id: string;
  parent?: string;
}

export interface AddEdgeAction {
  type: 'addEdge';
  from: string;
  to: string;
}

export interface RemoveEdgeAction {
  type: 'removeEdge';
  from: string;
  to: string;
}

/** Replaces the whole legend — the panel saves its full state atomically, and
 * whole-record replace is self-inverting for undo. `{}` clears it. */
export interface SetLegendAction {
  type: 'setLegend';
  legend: AtlasLegend;
}

export type AtlasAction =
  | AddNodeAction
  | SetNodeAction
  | RemoveNodeAction
  | ReparentAction
  | AddEdgeAction
  | RemoveEdgeAction
  | SetLegendAction;
