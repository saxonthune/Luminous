import test from 'node:test';
import assert from 'node:assert/strict';
import { computeDefaultLayout } from './layout/index.js';
import type { PortableGraph } from './graph.js';

test('spine layout keeps process vertical and attachments beside their assigned steps', async () => {
  const graph: PortableGraph = { direction: 'DOWN', nodes: ['a', 'b', 'left', 'right'].map(id => ({ id, label: id, group: false, classes: [] })), edges: [] };
  const measurements = Object.fromEntries(graph.nodes.map(node => [node.id, { w: 340, h: 90 }]));
  const layout = await computeDefaultLayout(graph, measurements, undefined, { nonOrderingEdges: [], spine: ['a', 'b'], attachments: [{ node: 'left', step: 'a', side: 'left' }, { node: 'right', step: 'b', side: 'right' }] });
  assert.equal(layout.a.x, layout.b.x);
  assert.ok(layout.a.y + layout.a.h < layout.b.y);
  assert.ok(layout.left.x + layout.left.w < layout.a.x);
  assert.ok(layout.right.x > layout.b.x + layout.b.w);
  assert.ok(layout.left.y < layout.a.y + layout.a.h && layout.left.y + layout.left.h > layout.a.y);
  assert.ok(layout.right.y < layout.b.y + layout.b.h && layout.right.y + layout.right.h > layout.b.y);
});

test('spine containers enclose consecutive owned steps without enclosing side records', async () => {
  const graph: PortableGraph = { direction: 'DOWN', nodes: [
    { id: 'owner', label: 'Owner', group: true, classes: [] },
    { id: 'a', label: 'a', group: false, parentId: 'owner', classes: [] },
    { id: 'b', label: 'b', group: false, parentId: 'owner', classes: [] },
    { id: 'record', label: 'record', group: false, classes: [] },
  ], edges: [] };
  const measurements = Object.fromEntries(graph.nodes.map(node => [node.id, { w: 340, h: 90 }]));
  const layout = await computeDefaultLayout(graph, measurements, undefined, { nonOrderingEdges: [], spine: ['a', 'b'], attachments: [{ node: 'record', step: 'a', side: 'left' }] });
  assert.ok(layout.owner.y < layout.a.y && layout.owner.y + layout.owner.h > layout.b.y + layout.b.h);
  assert.ok(layout.owner.x < layout.a.x && layout.owner.x + layout.owner.w > layout.a.x + layout.a.w);
  assert.ok(layout.record.x + layout.record.w < layout.owner.x);
});

test('related default schema attachments share the referring side', async () => {
  const graph: PortableGraph = { direction: 'DOWN', nodes: [
    { id: 'step', label: 'step', group: false, classes: [] },
    { id: 'source', label: 'source', group: false, classes: [], card: { component: 'schema-card', title: 'Source', fields: [{ name: 'item', type: 'Item', kind: 'object', schema: { component: 'schema-card', title: 'Item', schemaKey: 'item', fields: [] } }] } },
    { id: 'target', label: 'target', group: false, classes: [], card: { component: 'schema-card', title: 'Item', schemaKey: 'item', fields: [] } },
  ], edges: [] };
  const measurements = Object.fromEntries(graph.nodes.map(node => [node.id, { w: 340, h: 90 }]));
  const layout = await computeDefaultLayout(graph, measurements, undefined, { nonOrderingEdges: [], spine: ['step'], attachments: [{ node: 'source', step: 'step', side: 'left' }, { node: 'target', step: 'step', side: 'right' }] });
  assert.ok(layout.source.x + layout.source.w < layout.step.x);
  assert.ok(layout.target.x + layout.target.w < layout.step.x);
  assert.ok(layout.source.y + layout.source.h < layout.target.y);
});


test('one stage stacks mixed-side attachments on its first side and reserves their full height', async () => {
  const graph: PortableGraph = { direction: 'DOWN', nodes: ['step', 'next', 'one', 'two', 'three'].map(id => ({ id, label: id, group: false, classes: [] })), edges: [] };
  const measurements = { step: { w: 200, h: 60 }, next: { w: 200, h: 60 }, one: { w: 150, h: 90 }, two: { w: 180, h: 120 }, three: { w: 160, h: 70 } };
  for (const side of ['left', 'right'] as const) {
    const result = await computeDefaultLayout(graph, measurements, undefined, {
      nonOrderingEdges: [], spine: ['step', 'next'], attachments: [
        { node: 'one', step: 'step', side },
        { node: 'two', step: 'step', side: side === 'left' ? 'right' : 'left' },
        { node: 'three', step: 'step', side },
      ],
    });
    assert.equal(result.one.y, result.step.y);
    assert.ok(result.two.y >= result.one.y + result.one.h);
    assert.ok(result.three.y >= result.two.y + result.two.h);
    assert.ok(result.next.y > result.three.y + result.three.h);
    for (const id of ['one', 'two', 'three']) {
      if (side === 'left') assert.ok(result[id].x + result[id].w < result.step.x);
      else assert.ok(result[id].x > result.step.x + result.step.w);
    }
  }
});
