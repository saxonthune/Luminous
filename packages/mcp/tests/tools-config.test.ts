import { describe, it, expect } from 'vitest'
import { toolConfig } from '../src/tools.config.js'

describe('tool group name set', () => {
  it('exposes exactly the expected tool names', () => {
    expect(Object.keys(toolConfig).sort()).toEqual(
      ['atlas', 'canvas', 'canvas-edge', 'canvas-node', 'canvas-pack', 'canvas-query', 'canvas-view', 'dataflow', 'linen'].sort(),
    )
  })
})
