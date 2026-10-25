import test from 'node:test';
import assert from 'node:assert/strict';
import { applyNodeContent } from './import/node-content.js';
import type { PortableGraph } from './graph.js';
const graph = (): PortableGraph => ({ direction: 'RIGHT', nodes: [{ id: 'view', label: '', group: false, classes: [] }], edges: [] });

test('usage endpoint sections survive parsing with their state and source disclosure', () => {
  const g = graph();
  const usage = { uiRoute: { paths: ['/reading-buddy'], context: 'Document library; no Book selected.' }, startup: [{ method: 'GET', endpoint: '/books', description: 'Loads the Library contents.' }], capabilities: [{ method: 'PUT', endpoint: '/books/{bookId}', description: 'Saves this Book registration.' }] };
  applyNodeContent(g, { view: { component: 'usage-card', title: 'Library', usage, info: 'evidence' } });
  assert.deepEqual(g.nodes[0].card?.usage, usage);
  assert.equal(g.nodes[0].card?.info, 'evidence');
});

test('usage parsing rejects incomplete or malformed endpoint contracts', () => {
  for (const usage of [undefined, { startup: [] }, { startup: [{ method: 'GET', endpoint: '/books' }], capabilities: [] }, { startup: [{ method: 'get', endpoint: '/books', description: 'Loads the Library contents.' }], capabilities: [] }, { startup: [{ method: 'GET', endpoint: 'books' }], capabilities: [] }]) {
    assert.throws(() => applyNodeContent(graph(), { view: { component: 'usage-card', title: 'Library', usage: usage && { uiRoute: { paths: ['/reading-buddy'], context: 'Document library.' }, ...usage } } }));
  }
  assert.throws(() => applyNodeContent(graph(), { view: { component: 'card', title: 'Library', usage: { startup: [], capabilities: [] } } }), /Unknown card field/);
});

test('usage cards require a concrete UI route and distinguish same-route view states', () => {
  const usage = { uiRoute: { paths: ['/researcher/{chatId}'], context: 'Saved conversation selected.' }, startup: [], capabilities: [] };
  for (const uiRoute of [undefined, { paths: [], context: 'Chat' }, { paths: ['researcher'], context: 'Chat' }, { paths: ['/researcher'], context: '' }]) {
    assert.throws(() => applyNodeContent(graph(), { view: { component: 'usage-card', title: 'Chat', usage: { ...usage, uiRoute } } }), /UI route/);
  }
  const g = graph();
  applyNodeContent(g, { view: { component: 'usage-card', title: 'Chat', usage } });
  assert.deepEqual(g.nodes[0].card?.usage?.uiRoute, usage.uiRoute);
});
