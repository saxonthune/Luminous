import { describe, it, expect } from 'vitest';
import { routeEdges, type NodeRect } from '../src/edgeRouting.js';
import type { EdgeDeclaration } from '../src/types.js';

function rect(x: number, y: number, w = 60, h = 40): NodeRect {
  return { x, y, w, h };
}

function edge(id: string, sourceId: string, targetId: string): EdgeDeclaration {
  return { id, sourceId, targetId };
}

// Horizontal pair: A at (0,0), B at (200,0). Both 60x40 centered on (30,20) and (230,20).
// dx=200, dy=0 → src exit (60, 20), tgt exit (200, 20). Length 140, axis fully horizontal.
const HORIZ_NODES: ReadonlyMap<string, NodeRect> = new Map([
  ['a', rect(0, 0)],
  ['b', rect(200, 0)],
]);

describe('routeEdges', () => {
  it('single edge: perimeter intersect, no offset, label at midpoint', () => {
    const result = routeEdges([edge('e1', 'a', 'b')], HORIZ_NODES);
    const g = result.get('e1')!;
    expect(g.x1).toBe(60);
    expect(g.y1).toBe(20);
    expect(g.x2).toBe(200);
    expect(g.y2).toBe(20);
    expect(g.labelX).toBe(130);
    expect(g.labelY).toBe(20);
  });

  it('omits edges whose endpoint is not in nodeRects', () => {
    const result = routeEdges([edge('e1', 'a', 'missing')], HORIZ_NODES);
    expect(result.has('e1')).toBe(false);
  });

  it('reverse pair: lines offset perpendicular in opposite directions', () => {
    const result = routeEdges(
      [edge('e1', 'a', 'b'), edge('e2', 'b', 'a')],
      HORIZ_NODES,
    );
    const g1 = result.get('e1')!;
    const g2 = result.get('e2')!;
    // Canonical axis is a→b (low-id 'a' to high-id 'b'): direction (1, 0), normal (0, 1).
    // Bundle size 2 → indices 0, 1 → offsets -9, +9 (spacing 18, centered).
    // e1 sorts before e2 alphabetically, so e1 gets -9, e2 gets +9.
    expect(g1.y1).toBe(20 + -9);
    expect(g1.y2).toBe(20 + -9);
    expect(g2.y1).toBe(20 + 9);
    expect(g2.y2).toBe(20 + 9);
    // x endpoints unchanged (offset is purely vertical here)
    expect(g1.x1).toBe(60);
    expect(g1.x2).toBe(200);
  });

  it('reverse pair: labels stagger along their own line', () => {
    const result = routeEdges(
      [edge('e1', 'a', 'b'), edge('e2', 'b', 'a')],
      HORIZ_NODES,
    );
    const g1 = result.get('e1')!;
    const g2 = result.get('e2')!;
    // With LABEL_T_SPAN = 0.4 and bundle of 2: indices 0, 1 → t = 0.3, 0.7.
    // e1 (a→b): line x from 60 to 200, t=0.3 → x = 60 + 0.3*140 = 102.
    // e2 (b→a): line x from 200 to 60, t=0.7 → x = 200 + 0.7*-140 = 102.
    // The labels end up at the same x (mirror-image t values on reversed lines).
    // What matters is the y offset still separates them: g1.y=11, g2.y=29.
    expect(g1.labelX).toBeCloseTo(102);
    expect(g1.labelY).toBe(11);
    expect(g2.labelX).toBeCloseTo(102);
    expect(g2.labelY).toBe(29);
  });

  it('same-direction parallel pair: still fanned out', () => {
    const result = routeEdges(
      [edge('e1', 'a', 'b'), edge('e2', 'a', 'b')],
      HORIZ_NODES,
    );
    const g1 = result.get('e1')!;
    const g2 = result.get('e2')!;
    expect(g1.y1).toBe(11);
    expect(g2.y1).toBe(29);
    // Same line direction → labels staggered at distinct x positions too.
    expect(g1.labelX).not.toBe(g2.labelX);
  });

  it('three-edge mixed bundle (1 forward + 2 reverse): all parallel and distinct', () => {
    const result = routeEdges(
      [edge('e1', 'a', 'b'), edge('e2', 'b', 'a'), edge('e3', 'b', 'a')],
      HORIZ_NODES,
    );
    const g1 = result.get('e1')!;
    const g2 = result.get('e2')!;
    const g3 = result.get('e3')!;
    // Bundle size 3, sorted by id: e1, e2, e3 → indices 0, 1, 2 → offsets -18, 0, +18.
    expect(g1.y1).toBe(2);
    expect(g2.y1).toBe(20);
    expect(g3.y1).toBe(38);
    // All three at distinct y positions
    expect(new Set([g1.y1, g2.y1, g3.y1]).size).toBe(3);
  });

  it('self-loop is omitted from bundling (no offset applied)', () => {
    const result = routeEdges(
      [edge('e1', 'a', 'a'), edge('e2', 'a', 'b')],
      HORIZ_NODES,
    );
    const g2 = result.get('e2')!;
    // e2 is alone in its a→b bundle, so no fan-out.
    expect(g2.y1).toBe(20);
    expect(g2.labelX).toBe(130);
  });

  it('bundle ordering is deterministic by edge id', () => {
    const forward = routeEdges(
      [edge('z', 'a', 'b'), edge('a', 'a', 'b')],
      HORIZ_NODES,
    );
    const reversed = routeEdges(
      [edge('a', 'a', 'b'), edge('z', 'a', 'b')],
      HORIZ_NODES,
    );
    // Regardless of input order, edge 'a' sorts first and gets the same offset.
    expect(forward.get('a')!.y1).toBe(reversed.get('a')!.y1);
    expect(forward.get('z')!.y1).toBe(reversed.get('z')!.y1);
    expect(forward.get('a')!.y1).not.toBe(forward.get('z')!.y1);
  });
});
