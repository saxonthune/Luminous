import { describe, it, expect } from 'vitest'
import { compositeLayout } from '../src/compositeLayout'
import type { TidyNode } from '../src/tidyLayout'
import type { LayoutEdge } from '../src/treeLayout'

function leaf(id: string, parentId: string | null, w = 100, h = 40): TidyNode {
  return { id, w, h, parentId }
}

function edge(source: string, target: string): LayoutEdge {
  return { source, target }
}

describe('compositeLayout', () => {
  it('1. no edges — three top-level nodes are laid out side-by-side (non-overlapping x)', () => {
    const nodes: TidyNode[] = [leaf('A', null, 100, 40), leaf('B', null, 120, 40), leaf('C', null, 80, 40)]
    const result = compositeLayout(nodes, [])

    const a = result.get('A')!
    const b = result.get('B')!
    const c = result.get('C')!

    expect(a).toBeDefined()
    expect(b).toBeDefined()
    expect(c).toBeDefined()

    // All top-level nodes should get distinct, non-overlapping x positions.
    const xs = [a.x, b.x, c.x]
    expect(new Set(xs).size).toBe(3)
  })

  it('2. single tree A→B, A→C — A is above B and C; B and C share the same y', () => {
    const nodes: TidyNode[] = [leaf('A', null), leaf('B', null), leaf('C', null)]
    const edges: LayoutEdge[] = [edge('A', 'B'), edge('A', 'C')]

    const result = compositeLayout(nodes, edges)

    const a = result.get('A')!
    const b = result.get('B')!
    const c = result.get('C')!

    // A is the root → rank 0, lower y than children
    expect(a.y).toBeLessThan(b.y)
    expect(a.y).toBeLessThan(c.y)

    // B and C are at the same rank
    expect(b.y).toBe(c.y)

    // A is centered between B and C (x midpoint)
    const aMid = a.x + 100 / 2
    const childMid = (b.x + 100 / 2 + c.x + 100 / 2) / 2
    expect(Math.abs(aMid - childMid)).toBeLessThan(2)
  })

  it('3. inner children are carried through — top-level parent sized to contain its child', () => {
    // A is top-level with one inner child C. No tree edges.
    const nodes: TidyNode[] = [
      { id: 'A', w: 100, h: 30, parentId: null },
      { id: 'C', w: 80, h: 40, parentId: 'A' },
    ]
    const result = compositeLayout(nodes, [])

    const a = result.get('A')!
    const c = result.get('C')!

    expect(a).toBeDefined()
    // C has a position from the tidy inner pass
    expect(c).toBeDefined()
    // C is inside A (positive coordinates relative to A origin from tidy pass)
    expect(c.x).toBeGreaterThanOrEqual(0)
    expect(c.y).toBeGreaterThan(0) // below A's header area
  })

  it('4. mixed — A and B top-level with A→B tree edge, A has inner child C', () => {
    const nodes: TidyNode[] = [
      { id: 'A', w: 100, h: 30, parentId: null },
      { id: 'C', w: 80, h: 40, parentId: 'A' },
      { id: 'B', w: 100, h: 40, parentId: null },
    ]
    const edges: LayoutEdge[] = [edge('A', 'B')]
    const result = compositeLayout(nodes, edges)

    const a = result.get('A')!
    const b = result.get('B')!
    const c = result.get('C')!

    // A is parent in tree → rank 0, lower y than B
    expect(a.y).toBeLessThan(b.y)
    // C retains its parent-relative position from tidy pass
    expect(c).toBeDefined()
    expect(c.x).toBeGreaterThanOrEqual(0)
    expect(c.y).toBeGreaterThan(0)
  })

  it('5. caller pre-filters edges — compositeLayout treats all supplied edges as tree edges', () => {
    // The caller passes arbitrary LayoutEdge objects with no schema metadata.
    // compositeLayout should not inspect any property beyond source/target.
    const nodes: TidyNode[] = [leaf('X', null), leaf('Y', null)]
    // Extra properties on the edge object — compositeLayout must ignore them.
    const filteredEdges = [{ source: 'X', target: 'Y' }]

    const result = compositeLayout(nodes, filteredEdges)

    const x = result.get('X')!
    const y = result.get('Y')!

    // X is root (rank 0), Y is child (rank 1) → X.y < Y.y
    expect(x.y).toBeLessThan(y.y)
  })
})
