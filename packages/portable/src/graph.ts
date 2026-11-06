export interface EndpointUse { description: string; method: import('./rest.js').HttpMethod; endpoint: string }
import type { DiffKind } from './diff.js';
export interface PortableCard {
  /** Generated intrinsic geometry for nested schema disclosures; not author input. */
  measuredSize?: NodeMeasurement;
  component: 'card' | 'rest-card' | 'transition' | 'usage-card' | 'schema-card';
  fields?: { name: string; type: string; kind: 'identifier' | 'number' | 'text' | 'object' | 'collection' | 'choice' | 'reference'; optional?: boolean; diff?: DiffKind; schema?: PortableCard }[];
  description?: string;
  schemaKey?: string;
  usage?: { uiRoute: { paths: string[]; context: string }; startup: EndpointUse[]; capabilities: EndpointUse[] };
  methods?: import('./rest.js').HttpMethod[];
  diff?: DiffKind;
  info?: string;
  title: string;
  body?: string;
  footer?: { text: string; href?: string };
}
export interface PortableNode {
  id: string;
  label: string;
  card?: PortableCard;
  parentId?: string;
  group: boolean;
  direction?: 'RIGHT' | 'DOWN';
  classes: string[];
  kind?: string;
}
export interface PortableEdge {
  id: string;
  source: string;
  target: string;
  label: string;
  invisible: boolean;
  dashed: boolean;
  arrow: boolean;
}
export interface PortableGraph {
  nodes: PortableNode[];
  edges: PortableEdge[];
  direction: 'DOWN' | 'RIGHT';
}
export interface NodeRect { x: number; y: number; w: number; h: number }
export interface NodeMeasurement { w: number; h: number; headerHeight?: number }
export type NodeMeasurements = Record<string, NodeMeasurement>;
export type PortableLayout = Record<string, NodeRect>;
export interface PortableTheme {
  version: 1;
  styles: Record<string, { label: string; light: { fill: string; stroke: string }; dark: { fill: string; stroke: string } }>;
}
export interface LayoutHints { nonOrderingEdges: { source: string; target: string }[]; spine?: string[]; attachments?: { node: string; step: string; side: 'left' | 'right' }[] }
export interface PortableDiagram {
  id: string;
  mode?: 'action-flow' | 'rest-api-tree';
  graph: PortableGraph;
  defaultLayout: PortableLayout;
  measurements?: NodeMeasurements;
  settings?: { title?: string; scrollZoom?: boolean; layout?: LayoutHints; legend?: { entries: ({ class: string; label?: string } | { diff: DiffKind; label?: string })[] } };
}
export interface BundleSizeReport {
  javascriptBytes: number;
  cssBytes: number;
  contentBytes: number;
  packages: { name: string; renderedCharacters: number; modules: number }[];
}
export interface PortableArtifact {
  info?: Record<string, import('./import/extended-info.js').ExtendedInfo>;
  model?: import('./semantics.js').Model;
  bundleSize?: BundleSizeReport;
  debugPerformance?: boolean;
  title: string;
  sourceFilename: string;
  sourceMarkdown: string;
  html: string;
  diagrams: PortableDiagram[];
  theme?: PortableTheme;
}
