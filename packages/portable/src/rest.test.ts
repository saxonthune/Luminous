import test from 'node:test';
import assert from 'node:assert/strict';
import { applyNodeContent } from './import/node-content.js';
import { restRole } from './rest.js';
import type { PortableGraph } from './graph.js';

const graph = (): PortableGraph => ({ direction: 'RIGHT', nodes: [{ id: 'resource', label: '', group: false, classes: [] }], edges: [] });
test('REST methods survive parsing alongside ordinary Card disclosure', () => {
  const g = graph();
  applyNodeContent(g, { resource: { component: 'rest-card', title: '/{bookId}', methods: ['GET', 'PUT'], info: 'book-contract' } });
  assert.deepEqual(g.nodes[0].card?.methods, ['GET', 'PUT']);
  assert.equal(g.nodes[0].card?.info, 'book-contract');
  assert.equal(restRole('/{bookId}', g.nodes[0].card!.methods!), 'parameter');
  assert.equal(restRole('/books', ['GET']), 'endpoint');
  assert.equal(restRole('/reading-buddy', []), 'prefix');
});
test('REST parsing rejects malformed verb declarations rather than silently hiding endpoints', () => {
  for (const methods of [undefined, 'GET', ['get'], ['GET', 'GET'], ['EXECUTE']]) {
    assert.throws(() => applyNodeContent(graph(), { resource: { component: 'rest-card', title: '/books', methods } }), /Invalid methods/);
  }
  assert.throws(() => applyNodeContent(graph(), { resource: { component: 'card', title: '/books', methods: ['GET'] } }), /Unknown card field/);
});
test('ordinary Cards retain their existing shape', () => {
  const g = graph();
  applyNodeContent(g, { resource: { component: 'card', title: 'Existing card', body: 'Existing content' } });
  assert.equal(g.nodes[0].card?.component, 'card');
  assert.equal('methods' in g.nodes[0].card!, false);
});
