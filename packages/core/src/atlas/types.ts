import type { AtlasColorToken } from './colors.ts';

export interface AtlasDocument {
  v: number;
  nodes: AtlasNode[];
  edges: AtlasEdge[];
}

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
}

export type AtlasContentMode = 'markdown' | 'code';

export interface AtlasContent {
  text: string;
  mode: AtlasContentMode;
}

export interface AtlasEdge {
  from: string;
  to: string;
  label?: string;
}

export interface AddNodeAction {
  type: 'addNode';
  id: string;
  name: string;
  parent?: string;
  x?: number;
  y?: number;
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

export type AtlasAction = AddNodeAction | SetNodeAction | RemoveNodeAction | ReparentAction;
