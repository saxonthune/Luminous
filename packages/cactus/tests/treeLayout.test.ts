import { describe, it, expect } from 'vitest'
import { treeLayout } from '../src/treeLayout'
import type { LayoutNode, LayoutEdge } from '../src/treeLayout'

function node(id: string, width = 100, height = 40): LayoutNode {
  return { id, x: 0, y: 0, width, height }
}

function edge(source: string, target: string): LayoutEdge {
  return { source, target }
}

describe('treeLayout', () => {
  it('1. empty input returns empty Map', () => {
    const result = treeLayout([], [])
    expect(result.size).toBe(0)
  })

  it('2. single node, no edges → positioned at (0, 0)', () => {
    const result = treeLayout([node('A')], [])
    expect(result.get('A')).toEqual({ x: 0, y: 0 })
  })

  it('3. linear chain A→B→C → three ranks vertically', () => {
    const nodes = [node('A'), node('B'), node('C')]
    const edges = [edge('A', 'B'), edge('B', 'C')]
    const result = treeLayout(nodes, edges, { verticalGap: 80 })

    const a = result.get('A')!
    const b = result.get('B')!
    const c = result.get('C')!

    // A at rank 0, B at rank 1, C at rank 2 → y increases
    expect(a.y).toBeLessThan(b.y)
    expect(b.y).toBeLessThan(c.y)

    // All centered (equal x since single child at each rank)
    expect(a.x).toBe(b.x)
    expect(b.x).toBe(c.x)
  })

  it('4. binary tree A→B, A→C → A centered over B and C', () => {
    const nodes = [node('A'), node('B'), node('C')]
    const edges = [edge('A', 'B'), edge('A', 'C')]
    const result = treeLayout(nodes, edges, { horizontalGap: 40 })

    const a = result.get('A')!
    const b = result.get('B')!
    const c = result.get('C')!

    // B and C at same rank
    expect(b.y).toBe(c.y)
    // A above B and C
    expect(a.y).toBeLessThan(b.y)

    // B to the left of C
    expect(b.x).toBeLessThan(c.x)

    // A centered over B and C (midpoint of B.center and C.center)
    const bCenter = b.x + 50
    const cCenter = c.x + 50
    const midpoint = (bCenter + cCenter) / 2
    const aCenter = a.x + 50
    expect(Math.abs(aCenter - midpoint)).toBeLessThanOrEqual(1)
  })

  it('5. wide tree A→B,C,D,E → A centered, 4 children spaced at rank 1', () => {
    const nodes = [node('A'), node('B'), node('C'), node('D'), node('E')]
    const edges = [edge('A', 'B'), edge('A', 'C'), edge('A', 'D'), edge('A', 'E')]
    const result = treeLayout(nodes, edges, { horizontalGap: 40 })

    const children = ['B', 'C', 'D', 'E'].map((id) => result.get(id)!)
    // All children at same rank
    const ys = children.map((p) => p.y)
    expect(new Set(ys).size).toBe(1)

    // Children are ordered left-to-right with gaps (x increasing)
    for (let i = 1; i < children.length; i++) {
      expect(children[i].x).toBeGreaterThan(children[i - 1].x + 100) // width=100, so gap > 0
    }

    // A centered
    const childCenters = children.map((p) => p.x + 50)
    const mid = (Math.min(...childCenters) + Math.max(...childCenters)) / 2
    const aCenter = result.get('A')!.x + 50
    expect(Math.abs(aCenter - mid)).toBeLessThanOrEqual(1)
  })

  it('6. multiple roots (A→B, C→D) → two trees side by side', () => {
    const nodes = [node('A'), node('B'), node('C'), node('D')]
    const edges = [edge('A', 'B'), edge('C', 'D')]
    const result = treeLayout(nodes, edges)

    // A and C are roots (rank 0) — they should be at different x positions
    const aPos = result.get('A')!
    const cPos = result.get('C')!
    expect(aPos.x).not.toBe(cPos.x)

    // B is under A (same x range), D is under C
    const bPos = result.get('B')!
    const dPos = result.get('D')!
    expect(bPos.y).toBeGreaterThan(aPos.y)
    expect(dPos.y).toBeGreaterThan(cPos.y)
  })

  it('7. diamond DAG (A→B, A→C, B→D, C→D) → D appears once', () => {
    const nodes = [node('A'), node('B'), node('C'), node('D')]
    const edges = [edge('A', 'B'), edge('A', 'C'), edge('B', 'D'), edge('C', 'D')]
    const result = treeLayout(nodes, edges)

    // All 4 nodes present
    expect(result.size).toBe(4)
    expect(result.has('D')).toBe(true)

    // D at a deeper rank than B and C
    const dPos = result.get('D')!
    const bPos = result.get('B')!
    expect(dPos.y).toBeGreaterThan(bPos.y)
  })

  it('8. left-right direction → x and y swapped vs top-down', () => {
    const nodes = [node('A'), node('B')]
    const edges = [edge('A', 'B')]

    const td = treeLayout(nodes, edges, { direction: 'top-down' })
    const lr = treeLayout(nodes, edges, { direction: 'left-right' })

    const tdA = td.get('A')!
    const lrA = lr.get('A')!
    const tdB = td.get('B')!
    const lrB = lr.get('B')!

    // In top-down: A.y < B.y (rank axis is y)
    expect(tdA.y).toBeLessThan(tdB.y)

    // In left-right: rank axis is x, so A.x < B.x
    expect(lrA.x).toBeLessThan(lrB.x)

    // The rank spacing should appear as x difference in left-right
    expect(lrB.x - lrA.x).toBe(tdB.y - tdA.y)
  })

  it('9. nodes with varying widths → no overlaps at same rank', () => {
    const nodes = [
      node('A', 100, 40),
      node('B', 200, 40),
      node('C', 150, 40),
    ]
    const edges = [edge('A', 'B'), edge('A', 'C')]
    const result = treeLayout(nodes, edges, { horizontalGap: 20 })

    const bPos = result.get('B')!
    const cPos = result.get('C')!

    // B is to the left of C (or C to the left of B)
    const [left, leftWidth, right] = bPos.x < cPos.x
      ? [bPos, 200, cPos]
      : [cPos, 150, bPos]

    // No overlap: right.x >= left.x + leftWidth + gap (approximately, with rounding)
    expect(right.x).toBeGreaterThanOrEqual(left.x + leftWidth + 19) // 20 gap, allow 1 rounding
  })

  it('10. isolated nodes mixed with tree → all nodes placed', () => {
    const nodes = [node('A'), node('B'), node('C'), node('Iso')]
    const edges = [edge('A', 'B'), edge('A', 'C')]
    const result = treeLayout(nodes, edges)

    // All 4 nodes have positions
    expect(result.size).toBe(4)
    expect(result.has('Iso')).toBe(true)

    // Iso is not at the same position as A (which is also rank 0)
    const isoPos = result.get('Iso')!
    const aPos = result.get('A')!
    expect(isoPos.x).not.toBe(aPos.x)
  })
})
