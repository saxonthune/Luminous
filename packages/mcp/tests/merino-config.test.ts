import { describe, it, expect } from 'vitest'
import { toolConfig } from '../src/tools.config.js'

describe('merino tool group config', () => {
  const group = toolConfig.merino

  it('is registered as a local tool group', () => {
    expect(group).toBeDefined()
    expect(group.local).toBe(true)
  })

  it('exposes every action the requirements need', () => {
    expect(Object.keys(group.actions).sort()).toEqual(
      [
        'list',
        'create',
        'read',
        'node/get',
        'node/search',
        'node/children',
        'node/create',
        'node/set',
        'node/delete',
        'edge/connect',
        'edge/list',
        'edge/set',
        'edge/disconnect',
        'nodeType/add',
        'nodeType/set',
        'nodeType/remove',
        'edgeType/add',
        'edgeType/set',
        'edgeType/remove',
        'batch',
        'neighborhood',
        'check',
      ].sort(),
    )
  })

  it('every action has a non-empty description', () => {
    for (const [name, action] of Object.entries(group.actions)) {
      expect(action.description, `${name} description`).toBeTruthy()
    }
  })

  it('every param on every action carries a description', () => {
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
