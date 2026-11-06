import test from 'node:test';
import assert from 'node:assert/strict';
import { applyNodeContent } from './import/node-content.js';
import type { PortableGraph } from './graph.js';

const graph = (): PortableGraph => ({ direction: 'DOWN', nodes: [{ id: 'record', label: '', group: false, classes: [] }], edges: [] });
test('schema cards retain typed fields and optionality', () => {
  const g = graph();
  const fields = [{ name: 'id', type: 'UUID', kind: 'identifier' }, { name: 'label', type: 'text', kind: 'text', optional: true, diff: 'new' }];
  applyNodeContent(g, { record: { component: 'schema-card', title: 'Record', fields, diff: 'new' } });
  assert.deepEqual(g.nodes[0].card?.fields, fields);
  assert.equal(g.nodes[0].card?.diff, 'new');
});
test('schema cards reject ambiguous or malformed fields', () => {
  for (const fields of [undefined, [{ name: '', type: 'text', kind: 'text' }], [{ name: 'x', type: 'text', kind: 'unknown' }], [{ name: 'x', type: 'text', kind: 'text', diff: 'unknown' }], [{ name: 'x', type: 'text', kind: 'text' }, { name: 'x', type: 'text', kind: 'text' }]]) {
    assert.throws(() => applyNodeContent(graph(), { record: { component: 'schema-card', title: 'Record', fields } }));
  }
});
test('expandable fields accept nested schemas and reject malformed definitions', () => {
  const g = graph();
  const schema = { component: 'schema-card', title: 'Book', fields: [{ name: 'title', type: 'string', kind: 'text' }] };
  applyNodeContent(g, { record: { component: 'schema-card', title: 'Request', fields: [{ name: 'book', type: 'Book', kind: 'object', schema }] } });
  assert.equal(g.nodes[0].card?.fields?.[0].schema?.title, 'Book');
  assert.throws(() => applyNodeContent(graph(), { record: { component: 'schema-card', title: 'Request', fields: [{ name: 'book', type: 'Book', kind: 'object', schema: { component: 'card', title: 'Book' } }] } }));
});
test('schema labels reject indexed access while allowing array notation', () => {
  const make = (type: string) => ({ record: { component: 'schema-card', title: 'Request', fields: [{ name: 'groups', type, kind: 'collection' }] } });
  for (const type of ['Foo["bar"]', 'Foo[Bar]', 'Foo[number]["value"]']) assert.throws(() => applyNodeContent(graph(), make(type)), /indexed-access/);
  assert.doesNotThrow(() => applyNodeContent(graph(), make('Group[]')));
});
