import type { TraceNodeKind } from './kind-descriptors.ts';

export interface LinenDocument {
  v: number;
  modules: LinenModule[];
  contracts: LinenContract[];
  nodes: LinenTraceNode[];
  edges: LinenEdge[];
}

export interface LinenModule {
  id: string;
  name: string;
  /** Nests this Module inside another (a Deployment is a Module containing Modules). */
  parent?: string;
}

export interface LinenContract {
  id: string;
  name: string;
  /** The Module that owns this Contract. */
  owner?: string;
  /** The declared data shape, in the described system's notation. */
  text?: string;
}

interface LinenTraceNodeBase {
  id: string;
  /** The containing Module. */
  module: string;
  /** Selected-node prose: what happens here. */
  annotation?: string;
  x?: number;
  y?: number;
}

export interface LinenPassNode extends LinenTraceNodeBase {
  kind: 'pass';
  /** The Module passed to. The resume format is derived from a Contract
   * connected to this Module — never stored (the return rule). */
  to: string;
}

export interface LinenTypeNode extends LinenTraceNodeBase {
  kind: 'type';
  /** Set when the format is a named Contract rather than free text. */
  contract?: string;
}

export interface LinenPlainNode extends LinenTraceNodeBase {
  kind: Exclude<TraceNodeKind, 'pass' | 'type'>;
}

export type LinenTraceNode = LinenPlainNode | LinenPassNode | LinenTypeNode;

/** One Edge term, two uses distinguished by target: trace-node -> trace-node
 * carries control and Trace order; node-or-module -> contract is an "Edge to a
 * Contract". No stored discriminant — check.ts validates endpoint combinations. */
export interface LinenEdge {
  from: string;
  to: string;
}

export interface AddModuleAction {
  type: 'addModule';
  id: string;
  name: string;
  parent?: string;
}

export interface AddContractAction {
  type: 'addContract';
  id: string;
  name: string;
  owner?: string;
  text?: string;
}

export interface AddNodeAction {
  type: 'addNode';
  id: string;
  kind: TraceNodeKind;
  module: string;
  annotation?: string;
  x?: number;
  y?: number;
  to?: string;
  contract?: string;
}

export interface SetNodeAction {
  type: 'setNode';
  id: string;
  annotation?: string;
  x?: number;
  y?: number;
  to?: string;
  contract?: string;
}

export interface RemoveNodeAction {
  type: 'removeNode';
  id: string;
}

export interface ConnectAction {
  type: 'connect';
  from: string;
  to: string;
}

export interface DisconnectAction {
  type: 'disconnect';
  from: string;
  to: string;
}

export interface SetAnnotationAction {
  type: 'setAnnotation';
  id: string;
  annotation?: string;
}

export type LinenAction =
  | AddModuleAction
  | AddContractAction
  | AddNodeAction
  | SetNodeAction
  | RemoveNodeAction
  | ConnectAction
  | DisconnectAction
  | SetAnnotationAction;
