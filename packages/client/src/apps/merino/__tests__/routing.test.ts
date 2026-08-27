import { describe, expect, it } from 'vitest';
import type { MerinoDocument } from '@luminous/core/merino';
import type { EdgeRoute, RegisteredNodeRect } from '@luminous/cactus';
import { projectMerino } from '../projection.ts';

const nodeTypes = [
  { id: 'freeform', name: 'Freeform', color: 'accent-1' as const, layout: 'container' as const },
  { id: 'leaf', name: 'Leaf', color: 'accent-3' as const },
  { id: 'leaf2', name: 'Leaf2', color: 'accent-4' as const },
];
const edgeType = { id: 'flows', name: 'flows', color: 'accent-1' as const, dash: 'solid' as const, arrowHead: true, directed: true };

/** Project the requirements tab and expose each Edge's realized route, built
 * against the projection's own rects (the same rects the plan pass measured). */
function routed(doc: MerinoDocument) {
  const projection = projectMerino(doc, 'requirements');
  const rects = new Map<string, RegisteredNodeRect>(
    projection.nodes.map((rn) => [rn.node.id, { x: rn.x, y: rn.y, w: rn.w, h: rn.h }]),
  );
  const routeOf = (edgeId: string): EdgeRoute | null => {
    const edge = projection.edges.find((e) => e.id === edgeId);
    return edge?.routeBuilder?.(rects) ?? null;
  };
  return { projection, rects, routeOf };
}

/** Two top-level source leaves, each edged to one leaf buried in a Container —
 * so both Edges thread the Container's single entry Port. */
function twoIntoOneContainer(): MerinoDocument {
  return {
    v: 1, nodeTypes, edgeTypes: [edgeType],
    nodes: [
      { id: 's1', tab: 'requirements', type: 'leaf', name: 'S1', x: 0, y: 0 },
      { id: 's2', tab: 'requirements', type: 'leaf', name: 'S2', x: 0, y: 400 },
      { id: 'c', tab: 'requirements', type: 'freeform', name: 'C', x: 700, y: 0 },
      { id: 't', tab: 'requirements', type: 'leaf', name: 'T', parent: 'c', x: 0, y: 0 },
    ],
    edges: [
      { id: 'e1', tab: 'requirements', type: 'flows', from: 's1', to: 't' },
      { id: 'e2', tab: 'requirements', type: 'flows', from: 's2', to: 't' },
    ],
  };
}

describe('Merino routing — port threading', () => {
  it('a container-crossing edge threads the container wall', () => {
    const { routeOf, rects } = routed(twoIntoOneContainer());
    const route = routeOf('e1');
    expect(route).not.toBeNull();
    // The route has interior waypoints (it does not run straight center-to-center)
    // and passes through the container's left wall.
    expect(route!.points.length).toBeGreaterThan(2);
    const container = rects.get('c')!;
    expect(route!.points.some((p) => Math.abs(p.x - container.x) < 12)).toBe(true);
  });

  it('an intra-container edge routes directly between two children', () => {
    const doc: MerinoDocument = {
      v: 1, nodeTypes, edgeTypes: [edgeType],
      nodes: [
        { id: 'box', tab: 'requirements', type: 'freeform', name: 'Box', x: 0, y: 0, width: 900, height: 600 },
        { id: 'a', tab: 'requirements', type: 'leaf', name: 'A', parent: 'box', x: 0, y: 0 },
        { id: 'b', tab: 'requirements', type: 'leaf', name: 'B', parent: 'box', x: 500, y: 300 },
      ],
      edges: [{ id: 'e', tab: 'requirements', type: 'flows', from: 'a', to: 'b' }],
    };
    const route = routed(doc).routeOf('e');
    expect(route).not.toBeNull();
    expect(route!.points.length).toBeGreaterThanOrEqual(2);
  });
});

const wallX = 700; // container c's left edge in these fixtures
const dist = (a: { x: number; y: number }, b: { x: number; y: number }) => Math.hypot(a.x - b.x, a.y - b.y);
const wallCrossing = (route: EdgeRoute) => route.points.find((p) => Math.abs(p.x - wallX) < 12)!;

describe('Merino routing — bundle consolidation', () => {
  it('same-bundle edges coincide at the shared port but keep distinct spokes', () => {
    // s1 and s2 are both top-level leaves edged to leaf t inside c — one bundle
    // (same source group, target group, edge type). They must share the port…
    const { routeOf } = routed(twoIntoOneContainer());
    const r1 = routeOf('e1');
    const r2 = routeOf('e2');
    expect(r1).not.toBeNull();
    expect(r2).not.toBeNull();
    expect(dist(wallCrossing(r1!), wallCrossing(r2!))).toBeLessThan(0.001);
    // …and fray into a distinct spoke at each source node.
    expect(dist(r1!.points[0], r2!.points[0])).toBeGreaterThan(4);
  });

  it('distinct bundles through one port fan apart', () => {
    // s1 is a leaf, s2 a leaf2 — different source groups, so two bundles. They
    // cross c's wall at distinct anchors.
    const doc = twoIntoOneContainer();
    doc.nodes.find((n) => n.id === 's2')!.type = 'leaf2';
    const { routeOf } = routed(doc);
    const r1 = routeOf('e1');
    const r2 = routeOf('e2');
    expect(dist(wallCrossing(r1!), wallCrossing(r2!))).toBeGreaterThan(4);
  });

  it('a lone bundle keeps the port at its stored offset', () => {
    const doc = twoIntoOneContainer();
    doc.edges = [doc.edges[0]]; // one edge, one bundle, no fan shift
    const route = routed(doc).routeOf('e1');
    expect(route).not.toBeNull();
    const container = routed(doc).rects.get('c')!;
    const midY = container.y + container.h / 2;
    const near = route!.points.filter((p) => Math.abs(p.x - container.x) < 12);
    expect(near.some((p) => Math.abs(p.y - midY) < 1)).toBe(true);
  });
});
