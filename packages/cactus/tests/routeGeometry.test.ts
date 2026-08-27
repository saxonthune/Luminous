import { describe, it, expect } from 'vitest'
import { fanOffsets } from '../src/routeGeometry'

describe('fanOffsets', () => {
  it('a single item sits on the crossing', () => {
    expect(fanOffsets(1, 10)).toEqual([0])
  })

  it('spreads evenly and sums to zero', () => {
    expect(fanOffsets(3, 10)).toEqual([-10, 0, 10])
    expect(fanOffsets(4, 10)).toEqual([-15, -5, 5, 15])
    expect(fanOffsets(4, 10).reduce((a, b) => a + b, 0)).toBeCloseTo(0)
  })
})
