import { describe, it, expect } from 'vitest'
import { toolConfig } from '../src/tools.config.js'

describe('dataflow tool group config', () => {
  const group = toolConfig.dataflow

  it('is registered as a local tool group', () => {
    expect(group).toBeDefined()
    expect(group.local).toBe(true)
  })

  it('exposes every action the plan requires', () => {
    expect(Object.keys(group.actions).sort()).toEqual(
      ['addBox', 'batch', 'check', 'connect', 'create', 'disconnect', 'list', 'read', 'removeBox', 'set'].sort(),
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

  it('addBox and set both accept name, description, and contract', () => {
    expect(Object.keys(group.actions.addBox.params)).toEqual(
      expect.arrayContaining(['path', 'name', 'description?', 'contract?']),
    )
    expect(Object.keys(group.actions.set.params)).toEqual(
      expect.arrayContaining(['path', 'box', 'name?', 'description?', 'contract?']),
    )
  })

  it('connect and disconnect both take from/to', () => {
    expect(Object.keys(group.actions.connect.params)).toEqual(
      expect.arrayContaining(['path', 'from', 'to']),
    )
    expect(Object.keys(group.actions.disconnect.params)).toEqual(
      expect.arrayContaining(['path', 'from', 'to']),
    )
  })

  it('removeBox accepts an optional cascade flag', () => {
    expect(Object.keys(group.actions.removeBox.params)).toEqual(
      expect.arrayContaining(['path', 'box', 'cascade?']),
    )
  })
})
