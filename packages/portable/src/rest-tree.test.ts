import test from 'node:test';
import assert from 'node:assert/strict';
import { buildRestTree, hiddenRestNodes, revealRestChildren } from './rest-tree.js';
import type { PortableGraph } from './graph.js';
import { importMarkdown } from './import/markdown.js';
import { projectDiagram } from './semantics.js';

const graph = (): PortableGraph => ({ direction: 'RIGHT', nodes: ['root', 'branch', 'leaf', 'sibling'].map(id => ({ id, label: id, group: false, classes: [] })), edges: [['root', 'branch'], ['branch', 'leaf'], ['root', 'sibling']].map(([source, target], i) => ({ id: String(i), source, target, label: '', invisible: false, dashed: false, arrow: true })) });
test('collapse hides all descendants, counts nested descendants, and preserves nested collapse on reopening', () => {
  const tree = buildRestTree(graph());
  assert.equal(tree.descendants.get('root')!.length, 3);
  assert.equal(tree.descendants.get('leaf')!.length, 0);
  assert.deepEqual([...hiddenRestNodes(tree.descendants, new Set(['branch']))], ['leaf']);
  const nested = new Set(['root', 'branch']);
  assert.deepEqual([...hiddenRestNodes(tree.descendants, nested)].sort(), ['branch', 'leaf', 'sibling']);
  nested.delete('root');
  assert.deepEqual([...hiddenRestNodes(tree.descendants, nested)], ['leaf']);
});
test('a shared child cannot pretend to have independent tree parents', () => {
  const g = graph(); g.edges.push({ ...g.edges[0], id: 'shared', source: 'sibling', target: 'leaf' });
  assert.throws(() => buildRestTree(g), /multiple parents/);
});
test('the explicit REST layout mode survives parsing and projection into the runtime artifact', async () => {
  const doc = await importMarkdown('```mermaid rest-api-tree\nflowchart LR\n root --> child\n```');
  assert.equal(projectDiagram(doc.diagrams[0]).mode, 'rest-api-tree');
});
test('Hide Grandchildren retains every immediate child and hides every deeper descendant', () => {
  const children = new Map([['target', ['child', 'leaf']], ['child', ['grandchild']], ['grandchild', ['deep']], ['deep', []], ['leaf', []], ['other', ['outside']], ['outside', []]]);
  const next = revealRestChildren(children, new Set(['other', 'grandchild']), 'target');
  assert(!next.has('target'));
  assert(next.has('child'));
  assert(!next.has('leaf'));
  assert(next.has('other'), 'another branch retains its state');
  assert(next.has('grandchild'), 'deeper stored collapse state is retained');
});
test('Reveal Children opens the target and collapses its immediate child branches', () => {
  const tree = buildRestTree(graph());
  const next = revealRestChildren(tree.children, new Set(['root']), 'root');
  assert.deepEqual([...hiddenRestNodes(tree.descendants, next)], ['leaf']);
  assert(!next.has('root'));
  assert(next.has('branch'));
  assert(!next.has('sibling'));
});
