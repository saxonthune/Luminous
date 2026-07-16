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
}

export interface SetNodeAction {
  type: 'setNode';
  id: string;
  name?: string;
  content?: AtlasContent;
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
