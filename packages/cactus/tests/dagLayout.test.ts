import { describe, it, expect } from 'vitest'
import { dagLayout } from '../src/dagLayout'
import type { TidyNode } from '../src/tidyLayout'
import type { LayoutEdge } from '../src/layout'

function node(id: string, overrides: Partial<TidyNode> = {}): TidyNode {
  return { id, w: 100, h: 40, parentId: null, ...overrides }
}

describe('dagLayout clusters', () => {
  it('places clustered siblings contiguously and ranks the cluster as one unit', () => {
    // a -> x (x is in cluster "c1" with y, z); y and z have no other edges.
    const nodes: TidyNode[] = [
      node('a'),
      node('x', { clusterId: 'c1' }),
      node('y', { clusterId: 'c1' }),
      node('z', { clusterId: 'c1' }),
    ]
    const edges: LayoutEdge[] = [{ source: 'a', target: 'x' }]

    const result = dagLayout(nodes, edges)

    // All real ids present, no synthetic ids leaked.
    expect([...result.keys()].sort()).toEqual(['a', 'x', 'y', 'z'])

    // a ranks above the whole cluster (lower y) since the edge a->x lifts to
    // a->cluster at the root scope.
    const a = result.get('a')!
    const x = result.get('x')!
    const y = result.get('y')!
    const z = result.get('z')!
    expect(x.y).toBeGreaterThan(a.y)
    expect(y.y).toBeGreaterThan(a.y)
    expect(z.y).toBeGreaterThan(a.y)

    // Cluster members share the cluster's rank row (same y as each other).
    expect(x.y).toBe(y.y)
    expect(y.y).toBe(z.y)
  })

  it('drops synthetic ids from the result', () => {
    const nodes: TidyNode[] = [
      node('x', { clusterId: 'c1' }),
      node('y', { clusterId: 'c1' }),
    ]
    const result = dagLayout(nodes, [])
    for (const id of result.keys()) {
      expect(id.startsWith('__cluster__:')).toBe(false)
    }
  })

  it('a clusterId unique among its siblings is a no-op', () => {
    const withCluster: TidyNode[] = [node('a'), node('b', { clusterId: 'solo' })]
    const withoutCluster: TidyNode[] = [node('a'), node('b')]

    const resultWith = dagLayout(withCluster, [])
    const resultWithout = dagLayout(withoutCluster, [])

    expect(resultWith.get('a')).toEqual(resultWithout.get('a'))
    expect(resultWith.get('b')).toEqual(resultWithout.get('b'))
  })

  it('a cluster-free input produces identical output to before', () => {
    const nodes: TidyNode[] = [node('a'), node('b'), node('c', { parentId: 'a' })]
    const edges: LayoutEdge[] = [{ source: 'a', target: 'b' }]

    const result = dagLayout(nodes, edges)
    expect(result.get('a')).toEqual({ x: 0, y: 0 })
    expect(result.get('b')!.y).toBeGreaterThan(result.get('a')!.y)
    expect(result.get('c')).toBeDefined()
  })
})
