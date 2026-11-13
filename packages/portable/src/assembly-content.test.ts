import test from 'node:test';
import assert from 'node:assert/strict';
import { applyNodeContent } from './import/node-content.js';
import type { PortableGraph } from './graph.js';

function graph(): PortableGraph {
  return { direction: 'RIGHT', nodes: [{ id: 'base', label: '', group: false, classes: [] }], edges: [] };
}

test('assembly status and modifier sections survive the content parser', () => {
  const g = graph();
  const modifiers = [{ name: 'Sphere slice', parameters: [{ name: 'Width', value: '1.0' }] }];
  applyNodeContent(g, { base: { component: 'rest-card', methods: [], title: 'Base', badges: ['Block', 'Master linked'], modifiers } });
  assert.deepEqual(g.nodes[0].card?.badges, ['Block', 'Master linked']);
  assert.deepEqual(g.nodes[0].card?.modifiers, modifiers);
});

test('malformed assembly metadata is rejected before layout', () => {
  for (const extra of [
    { badges: [''] }, { badges: 'Block' },
    { modifiers: [{ name: 'Size', parameters: [{ name: 'Width', value: 1 }] }] },
    { modifiers: [{ name: 'Size', parameters: [], executable: true }] },
  ]) {
    assert.throws(() => applyNodeContent(graph(), { base: { component: 'card', title: 'Base', ...extra } }), /Invalid (badges|modifier sections)/);
  }
});
