/**
 * Tests for computeMatchGating — transitive match-arm gating.
 *
 * Graph structure:
 *
 *   match_node ──Ok──→ ok_only
 *              ──Err─→ err_only
 *              ──Ok──→ shared  ←──Err── (match_node via second edge)
 *
 * I.e.:
 *   - ok_only  is reachable only via the Ok arm
 *   - err_only is reachable only via the Err arm
 *   - shared   is reachable from both arms (two dataflow edges)
 *
 * When selectedArm = 'Ok':
 *   - Err edges suppressed → err_only is NOT reachable → peek
 *   - shared still reachable via Ok edge → NOT peeked
 *   - match_node is a source (seed) → reachable → NOT peeked
 *   - ok_only reachable → NOT peeked
 */
import { describe, it, expect } from 'vitest';
import { buildGraph } from '@luminous/core';
import type { Node, Edge, View } from '@luminous/core';
import { computeMatchGating, MATCH_GATING_CFG } from '../src/matchGating';

// ── Nodes ──────────────────────────────────────────────────────────────────────

const MATCH_NODE: Node = {
  id: 'match_node',
  kind: 'rust.match',
  props: { label: 'my_match', arms: ['Ok', 'Err'] },
  tags: [],
};

const OK_ONLY: Node  = { id: 'ok_only',  kind: 'prim.box', props: { label: 'ok_only' },  tags: [] };
const ERR_ONLY: Node = { id: 'err_only', kind: 'prim.box', props: { label: 'err_only' }, tags: [] };
const SHARED: Node   = { id: 'shared',   kind: 'prim.box', props: { label: 'shared' },   tags: [] };

// ── Edges ──────────────────────────────────────────────────────────────────────

const EDGES: Edge[] = [
  { id: 'e_ok_only',  kind: 'rust.dataflow', from: 'match_node', to: 'ok_only',  props: { arm: 'Ok' },  tags: [] },
  { id: 'e_err_only', kind: 'rust.dataflow', from: 'match_node', to: 'err_only', props: { arm: 'Err' }, tags: [] },
  { id: 'e_shared_ok',  kind: 'rust.dataflow', from: 'match_node', to: 'shared', props: { arm: 'Ok' },  tags: [] },
  { id: 'e_shared_err', kind: 'rust.dataflow', from: 'match_node', to: 'shared', props: { arm: 'Err' }, tags: [] },
];

// ── Helpers ────────────────────────────────────────────────────────────────────

function makeView(layerState: 'off' | 'peek' | 'on', selectedArm?: string): { graph: ReturnType<typeof buildGraph>; view: View } {
  const matchProps = selectedArm !== undefined
    ? { label: 'my_match', arms: ['Ok', 'Err'], selectedArm }
    : { label: 'my_match', arms: ['Ok', 'Err'] };

  const matchNode: Node = { ...MATCH_NODE, props: matchProps };

  const graph = buildGraph([matchNode, OK_ONLY, ERR_ONLY, SHARED], EDGES);
  const view: View = {
    id: 'test-view',
    name: 'Test',
    nodeRoles: {
      'rust.match': 'spatial',
      'prim.box': 'spatial',
    },
    edgeRoles: { 'rust.dataflow': 'arrow' },
    layers: layerState === 'off' ? {} : { 'match-gating': layerState },
    layout: { algorithm: 'manual' },
  };
  return { graph, view };
}

// ── Tests ──────────────────────────────────────────────────────────────────────

describe('computeMatchGating', () => {
  it('returns empty set when layer is off', () => {
    const { graph, view } = makeView('off', 'Ok');
    const peek = computeMatchGating(graph, view, MATCH_GATING_CFG);
    expect(peek.size).toBe(0);
  });

  it('returns empty set when layer is absent (no match-gating key)', () => {
    const { graph, view } = makeView('off', 'Ok');
    // view.layers has no 'match-gating' key
    const peek = computeMatchGating(graph, view, MATCH_GATING_CFG);
    expect(peek.size).toBe(0);
  });

  it('returns empty set when no selectedArm is set (layer peek)', () => {
    const { graph, view } = makeView('peek'); // no selectedArm
    const peek = computeMatchGating(graph, view, MATCH_GATING_CFG);
    expect(peek.size).toBe(0);
  });

  it('peek: err_only is peeked when selectedArm=Ok', () => {
    const { graph, view } = makeView('peek', 'Ok');
    const peek = computeMatchGating(graph, view, MATCH_GATING_CFG);
    expect(peek.has('err_only')).toBe(true);
  });

  it('peek: ok_only is NOT peeked when selectedArm=Ok', () => {
    const { graph, view } = makeView('peek', 'Ok');
    const peek = computeMatchGating(graph, view, MATCH_GATING_CFG);
    expect(peek.has('ok_only')).toBe(false);
  });

  it('peek: shared is NOT peeked (fed by both arms)', () => {
    const { graph, view } = makeView('peek', 'Ok');
    const peek = computeMatchGating(graph, view, MATCH_GATING_CFG);
    expect(peek.has('shared')).toBe(false);
  });

  it('peek: match_node itself is NOT peeked (it is the source)', () => {
    const { graph, view } = makeView('peek', 'Ok');
    const peek = computeMatchGating(graph, view, MATCH_GATING_CFG);
    expect(peek.has('match_node')).toBe(false);
  });

  it('peek: ok_only is peeked when selectedArm=Err', () => {
    const { graph, view } = makeView('peek', 'Err');
    const peek = computeMatchGating(graph, view, MATCH_GATING_CFG);
    expect(peek.has('ok_only')).toBe(true);
    expect(peek.has('err_only')).toBe(false);
    expect(peek.has('shared')).toBe(false);
  });

  it('on: same logic — err_only is in peek set when selectedArm=Ok (caller decides rendering)', () => {
    const { graph, view } = makeView('on', 'Ok');
    const peek = computeMatchGating(graph, view, MATCH_GATING_CFG);
    expect(peek.has('err_only')).toBe(true);
    expect(peek.has('ok_only')).toBe(false);
    expect(peek.has('shared')).toBe(false);
  });
});
