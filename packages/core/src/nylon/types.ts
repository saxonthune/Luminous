export interface NylonDocument {
  v: number;
  title?: string;
  transformations: NylonTransformation[];
  contracts: NylonContract[];
  arcs: NylonArc[];
}

export interface NylonTransformation {
  id: string;
  name: string;
  prose?: string;
  /** Informal names or descriptions of the data this behavior requires. */
  needs?: string[];
  /** The input/output Contract Pair at this behavior's boundary. */
  contractPair?: NylonContractPair;
  /** The differentiated Transformation that contains this item. */
  parent?: string;
  /** Canvas position at the root, or position relative to the Parent Transformation. */
  x?: number;
  y?: number;
}

export interface NylonContractPair {
  input: string;
  output: string;
}

export interface NylonContract {
  id: string;
  name: string;
  /** Optional open vocabulary used to distinguish a Contract's role. */
  kind?: string;
  /** Freeform multiline data description: JSON, YAML, a language type, or prose. */
  text?: string;
  /** The differentiated Transformation that contains this item. */
  parent?: string;
  /** Canvas position at the root, or position relative to the Parent Transformation. */
  x?: number;
  y?: number;
}

export interface NylonArc {
  from: string;
  to: string;
}

export interface DifferentiateOptions {
  firstName?: string;
  contractName?: string;
  secondName?: string;
}

export interface AddTransformationOptions {
  id: string;
  name: string;
  prose?: string;
  needs?: string[];
  parent?: string | null;
  x?: number;
  y?: number;
}

export interface AddContractOptions {
  id: string;
  name: string;
  kind?: string;
  text?: string;
  parent?: string | null;
  x?: number;
  y?: number;
}

export interface UpdateNylonNodeOptions {
  name?: string;
  kind?: string;
  prose?: string;
  needs?: string[];
  text?: string;
}

export interface InsertArcOptions {
  transformation: Omit<AddTransformationOptions, 'parent'>;
  contract: Omit<AddContractOptions, 'parent'>;
  /** undefined infers from endpoint depth; null explicitly selects root. */
  parent?: string | null;
}

export type NylonBatchOperation =
  | { op: 'node.add'; nodeKind: 'transformation'; node: AddTransformationOptions }
  | { op: 'node.add'; nodeKind: 'contract'; node: AddContractOptions }
  | { op: 'node.update'; id: string; patch: UpdateNylonNodeOptions }
  | { op: 'node.reparent'; id: string; parent: string | null }
  | { op: 'node.move'; id: string; dx: number; dy: number }
  | { op: 'node.delete'; id: string; cascade?: boolean }
  | { op: 'arc.add'; from: string; to: string }
  | { op: 'arc.remove'; from: string; to: string }
  | { op: 'arc.replace'; oldFrom: string; oldTo: string; newFrom: string; newTo: string }
  | { op: 'arc.insert'; from: string; to: string; options: InsertArcOptions }
  | { op: 'contract-pair.set'; transformationId: string; input: string; output: string }
  | { op: 'contract-pair.clear'; transformationId: string }
  | { op: 'contract-pair.move'; transformationId: string; dx: number; dy: number }
  | { op: 'differentiate'; id: string; options?: DifferentiateOptions };

export type NylonResult =
  | { ok: true; doc: NylonDocument }
  | { ok: false; error: string };
