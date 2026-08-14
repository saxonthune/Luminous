import { describe, it, expect } from 'vitest';
import type { AtlasDocument } from '@luminous/core/atlas';
import { layoutAtlas } from '../layout.ts';
import {
  toEdgeDeclarations,
  projectAtlasEdgeRoute,
  projectAtlasNodes,
  nodePositionOf,
  childAreaOrigin,
  childArea,
  containerHeaderHeight,
  CONTAINER_HEADER,
  CONTAINER_BEZEL,
  CONTAINER_PADDING,
  NODE_WIDTH,
} from '../projection.ts';
import type { RegisteredNodeRect } from '@luminous/cactus';

const doc: AtlasDocument = {
  v: 1,
  nodes: [
    { id: 'root', name: 'Root' },
    { id: 'child-a', name: 'Child A', parent: 'root' },
    { id: 'child-b', name: 'Child B', parent: 'root' },
    { id: 'grandchild', name: 'Grandchild', parent: 'child-a' },
    { id: 'sibling', name: 'Sibling' },
  ],
  edges: [{ from: 'root', to: 'sibling' }],
};

describe('layoutAtlas', () => {
  it('assigns a position to every node', () => {
    const positions = layoutAtlas(doc);
    for (const node of doc.nodes) {
      expect(positions.has(node.id)).toBe(true);
    }
  });
});

describe('projectAtlasNodes', () => {
  it('assigns a position to every node', () => {
    const rendered = projectAtlasNodes(doc);
    expect(rendered).toHaveLength(doc.nodes.length);
    for (const rn of rendered) {
      expect(typeof rn.x).toBe('number');
      expect(typeof rn.y).toBe('number');
    }
  });

  it('marks nodes with children as containers', () => {
    const rendered = projectAtlasNodes(doc);
    const byId = new Map(rendered.map((rn) => [rn.node.id, rn]));
    expect(byId.get('root')?.hasChildren).toBe(true);
    expect(byId.get('child-a')?.hasChildren).toBe(true);
    expect(byId.get('child-b')?.hasChildren).toBe(false);
    expect(byId.get('grandchild')?.hasChildren).toBe(false);
    expect(byId.get('sibling')?.hasChildren).toBe(false);
  });

  it('nests a grandchild inside its parent and grandparent bounds', () => {
    const rendered = projectAtlasNodes(doc);
    const byId = new Map(rendered.map((rn) => [rn.node.id, rn]));
    const root = byId.get('root')!;
    const childA = byId.get('child-a')!;
    const grandchild = byId.get('grandchild')!;

    // Absolute positions: a grandchild's box lies within its parent's box,
    // which lies within the root's box.
    expect(childA.x).toBeGreaterThanOrEqual(root.x);
    expect(childA.y).toBeGreaterThanOrEqual(root.y);
    expect(childA.x + childA.w).toBeLessThanOrEqual(root.x + root.w);
    expect(childA.y + childA.h).toBeLessThanOrEqual(root.y + root.h);

    expect(grandchild.x).toBeGreaterThanOrEqual(childA.x);
    expect(grandchild.y).toBeGreaterThanOrEqual(childA.y);
    expect(grandchild.x + grandchild.w).toBeLessThanOrEqual(childA.x + childA.w);
    expect(grandchild.y + grandchild.h).toBeLessThanOrEqual(childA.y + childA.h);
  });

  it('orders parents before their children', () => {
    const rendered = projectAtlasNodes(doc);
    const indexOf = new Map(rendered.map((rn, i) => [rn.node.id, i]));
    expect(indexOf.get('root')!).toBeLessThan(indexOf.get('child-a')!);
    expect(indexOf.get('child-a')!).toBeLessThan(indexOf.get('grandchild')!);
  });
});

describe('nodePositionOf', () => {
  it('reports auto for a node with no stored x/y', () => {
    expect(nodePositionOf({ id: 'n', name: 'N' })).toEqual({ mode: 'auto' });
  });

  it('reports manual for a node with stored x/y', () => {
    expect(nodePositionOf({ id: 'n', name: 'N', x: 12, y: 34 })).toEqual({ mode: 'manual', x: 12, y: 34 });
  });
});

describe('projectAtlasNodes — manual position override', () => {
  it('places a manual root node at its stored position, overriding tidy', () => {
    const manualDoc: AtlasDocument = {
      v: 1,
      nodes: [
        { id: 'root', name: 'Root', x: 500, y: 500 },
        { id: 'sibling', name: 'Sibling' },
      ],
      edges: [],
    };
    const rendered = projectAtlasNodes(manualDoc);
    const root = rendered.find((rn) => rn.node.id === 'root')!;
    expect(root.x).toBe(500);
    expect(root.y).toBe(500);
  });

  it('falls back to the tidy position for a node without stored x/y', () => {
    const rendered = projectAtlasNodes(doc);
    const tidy = layoutAtlas(doc);
    const sibling = rendered.find((rn) => rn.node.id === 'sibling')!;
    const tidyPos = tidy.get('sibling')!;
    expect(sibling.x).toBe(tidyPos.x);
    expect(sibling.y).toBe(tidyPos.y);
  });

  it('resolves a manual child relative to its parent\'s child-area origin', () => {
    const manualDoc: AtlasDocument = {
      v: 1,
      nodes: [
        { id: 'root', name: 'Root', x: 100, y: 200 },
        { id: 'child', name: 'Child', parent: 'root', x: 10, y: 20 },
      ],
      edges: [],
    };
    const rendered = projectAtlasNodes(manualDoc);
    const root = rendered.find((rn) => rn.node.id === 'root')!;
    const child = rendered.find((rn) => rn.node.id === 'child')!;
    const origin = childAreaOrigin();
    expect(root.x).toBe(100);
    expect(root.y).toBe(200);
    expect(child.x).toBe(100 + 10 + origin.x);
    expect(child.y).toBe(200 + 20 + origin.y);
  });
});

describe('header/child-area split', () => {
  it('reserves the header band in a container\'s size, not in a leaf\'s', () => {
    const rendered = projectAtlasNodes(doc);
    const byId = new Map(rendered.map((rn) => [rn.node.id, rn]));
    const root = byId.get('root')!;
    const sibling = byId.get('sibling')!;
    expect(root.h).toBeGreaterThanOrEqual(CONTAINER_HEADER);
    expect(sibling.h).toBe(72);
  });

  it('places a child below the header band, inside its parent\'s child area', () => {
    const rendered = projectAtlasNodes(doc);
    const byId = new Map(rendered.map((rn) => [rn.node.id, rn]));
    const root = byId.get('root')!;
    const childA = byId.get('child-a')!;
    const area = childArea(root);
    expect(childA.y).toBeGreaterThanOrEqual(area.y);
    expect(childA.x).toBeGreaterThanOrEqual(area.x);
  });

  it('composes the header offset down two levels for a grandchild', () => {
    const rendered = projectAtlasNodes(doc);
    const byId = new Map(rendered.map((rn) => [rn.node.id, rn]));
    const childA = byId.get('child-a')!;
    const grandchild = byId.get('grandchild')!;
    const area = childArea(childA);
    expect(grandchild.y).toBeGreaterThanOrEqual(area.y);
    expect(grandchild.x).toBeGreaterThanOrEqual(area.x);
  });
});

describe('contentHeight override', () => {
  it('sizes a leaf\'s box to its stored contentHeight instead of NODE_HEIGHT', () => {
    const tallLeaf: AtlasDocument = {
      v: 1,
      nodes: [{ id: 'a', name: 'A', contentHeight: 300 }],
      edges: [],
    };
    const rendered = projectAtlasNodes(tallLeaf);
    const a = rendered.find((rn) => rn.node.id === 'a')!;
    expect(a.h).toBe(300);
  });

  it('does not grow a container\'s header band from its stored contentHeight — the header is a fixed constant', () => {
    const tallHeader: AtlasDocument = {
      v: 1,
      nodes: [
        { id: 'root', name: 'Root', contentHeight: 300 },
        { id: 'child', name: 'Child', parent: 'root' },
      ],
      edges: [],
    };
    const rendered = projectAtlasNodes(tallHeader);
    const byId = new Map(rendered.map((rn) => [rn.node.id, rn]));
    const root = byId.get('root')!;
    const child = byId.get('child')!;
    expect(containerHeaderHeight(root.node)).toBe(CONTAINER_HEADER);
    // The child area still starts right after the fixed header + bezel,
    // unaffected by the stored contentHeight override.
    const area = childArea(root);
    expect(area.y).toBe(root.y + CONTAINER_HEADER + CONTAINER_BEZEL);
    expect(child.y).toBeGreaterThanOrEqual(area.y);
  });
});

describe('CONTAINER_BEZEL', () => {
  it('insets the container box from the node\'s outer edge on every side', () => {
    const rendered = projectAtlasNodes(doc);
    const root = rendered.find((rn) => rn.node.id === 'root')!;
    const area = childArea(root);
    expect(area.x).toBe(root.x + CONTAINER_BEZEL);
    expect(area.y).toBe(root.y + CONTAINER_HEADER + CONTAINER_BEZEL);
    expect(area.w).toBe(root.w - 2 * CONTAINER_BEZEL);
    expect(area.h).toBe(root.h - CONTAINER_HEADER - 2 * CONTAINER_BEZEL);
  });

  it('offsets childAreaOrigin by the bezel beyond the padding and header', () => {
    const origin = childAreaOrigin();
    expect(origin.x).toBe(CONTAINER_PADDING + CONTAINER_BEZEL);
    expect(origin.y).toBe(CONTAINER_HEADER + CONTAINER_BEZEL);
  });
});

describe('contentWidth override', () => {
  it('sizes a leaf\'s box to its stored contentWidth instead of NODE_WIDTH', () => {
    const wideLeaf: AtlasDocument = {
      v: 1,
      nodes: [{ id: 'a', name: 'A', contentWidth: 400 }],
      edges: [],
    };
    const rendered = projectAtlasNodes(wideLeaf);
    const a = rendered.find((rn) => rn.node.id === 'a')!;
    expect(a.w).toBe(400);
  });

  it('floors a container\'s width to its stored contentWidth when wider than its children', () => {
    const wideContainer: AtlasDocument = {
      v: 1,
      nodes: [
        { id: 'root', name: 'Root', contentWidth: 500 },
        { id: 'child', name: 'Child', parent: 'root' },
      ],
      edges: [],
    };
    const rendered = projectAtlasNodes(wideContainer);
    const root = rendered.find((rn) => rn.node.id === 'root')!;
    expect(root.w).toBe(500);
  });

  it('lets the children\'s extent win when it is larger than contentWidth', () => {
    const narrowOverride: AtlasDocument = {
      v: 1,
      nodes: [
        { id: 'root', name: 'Root', contentWidth: 1 },
        { id: 'child', name: 'Child', parent: 'root' },
      ],
      edges: [],
    };
    const rendered = projectAtlasNodes(narrowOverride);
    const root = rendered.find((rn) => rn.node.id === 'root')!;
    expect(root.w).toBeGreaterThanOrEqual(NODE_WIDTH);
  });
});

describe('contentHeight as a container-box floor', () => {
  it('floors a container\'s box height to its stored contentHeight when taller than its children', () => {
    const tallContainer: AtlasDocument = {
      v: 1,
      nodes: [
        { id: 'root', name: 'Root', contentHeight: 500 },
        { id: 'child', name: 'Child', parent: 'root' },
      ],
      edges: [],
    };
    const rendered = projectAtlasNodes(tallContainer);
    const root = rendered.find((rn) => rn.node.id === 'root')!;
    expect(root.h).toBe(500);
  });

  it('lets the children\'s extent win when it is larger than contentHeight, never clipping them', () => {
    const shortOverride: AtlasDocument = {
      v: 1,
      nodes: [
        { id: 'root', name: 'Root', contentHeight: 1 },
        { id: 'child', name: 'Child', parent: 'root' },
      ],
      edges: [],
    };
    const rendered = projectAtlasNodes(shortOverride);
    const byId = new Map(rendered.map((rn) => [rn.node.id, rn]));
    const root = byId.get('root')!;
    const child = byId.get('child')!;
    // The child's box still fits entirely inside the root's, despite the
    // tiny stored floor — the children-extent term wins (R38).
    expect(root.h).toBeGreaterThanOrEqual(CONTAINER_HEADER);
    expect(child.y + child.h).toBeLessThanOrEqual(root.y + root.h);
  });

  it('behaves as pure shrink-wrap when no contentHeight is stored — unchanged from the previous phase', () => {
    const noOverride: AtlasDocument = {
      v: 1,
      nodes: [
        { id: 'root', name: 'Root' },
        { id: 'child', name: 'Child', parent: 'root' },
      ],
      edges: [],
    };
    const withOverride: AtlasDocument = {
      v: 1,
      nodes: [
        { id: 'root', name: 'Root', contentHeight: 1 },
        { id: 'child', name: 'Child', parent: 'root' },
      ],
      edges: [],
    };
    // A stored floor smaller than the shrink-wrapped extent changes nothing.
    const plain = projectAtlasNodes(noOverride).find((rn) => rn.node.id === 'root')!;
    const overridden = projectAtlasNodes(withOverride).find((rn) => rn.node.id === 'root')!;
    expect(overridden.h).toBe(plain.h);
  });
});

describe('toEdgeDeclarations', () => {
  it('projects one EdgeDeclaration per AtlasEdge', () => {
    const edges = toEdgeDeclarations(doc);
    expect(edges).toHaveLength(1);
    expect(edges[0]).toMatchObject({ sourceId: 'root', targetId: 'sibling' });
  });
});

function rect(x: number, y: number, w = 60, h = 40): RegisteredNodeRect {
  return { x, y, w, h };
}

function routeDoc(nodes: AtlasDocument['nodes'], from: string, to: string): AtlasDocument {
  return { v: 1, nodes, edges: [{ from, to }] };
}

describe('projectAtlasEdgeRoute', () => {
  it('keeps flat and same-container edges on cactus’s direct bundled route', () => {
    const flat = routeDoc([{ id: 'a', name: 'A' }, { id: 'b', name: 'B' }], 'a', 'b');
    expect(projectAtlasEdgeRoute(flat, flat.edges[0], new Map([['a', rect(0, 0)], ['b', rect(200, 0)]]))).toBeNull();

    const shared = routeDoc([{ id: 'box', name: 'Box' }, { id: 'a', name: 'A', parent: 'box' }, { id: 'b', name: 'B', parent: 'box' }], 'a', 'b');
    expect(projectAtlasEdgeRoute(shared, shared.edges[0], new Map([['box', rect(0, 0, 400, 300)], ['a', rect(40, 100)], ['b', rect(250, 100)]]))).toBeNull();
  });

  it('routes from a contained source through its Container boundary', () => {
    const routed = routeDoc([{ id: 'box', name: 'Box' }, { id: 'a', name: 'A', parent: 'box' }, { id: 'b', name: 'B' }], 'a', 'b');
    const route = projectAtlasEdgeRoute(routed, routed.edges[0], new Map([['box', rect(0, 0, 400, 300)], ['a', rect(40, 100)], ['b', rect(500, 100)]]));
    expect(route?.points.slice(1, 3)).toEqual([{ x: 388, y: 186 }, { x: 404, y: 186 }]);
    expect(route?.segmentLayers).toEqual([1, -1, -1]);
  });

  it('routes into a nested target and across two separate Containers', () => {
    const nested = routeDoc([{ id: 'box', name: 'Box' }, { id: 'a', name: 'A' }, { id: 'b', name: 'B', parent: 'box' }], 'a', 'b');
    const nestedRoute = projectAtlasEdgeRoute(nested, nested.edges[0], new Map([['box', rect(300, 0, 400, 300)], ['a', rect(0, 100)], ['b', rect(400, 100)]]));
    expect(nestedRoute?.points.slice(1, 3)).toEqual([{ x: 296, y: 186 }, { x: 312, y: 186 }]);

    const separate = routeDoc([{ id: 'left', name: 'Left' }, { id: 'right', name: 'Right' }, { id: 'a', name: 'A', parent: 'left' }, { id: 'b', name: 'B', parent: 'right' }], 'a', 'b');
    const separateRoute = projectAtlasEdgeRoute(separate, separate.edges[0], new Map([['left', rect(0, 0, 300, 300)], ['right', rect(500, 0, 300, 300)], ['a', rect(40, 100)], ['b', rect(600, 100)]]));
    expect(separateRoute?.points.slice(1, 5)).toEqual([
      { x: 288, y: 186 }, { x: 304, y: 186 }, { x: 496, y: 186 }, { x: 512, y: 186 },
    ]);
    expect(separateRoute?.segmentLayers).toEqual([1, -1, -1, -1, 1]);
  });

  it('uses the shared parent’s band between sibling Containers and deeper bands for nested containment', () => {
    const sibling = routeDoc([
      { id: 'root', name: 'Root' }, { id: 'left', name: 'Left', parent: 'root' }, { id: 'right', name: 'Right', parent: 'root' },
      { id: 'a', name: 'A', parent: 'left' }, { id: 'b', name: 'B', parent: 'right' },
    ], 'a', 'b');
    const route = projectAtlasEdgeRoute(sibling, sibling.edges[0], new Map([
      ['root', rect(0, 0, 900, 500)], ['left', rect(40, 100, 300, 300)], ['right', rect(500, 100, 300, 300)], ['a', rect(80, 200)], ['b', rect(600, 200)],
    ]));
    expect(route?.segmentLayers).toEqual([3, 1, 1, 1, 3]);

    const deep = routeDoc([{ id: 'root', name: 'Root' }, { id: 'inner', name: 'Inner', parent: 'root' }, { id: 'a', name: 'A', parent: 'inner' }, { id: 'b', name: 'B' }], 'a', 'b');
    const first = projectAtlasEdgeRoute(deep, deep.edges[0], new Map([['root', rect(0, 0, 600, 500)], ['inner', rect(40, 100, 400, 300)], ['a', rect(80, 200)], ['b', rect(800, 200)]]));
    const second = projectAtlasEdgeRoute(deep, deep.edges[0], new Map([['root', rect(0, 0, 600, 500)], ['inner', rect(40, 100, 400, 300)], ['a', rect(80, 200)], ['b', rect(800, 200)]]));
    expect(first).toEqual(second);
    expect(first?.segmentLayers).toEqual([3, 1, 1, -1, -1]);
  });

  it('falls back when a required Container rectangle is unavailable', () => {
    const routed = routeDoc([{ id: 'box', name: 'Box' }, { id: 'a', name: 'A', parent: 'box' }, { id: 'b', name: 'B' }], 'a', 'b');
    expect(projectAtlasEdgeRoute(routed, routed.edges[0], new Map([['a', rect(40, 100)], ['b', rect(500, 100)]]))).toBeNull();
  });

  it('uses stored shared Port centers and clamps pills away from corners', () => {
    const routed = routeDoc([
      { id: 'box', name: 'Box', ports: { exit: { side: 'top', offset: 0 } } },
      { id: 'a', name: 'A', parent: 'box' },
      { id: 'b', name: 'B' },
      { id: 'c', name: 'C', parent: 'box' },
    ], 'a', 'b');
    const rects = new Map([['box', rect(0, 0, 400, 300)], ['a', rect(40, 100)], ['b', rect(500, 100)], ['c', rect(80, 160)] ]);
    const first = projectAtlasEdgeRoute(routed, routed.edges[0], rects);
    const second = projectAtlasEdgeRoute({ ...routed, edges: [{ from: 'c', to: 'b' }] }, { from: 'c', to: 'b' }, rects);
    expect(first?.points.slice(1, 3)).toEqual([{ x: 28, y: 84 }, { x: 28, y: 68 }]);
    expect(second?.points[1]).toEqual(first?.points[1]);
  });
});
