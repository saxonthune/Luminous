import { describe, it, expect } from 'vitest'
import { KIND_DESCRIPTORS } from '@luminous/core/linen'
import { toolConfig, type ParamType } from '../src/tools.config.js'

describe('linen tool group config', () => {
  const group = toolConfig.linen

  it('is registered as a local tool group', () => {
    expect(group).toBeDefined()
    expect(group.local).toBe(true)
  })

  it('exposes every action the plan requires', () => {
    expect(Object.keys(group.actions).sort()).toEqual(
      [
        'list',
        'create',
        'read',
        'node/get',
        'node/create',
        'node/set',
        'node/delete',
        'module/create',
        'contract/create',
        'edge/connect',
        'edge/disconnect',
        'batch',
        'check',
        'trace',
        'manifest',
      ].sort(),
    )
  })

  it("node/create's kind enum comes from the descriptor table", () => {
    const kind = group.actions['node/create'].params['kind'] as Extract<ParamType, { type: 'described' }>
    const inner = kind.innerType as Extract<ParamType, { type: 'enum' }>
    expect(inner.values).toEqual(KIND_DESCRIPTORS.map((d) => d.kind))
  })

  it('every action has a non-empty description', () => {
    for (const [name, action] of Object.entries(group.actions)) {
      expect(action.description, `${name} description`).toBeTruthy()
    }
  })

  it('every param on every action has a description', () => {
    for (const [name, action] of Object.entries(group.actions)) {
      for (const [paramName, param] of Object.entries(action.params)) {
        expect(
          typeof param === 'object' && 'type' in param && param.type === 'described',
          `${name}.${paramName} should carry a description`,
        ).toBe(true)
      }
    }
  })
})
