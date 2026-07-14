import { describe, it, expect } from 'vitest'
import {
  isEdgeSchema,
  isNodeSchema,
  type Schema,
  type NodeSchema,
  type EdgeSchema,
} from '../src/types.js'

// ---------------------------------------------------------------------------
// Type guard tests
// ---------------------------------------------------------------------------

describe('isEdgeSchema / isNodeSchema', () => {
  it('isEdgeSchema returns true for an EdgeSchema', () => {
    const s: EdgeSchema = { kind: 'edge', name: 'renders', label: 'Renders' }
    expect(isEdgeSchema(s)).toBe(true)
  })

  it('isEdgeSchema returns false for NodeSchema with explicit kind: node', () => {
    const s: NodeSchema = { kind: 'node', name: 'component', label: 'Component', primitives: [] }
    expect(isEdgeSchema(s)).toBe(false)
  })

  it('isEdgeSchema returns false for NodeSchema with no kind field', () => {
    const s: NodeSchema = { name: 'component', label: 'Component', primitives: [] }
    expect(isEdgeSchema(s)).toBe(false)
  })

  it('isNodeSchema returns true for NodeSchema with explicit kind: node', () => {
    const s: NodeSchema = { kind: 'node', name: 'component', label: 'Component', primitives: [] }
    expect(isNodeSchema(s)).toBe(true)
  })

  it('isNodeSchema returns true for NodeSchema with no kind field', () => {
    const s: NodeSchema = { name: 'component', label: 'Component', primitives: [] }
    expect(isNodeSchema(s)).toBe(true)
  })

  it('isNodeSchema returns false for an EdgeSchema', () => {
    const s: EdgeSchema = { kind: 'edge', name: 'renders', label: 'Renders' }
    expect(isNodeSchema(s)).toBe(false)
  })
})

// ---------------------------------------------------------------------------
// Type-level narrowing check
// This code must compile cleanly. If NodeSchema narrowing were broken,
// accessing .primitives on the narrowed type would be a compile error.
// ---------------------------------------------------------------------------

describe('type narrowing via isNodeSchema', () => {
  it('accessing .primitives after isNodeSchema guard compiles and works', () => {
    const s: Schema = { name: 'component', label: 'Component', primitives: [{ type: 'title' }] }
    if (isNodeSchema(s)) {
      // TypeScript knows s is NodeSchema here — s.primitives is accessible.
      expect(s.primitives).toHaveLength(1)
    } else {
      throw new Error('should have been narrowed to NodeSchema')
    }
  })
})

// ---------------------------------------------------------------------------
// Loader backwards-compat tests (schema kind defaulting)
// ---------------------------------------------------------------------------

describe('schema loader backwards-compat', () => {
  it('schemas with no kind field get kind: node after normalization', () => {
    // Simulate what the loader does after parsing a pre-union canvas file.
    const schemas: Record<string, Record<string, unknown>> = {
      component: { name: 'component', label: 'Component', primitives: [] },
      signal: { name: 'signal', label: 'Signal', primitives: [] },
    }
    for (const schema of Object.values(schemas)) {
      if (schema.kind === undefined) {
        schema.kind = 'node'
      }
    }
    expect(schemas['component'].kind).toBe('node')
    expect(schemas['signal'].kind).toBe('node')
  })

  it('schemas with explicit kind: edge preserve kind: edge after normalization', () => {
    const schemas: Record<string, Record<string, unknown>> = {
      renders: { kind: 'edge', name: 'renders', label: 'Renders' },
      component: { name: 'component', label: 'Component', primitives: [] },
    }
    for (const schema of Object.values(schemas)) {
      if (schema.kind === undefined) {
        schema.kind = 'node'
      }
    }
    expect(schemas['renders'].kind).toBe('edge')
    expect(schemas['component'].kind).toBe('node')
  })
})
