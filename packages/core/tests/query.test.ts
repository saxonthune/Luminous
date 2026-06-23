import { describe, it, expect } from 'vitest';
import { buildGraph } from '../src/graph.ts';
import { matchNode, matchEdge, queryNodes, queryEdges, neighborhood } from '../src/query.ts';
import type { Node, Edge } from '../src/types.ts';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

function node(id: string, kind: string, props: Record<string, unknown> = {}, tags: string[] = []): Node {
  return { id, kind, props, tags };
}

function edge(id: string, kind: string, from: string, to: string, props: Record<string, unknown> = {}, tags: string[] = []): Edge {
  return { id, kind, from, to, props, tags };
}

const A = node('a', 'component', { name: 'Alpha', score: 10, meta: { owner: 'alice' } }, ['public', 'stable']);
const B = node('b', 'signal',    { name: 'Beta',  score: 5,  meta: { owner: 'bob' }   }, ['internal']);
const C = node('c', 'component', { name: 'Gamma', score: 20, meta: { owner: 'alice' } }, ['public']);

const E1 = edge('e1', 'uses',    'a', 'b', { weight: 3 }, ['hot']);
const E2 = edge('e2', 'imports', 'b', 'c', { weight: 1 }, []);
const E3 = edge('e3', 'uses',    'a', 'c', { weight: 7 }, ['cold']);

const graph = buildGraph([A, B, C], [E1, E2, E3]);

// ---------------------------------------------------------------------------
// PropPredicate ops
// ---------------------------------------------------------------------------

describe('matchNode — PropPredicate ops', () => {
  it('eq matches exact value', () => {
    expect(matchNode(A, { props: { name: { op: 'eq', value: 'Alpha' } } })).toBe(true);
    expect(matchNode(A, { props: { name: { op: 'eq', value: 'Beta' } } })).toBe(false);
  });

  it('eq bare scalar shorthand', () => {
    expect(matchNode(A, { props: { name: 'Alpha' } })).toBe(true);
    expect(matchNode(A, { props: { score: 10 } })).toBe(true);
    expect(matchNode(A, { props: { score: 99 } })).toBe(false);
  });

  it('ne', () => {
    expect(matchNode(A, { props: { name: { op: 'ne', value: 'Beta' } } })).toBe(true);
    expect(matchNode(A, { props: { name: { op: 'ne', value: 'Alpha' } } })).toBe(false);
  });

  it('exists', () => {
    expect(matchNode(A, { props: { name: { op: 'exists' } } })).toBe(true);
    expect(matchNode(A, { props: { missing: { op: 'exists' } } })).toBe(false);
  });

  it('absent', () => {
    expect(matchNode(A, { props: { missing: { op: 'absent' } } })).toBe(true);
    expect(matchNode(A, { props: { name: { op: 'absent' } } })).toBe(false);
  });

  it('in', () => {
    expect(matchNode(A, { props: { score: { op: 'in', values: [10, 20] } } })).toBe(true);
    expect(matchNode(A, { props: { score: { op: 'in', values: [5, 20] } } })).toBe(false);
  });

  it('gt', () => {
    expect(matchNode(A, { props: { score: { op: 'gt', value: 5 } } })).toBe(true);
    expect(matchNode(A, { props: { score: { op: 'gt', value: 10 } } })).toBe(false);
    expect(matchNode(A, { props: { name: { op: 'gt', value: 5 } } })).toBe(false);
  });

  it('gte', () => {
    expect(matchNode(A, { props: { score: { op: 'gte', value: 10 } } })).toBe(true);
    expect(matchNode(A, { props: { score: { op: 'gte', value: 11 } } })).toBe(false);
  });

  it('lt', () => {
    expect(matchNode(A, { props: { score: { op: 'lt', value: 15 } } })).toBe(true);
    expect(matchNode(A, { props: { score: { op: 'lt', value: 10 } } })).toBe(false);
  });

  it('lte', () => {
    expect(matchNode(A, { props: { score: { op: 'lte', value: 10 } } })).toBe(true);
    expect(matchNode(A, { props: { score: { op: 'lte', value: 9 } } })).toBe(false);
  });

  it('contains — string substring', () => {
    expect(matchNode(A, { props: { name: { op: 'contains', value: 'lph' } } })).toBe(true);
    expect(matchNode(A, { props: { name: { op: 'contains', value: 'xyz' } } })).toBe(false);
  });

  it('contains — array membership', () => {
    const n = node('x', 'k', { items: ['a', 'b', 'c'] });
    expect(matchNode(n, { props: { items: { op: 'contains', value: 'b' } } })).toBe(true);
    expect(matchNode(n, { props: { items: { op: 'contains', value: 'd' } } })).toBe(false);
  });

  it('contains — non-string/non-array → false', () => {
    expect(matchNode(A, { props: { score: { op: 'contains', value: '1' } } })).toBe(false);
  });

  it('regex — match', () => {
    expect(matchNode(A, { props: { name: { op: 'regex', value: '^Alp' } } })).toBe(true);
    expect(matchNode(A, { props: { name: { op: 'regex', value: '^Beta' } } })).toBe(false);
  });

  it('regex — invalid pattern → no match (does not throw)', () => {
    expect(() => matchNode(A, { props: { name: { op: 'regex', value: '[invalid' } } })).not.toThrow();
    expect(matchNode(A, { props: { name: { op: 'regex', value: '[invalid' } } })).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Dot-path resolution
// ---------------------------------------------------------------------------

describe('matchNode — dot-path resolution', () => {
  it('resolves nested path', () => {
    expect(matchNode(A, { props: { 'meta.owner': 'alice' } })).toBe(true);
    expect(matchNode(A, { props: { 'meta.owner': 'bob' } })).toBe(false);
  });

  it('missing intermediate → absent', () => {
    expect(matchNode(A, { props: { 'meta.missing.deep': { op: 'absent' } } })).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Tags
// ---------------------------------------------------------------------------

describe('matchNode — tags', () => {
  it('any — at least one present', () => {
    expect(matchNode(A, { tags: { any: ['public', 'internal'] } })).toBe(true);
    expect(matchNode(B, { tags: { any: ['public', 'stable'] } })).toBe(false);
  });

  it('all — every present', () => {
    expect(matchNode(A, { tags: { all: ['public', 'stable'] } })).toBe(true);
    expect(matchNode(A, { tags: { all: ['public', 'internal'] } })).toBe(false);
  });

  it('none — excludes all', () => {
    expect(matchNode(A, { tags: { none: ['internal'] } })).toBe(true);
    expect(matchNode(B, { tags: { none: ['internal'] } })).toBe(false);
  });

  it('combined any+none', () => {
    expect(matchNode(A, { tags: { any: ['public'], none: ['internal'] } })).toBe(true);
    expect(matchNode(A, { tags: { any: ['public'], none: ['stable'] } })).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// kind — scalar and array
// ---------------------------------------------------------------------------

describe('matchNode — kind', () => {
  it('scalar match', () => {
    expect(matchNode(A, { kind: 'component' })).toBe(true);
    expect(matchNode(A, { kind: 'signal' })).toBe(false);
  });

  it('array any-of', () => {
    expect(matchNode(A, { kind: ['component', 'signal'] })).toBe(true);
    expect(matchNode(A, { kind: ['signal'] })).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// matchEdge — from / to
// ---------------------------------------------------------------------------

describe('matchEdge — from/to', () => {
  it('from scalar', () => {
    expect(matchEdge(E1, { from: 'a' })).toBe(true);
    expect(matchEdge(E1, { from: 'b' })).toBe(false);
  });

  it('from array', () => {
    expect(matchEdge(E1, { from: ['a', 'b'] })).toBe(true);
    expect(matchEdge(E1, { from: ['b', 'c'] })).toBe(false);
  });

  it('to scalar', () => {
    expect(matchEdge(E1, { to: 'b' })).toBe(true);
    expect(matchEdge(E1, { to: 'c' })).toBe(false);
  });

  it('to array', () => {
    expect(matchEdge(E1, { to: ['b', 'c'] })).toBe(true);
    expect(matchEdge(E1, { to: ['c'] })).toBe(false);
  });

  it('kind on edge', () => {
    expect(matchEdge(E1, { kind: 'uses' })).toBe(true);
    expect(matchEdge(E2, { kind: 'uses' })).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// and / or / not composition
// ---------------------------------------------------------------------------

describe('boolean composition', () => {
  it('and — all must match', () => {
    expect(matchNode(A, { and: [{ kind: 'component' }, { props: { score: 10 } }] })).toBe(true);
    expect(matchNode(A, { and: [{ kind: 'component' }, { props: { score: 5 } }] })).toBe(false);
  });

  it('or — at least one must match', () => {
    expect(matchNode(B, { or: [{ kind: 'component' }, { kind: 'signal' }] })).toBe(true);
    expect(matchNode(B, { or: [{ kind: 'component' }, { kind: 'other' }] })).toBe(false);
  });

  it('not — inverts', () => {
    expect(matchNode(A, { not: { kind: 'signal' } })).toBe(true);
    expect(matchNode(A, { not: { kind: 'component' } })).toBe(false);
  });

  it('empty query matches all', () => {
    expect(matchNode(A, {})).toBe(true);
    expect(matchNode(B, {})).toBe(true);
    expect(matchEdge(E1, {})).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// queryNodes / queryEdges
// ---------------------------------------------------------------------------

describe('queryNodes', () => {
  it('returns all on empty query', () => {
    expect(queryNodes(graph, {})).toHaveLength(3);
  });

  it('filters by kind', () => {
    const result = queryNodes(graph, { kind: 'component' });
    expect(result.map((n) => n.id)).toEqual(['a', 'c']);
  });

  it('filters by prop', () => {
    const result = queryNodes(graph, { props: { 'meta.owner': 'alice' } });
    expect(result.map((n) => n.id)).toEqual(['a', 'c']);
  });

  it('insertion order preserved', () => {
    const result = queryNodes(graph, {});
    expect(result.map((n) => n.id)).toEqual(['a', 'b', 'c']);
  });
});

describe('queryEdges', () => {
  it('returns all on empty query', () => {
    expect(queryEdges(graph, {})).toHaveLength(3);
  });

  it('filters by kind', () => {
    const result = queryEdges(graph, { kind: 'uses' });
    expect(result.map((e) => e.id)).toEqual(['e1', 'e3']);
  });

  it('filters by from', () => {
    const result = queryEdges(graph, { from: 'b' });
    expect(result.map((e) => e.id)).toEqual(['e2']);
  });

  it('insertion order preserved', () => {
    const result = queryEdges(graph, {});
    expect(result.map((e) => e.id)).toEqual(['e1', 'e2', 'e3']);
  });
});

// ---------------------------------------------------------------------------
// neighborhood
// ---------------------------------------------------------------------------

describe('neighborhood', () => {
  it('hops=0 returns seed only, no edges', () => {
    const result = neighborhood(graph, 'a', 0);
    expect(result.nodes.map((n) => n.id)).toEqual(['a']);
    expect(result.edges).toHaveLength(0);
  });

  it('hops=1 from a — follows outgoing (a→b, a→c)', () => {
    const result = neighborhood(graph, 'a', 1);
    expect(result.nodes.map((n) => n.id).sort()).toEqual(['a', 'b', 'c']);
    expect(result.edges.map((e) => e.id).sort()).toEqual(['e1', 'e3']);
  });

  it('hops=1 from b — undirected (follows incoming a→b and outgoing b→c)', () => {
    const result = neighborhood(graph, 'b', 1);
    const nodeIds = result.nodes.map((n) => n.id).sort();
    const edgeIds = result.edges.map((e) => e.id).sort();
    expect(nodeIds).toEqual(['a', 'b', 'c']);
    expect(edgeIds).toEqual(['e1', 'e2']);
  });

  it('hops=2 from a — reaches all nodes and all edges', () => {
    const result = neighborhood(graph, 'a', 2);
    expect(result.nodes.map((n) => n.id).sort()).toEqual(['a', 'b', 'c']);
    expect(result.edges.map((e) => e.id).sort()).toEqual(['e1', 'e2', 'e3']);
  });

  it('unknown id → empty', () => {
    const result = neighborhood(graph, 'nonexistent');
    expect(result.nodes).toHaveLength(0);
    expect(result.edges).toHaveLength(0);
  });

  it('default hops=1', () => {
    const explicit = neighborhood(graph, 'a', 1);
    const implicit = neighborhood(graph, 'a');
    expect(implicit.nodes.map((n) => n.id).sort()).toEqual(explicit.nodes.map((n) => n.id).sort());
    expect(implicit.edges.map((e) => e.id).sort()).toEqual(explicit.edges.map((e) => e.id).sort());
  });
});
