import { describe, it, expect } from 'vitest'
import { tidyLayout } from '../src/tidyLayout'
import type { TidyNode } from '../src/tidyLayout'

// Default option values from tidyLayout
const DEFAULT_ROOT_GAP = 60

describe('tidyLayout', () => {
  describe('1. backward compat — no category info → single-row behavior unchanged', () => {
    it('small fixture with no category field and no categoryOrder produces single-row layout', () => {
      const nodes: TidyNode[] = [
        { id: 'a', w: 100, h: 50, parentId: null },
        { id: 'b', w: 200, h: 80, parentId: null },
        { id: 'c', w: 150, h: 40, parentId: null },
        { id: 'd', w: 120, h: 60, parentId: null },
      ]

      const result = tidyLayout(nodes)

      // All roots share y=0
      for (const id of ['a', 'b', 'c', 'd']) {
        expect(result.get(id)!.y).toBe(0)
      }

      // a starts at x=0
      expect(result.get('a')!.x).toBe(0)

      // Each root starts immediately after the previous one + rootGap
      expect(result.get('b')!.x).toBe(100 + DEFAULT_ROOT_GAP)
      expect(result.get('c')!.x).toBe(100 + DEFAULT_ROOT_GAP + 200 + DEFAULT_ROOT_GAP)
      expect(result.get('d')!.x).toBe(
        100 + DEFAULT_ROOT_GAP + 200 + DEFAULT_ROOT_GAP + 150 + DEFAULT_ROOT_GAP,
      )
    })
  })

  describe('2. bucketed layout — basic two-category case', () => {
    it('roots in the same category share y; second category row is below first', () => {
      const rowGap = 120
      const nodes: TidyNode[] = [
        { id: 'a', category: 'x', w: 100, h: 50, parentId: null },
        { id: 'b', category: 'y', w: 80, h: 200, parentId: null },
        { id: 'c', category: 'x', w: 60, h: 50, parentId: null },
      ]

      const result = tidyLayout(nodes, { categoryOrder: ['x', 'y'], rowGap })

      const a = result.get('a')!
      const b = result.get('b')!
      const c = result.get('c')!

      // a and c are in category 'x' → first row, same y
      expect(a.y).toBe(c.y)

      // b is in category 'y' → second row
      // tallest in row 'x' is 50; rowY after first row = 50 + rowGap = 170
      expect(b.y).toBe(a.y + 50 + rowGap)

      // First root of each category starts at x=0
      expect(a.x).toBe(0)
      expect(b.x).toBe(0)

      // c comes after a: c.x = 100 + rootGap
      expect(c.x).toBe(100 + DEFAULT_ROOT_GAP)
    })
  })

  describe('3. unknown category ordering — extra category appended after known ones', () => {
    it('category z (not in categoryOrder) appears after category x', () => {
      const rowGap = 120
      const nodes: TidyNode[] = [
        { id: 'a', category: 'x', w: 100, h: 50, parentId: null },
        { id: 'z1', category: 'z', w: 80, h: 40, parentId: null },
      ]

      const result = tidyLayout(nodes, { categoryOrder: ['x'], rowGap })

      const a = result.get('a')!
      const z1 = result.get('z1')!

      // 'x' row first
      expect(a.y).toBe(0)
      // 'z' row after 'x' row: rowY = 50 + rowGap
      expect(z1.y).toBe(50 + rowGap)
      expect(z1.x).toBe(0)
    })
  })

  describe('4. empty categories skipped — no extra gap between non-empty rows', () => {
    it('unused category in categoryOrder does not introduce an extra gap', () => {
      const rowGap = 120
      const nodes: TidyNode[] = [
        { id: 'a', category: 'x', w: 100, h: 50, parentId: null },
        { id: 'b', category: 'y', w: 80, h: 60, parentId: null },
      ]

      // 'unused' is in the order list but has no roots
      const result = tidyLayout(nodes, { categoryOrder: ['x', 'unused', 'y'], rowGap })

      const a = result.get('a')!
      const b = result.get('b')!

      // x row at y=0, y row directly below with no extra gap for 'unused'
      expect(a.y).toBe(0)
      expect(b.y).toBe(50 + rowGap) // 50 (height of x row) + rowGap
    })
  })

  describe('5. categoryOrder: [] (empty) — still buckets in first-seen order', () => {
    it('empty categoryOrder array still activates bucketed mode, first-seen wins', () => {
      const rowGap = 120
      const nodes: TidyNode[] = [
        { id: 'a', category: 'foo', w: 100, h: 50, parentId: null },
        { id: 'b', category: 'bar', w: 80, h: 40, parentId: null },
        { id: 'c', category: 'foo', w: 60, h: 30, parentId: null },
      ]

      const result = tidyLayout(nodes, { categoryOrder: [], rowGap })

      const a = result.get('a')!
      const b = result.get('b')!
      const c = result.get('c')!

      // 'foo' seen first → first row
      expect(a.y).toBe(0)
      expect(c.y).toBe(0)
      // 'bar' seen second → second row
      expect(b.y).toBe(50 + rowGap)
    })
  })
})
