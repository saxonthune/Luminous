import { describe, it, expect } from 'vitest'
import { toolConfig } from '../src/tools.config.js'

describe('atlas tool group config', () => {
  const group = toolConfig.atlas

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
        'node/search',
        'node/children',
        'edge/list',
        'neighborhood',
        'node/create',
        'node/set',
        'node/reparent',
        'node/delete',
        'edge/connect',
        'edge/disconnect',
        'edge/bisect',
        'legend/set',
        'batch',
      ].sort(),
    )
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

  it('node/create requires an explicit id, not generated', () => {
    expect(Object.keys(group.actions['node/create'].params)).toEqual(
      expect.arrayContaining(['path', 'id', 'name', 'parent?', 'x?', 'y?']),
    )
  })

  it('edge/connect and edge/disconnect both take from/to', () => {
    expect(Object.keys(group.actions['edge/connect'].params)).toEqual(
      expect.arrayContaining(['path', 'from', 'to']),
    )
    expect(Object.keys(group.actions['edge/disconnect'].params)).toEqual(
      expect.arrayContaining(['path', 'from', 'to']),
    )
  })

  it('edge/bisect takes from/to plus an explicit new node id', () => {
    expect(Object.keys(group.actions['edge/bisect'].params)).toEqual(
      expect.arrayContaining(['path', 'from', 'to', 'id']),
    )
  })

  it('node/get takes path and id', () => {
    expect(Object.keys(group.actions['node/get'].params)).toEqual(['path', 'id'])
  })

  it('node/search takes path and text', () => {
    expect(Object.keys(group.actions['node/search'].params)).toEqual(['path', 'text'])
  })

  it('node/children takes path, id, and an optional depth', () => {
    expect(Object.keys(group.actions['node/children'].params)).toEqual(['path', 'id', 'depth?'])
  })

  it('edge/list takes path and optional endpoint filters', () => {
    expect(Object.keys(group.actions['edge/list'].params)).toEqual(['path', 'from?', 'to?'])
  })

  it('neighborhood takes path, id, and optional direction/depth', () => {
    expect(Object.keys(group.actions['neighborhood'].params)).toEqual(['path', 'id', 'direction?', 'depth?'])
  })

  it('neighborhood direction is an enum of out/in/both', () => {
    const direction = group.actions['neighborhood'].params['direction?']
    expect(typeof direction).toBe('object')
    if (typeof direction === 'object' && direction.type === 'described') {
      expect(direction.innerType).toEqual({ type: 'enum', values: ['out', 'in', 'both'] })
    } else {
      throw new Error('expected direction? to be a described param')
    }
  })
})
