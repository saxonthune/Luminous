import test from 'node:test';
import assert from 'node:assert/strict';
import { computeDefaultLayout } from './layout/index.js';
import type { PortableGraph } from './graph.js';

const graph: PortableGraph = { direction: 'DOWN', nodes: [
  { id: 'group', label: 'Group', group: true, classes: [] },
  { id: 'label', label: 'Large wrapped label', group: false, classes: [], parentId: 'group' },
], edges: [] };

test('layout requires measured geometry instead of silently estimating text', async () => {
  await assert.rejects(computeDefaultLayout(graph, {}), /measured size/);
  await assert.rejects(computeDefaultLayout(graph, { group: { w: 300, h: 50 }, label: { w: NaN, h: 30 } }), /measured size/);
});

test('compound layout preserves measured content and reserves the measured header', async () => {
  const sizes = { group: { w: 440, h: 120, headerHeight: 120 }, label: { w: 320, h: 150 } };
  const result = await computeDefaultLayout(graph, sizes);
  assert.equal(result.label.w, sizes.label.w);
  assert.equal(result.label.h, sizes.label.h);
  assert.ok(result.label.y >= result.group.y + sizes.group.headerHeight);
  assert.ok(result.group.w >= sizes.group.w);
  assert.ok(result.group.y + result.group.h >= result.label.y + result.label.h);
});
