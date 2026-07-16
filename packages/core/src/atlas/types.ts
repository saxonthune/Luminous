export interface AtlasDocument {
  v: number;
  nodes: AtlasNode[];
  edges: AtlasEdge[];
}

export interface AtlasNode {
  id: string;
  name: string;
  parent?: string;
  description?: string;
  contract?: AtlasContract;
}

export interface AtlasContract {
  format: string;
  text: string;
}

export interface AtlasEdge {
  from: string;
  to: string;
  label?: string;
}
