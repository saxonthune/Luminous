import { describe, it, expect } from 'vitest';
import type { Graph, Node, Edge } from '@luminous/canvas-core';
import { findOrphanActions } from '../orphans.ts';

function makeGraph(nodes: Node[], edges: Edge[]): Graph {
  const nodeMap = new Map(nodes.map((n) => [n.id, n]));
  const edgeMap = new Map(edges.map((e) => [e.id, e]));

  const edgesByKind = new Map<string, Set<string>>();
  for (const edge of edges) {
    if (!edgesByKind.has(edge.kind)) edgesByKind.set(edge.kind, new Set());
    edgesByKind.get(edge.kind)!.add(edge.id);
  }

  const outgoing = new Map<string, Set<string>>();
  const incoming = new Map<string, Set<string>>();
  for (const edge of edges) {
    if (!outgoing.has(edge.from)) outgoing.set(edge.from, new Set());
    outgoing.get(edge.from)!.add(edge.id);
    if (!incoming.has(edge.to)) incoming.set(edge.to, new Set());
    incoming.get(edge.to)!.add(edge.id);
  }

  return { nodes: nodeMap, edges: edgeMap, edgesByKind, outgoing, incoming };
}

function makeNode(id: string, kind: string): Node {
  return { id, kind, props: {}, tags: [] };
}

function makeEdge(id: string, kind: string, from: string, to: string): Edge {
  return { id, kind, from, to, props: {}, tags: [] };
}

describe('findOrphanActions', () => {
  it('returns action with no incoming invokes-action edge', () => {
    const action1 = makeNode('action-1', 'rtp.action');
    const action2 = makeNode('action-2', 'rtp.action');
    const action3 = makeNode('action-3', 'rtp.action');
    const transition1 = makeNode('transition-1', 'statechart.transition');
    const transition2 = makeNode('transition-2', 'statechart.transition');

    const edge1 = makeEdge('e1', 'statechart.invokes-action', 'transition-1', 'action-1');
    const edge2 = makeEdge('e2', 'statechart.invokes-action', 'transition-2', 'action-2');

    const graph = makeGraph(
      [action1, action2, action3, transition1, transition2],
      [edge1, edge2],
    );

    const orphans = findOrphanActions(graph);

    expect(orphans.has('action-1')).toBe(false);
    expect(orphans.has('action-2')).toBe(false);
    expect(orphans.has('action-3')).toBe(true);
    expect(orphans.size).toBe(1);
  });

  it('returns all actions as orphans when no invokes-action edges exist', () => {
    const action1 = makeNode('action-1', 'rtp.action');
    const graph = makeGraph([action1], []);
    const orphans = findOrphanActions(graph);
    expect(orphans.has('action-1')).toBe(true);
  });

  it('returns empty set when all actions are invoked', () => {
    const action1 = makeNode('action-1', 'rtp.action');
    const transition1 = makeNode('transition-1', 'statechart.transition');
    const edge1 = makeEdge('e1', 'statechart.invokes-action', 'transition-1', 'action-1');
    const graph = makeGraph([action1, transition1], [edge1]);
    const orphans = findOrphanActions(graph);
    expect(orphans.size).toBe(0);
  });

  it('does not include non-action nodes', () => {
    const state1 = makeNode('state-1', 'statechart.state');
    const graph = makeGraph([state1], []);
    const orphans = findOrphanActions(graph);
    expect(orphans.size).toBe(0);
  });
});
