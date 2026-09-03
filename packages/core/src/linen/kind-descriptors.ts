/** The Trace Node type table — the single source for kinds. Checks, rendering,
 * MCP schemas, and generated references derive from these entries; a rename is
 * an edit here plus a version-keyed migration in migrate.ts. */

export interface KindRules {
  /** Most incoming control Edges the node may have (0 = a Trace starts here). */
  maxIn?: number;
  /** Exactly this many outgoing control Edges may continue the Trace; an exit
   * to a terminating node does not count. */
  continuingExits?: number;
  /** The Trace ends here: no outgoing control Edge. */
  terminates?: boolean;
  /** The node must name the Module passed to (`to`). */
  requiresTarget?: boolean;
}

export interface KindDescriptor {
  kind: string;
  term: string;
  gloss: string;
  glyph: string;
  rules: KindRules;
}

export const KIND_DESCRIPTORS = [
  {
    kind: 'entry',
    term: 'Entry',
    gloss: 'Where a Trace starts: the arrival of a request or event.',
    glyph: 'entry',
    rules: { maxIn: 0 },
  },
  {
    kind: 'filter',
    term: 'Filter',
    gloss: 'A guard clause: a switch where only one path leads to effects; the other cases return immediately with an error.',
    glyph: 'filter',
    rules: { continuingExits: 1 },
  },
  {
    kind: 'switch',
    term: 'Switch',
    gloss: 'A branching point (if, match/switch) where more than one path continues.',
    glyph: 'switch',
    rules: {},
  },
  {
    kind: 'transformation',
    term: 'Transformation',
    gloss: 'A step that maps data from one format to another (mapping rules).',
    glyph: 'transformation',
    rules: {},
  },
  {
    kind: 'type',
    term: 'Type',
    gloss: 'The format of the data at a point in the Trace, drawn between steps.',
    glyph: 'type',
    rules: {},
  },
  {
    kind: 'pass',
    term: 'Pass',
    gloss: 'Control passes to another Module and the Trace suspends until it resumes. The resumed data format comes from a Contract connected to the Module being passed to.',
    glyph: 'pass',
    rules: { requiresTarget: true },
  },
  {
    kind: 'return',
    term: 'Return',
    gloss: 'An early exit from a Trace (the failing cases of a Filter).',
    glyph: 'return',
    rules: { terminates: true },
  },
  {
    kind: 'release-control',
    term: 'Release Control',
    gloss: 'The end of a Trace: control leaves the drawn system.',
    glyph: 'release-control',
    rules: { terminates: true },
  },
] as const satisfies readonly KindDescriptor[];

export type TraceNodeKind = (typeof KIND_DESCRIPTORS)[number]['kind'];

export const TRACE_NODE_KINDS: readonly TraceNodeKind[] = KIND_DESCRIPTORS.map(d => d.kind);

const BY_KIND = new Map<string, KindDescriptor>(KIND_DESCRIPTORS.map(d => [d.kind, d]));

export function isTraceNodeKind(value: unknown): value is TraceNodeKind {
  return typeof value === 'string' && BY_KIND.has(value);
}

export function kindDescriptor(kind: TraceNodeKind): KindDescriptor {
  return BY_KIND.get(kind)!;
}
