import { describe, it, expect } from 'vitest';
import type { AtlasDocument } from '@luminous/core/atlas';
import { layoutAtlas } from '../layout.ts';
import {
  toEdgeDeclarations,
  projectAtlasNodes,
  nodePositionOf,
  childAreaOrigin,
  childArea,
  CONTAINER_HEADER,
  liveAncestorSizes,
} from '../projection.ts';

const doc: AtlasDocument = {
  v: 1,
  nodes: [
    { id: 'root', name: 'Root' },
    { id: 'child-a', name: 'Child A', parent: 'root' },
    { id: 'child-b', name: 'Child B', parent: 'root' },
    { id: 'grandchild', name: 'Grandchild', parent: 'child-a' },
    { id: 'sibling', name: 'Sibling' },
  ],
  edges: [{ from: 'root', to: 'sibling', label: 'connects to' }],
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

  it('sizes a container\'s header band to its stored contentHeight instead of CONTAINER_HEADER', () => {
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
    // The container's size grows to include the taller header band.
    expect(root.h).toBeGreaterThanOrEqual(300);
    // The child area shifts down by the new header height.
    const area = childArea(root);
    expect(area.y).toBe(root.y + 300);
    expect(child.y).toBeGreaterThanOrEqual(area.y);
  });

  it('propagates a grown header up through an ancestor chain', () => {
    const nested: AtlasDocument = {
      v: 1,
      nodes: [
        { id: 'root', name: 'Root' },
        { id: 'mid', name: 'Mid', parent: 'root', contentHeight: 250 },
        { id: 'leaf', name: 'Leaf', parent: 'mid' },
      ],
      edges: [],
    };
    const rendered = projectAtlasNodes(nested);
    const byId = new Map(rendered.map((rn) => [rn.node.id, rn]));
    const root = byId.get('root')!;
    const mid = byId.get('mid')!;
    const leaf = byId.get('leaf')!;
    // mid's own size reflects its grown header band.
    expect(mid.h).toBeGreaterThanOrEqual(250 + leaf.h);
    // root's size grows to include mid's larger box — no impact-analysis
    // code, just the sizing recursion revisiting mid's new size.
    expect(root.h).toBeGreaterThanOrEqual(CONTAINER_HEADER + mid.h);
    // leaf still sits inside mid's (shifted) child area.
    const midArea = childArea(mid);
    expect(leaf.y).toBeGreaterThanOrEqual(midArea.y);
  });
});

describe('toEdgeDeclarations', () => {
  it('projects one EdgeDeclaration per AtlasEdge', () => {
    const edges = toEdgeDeclarations(doc);
    expect(edges).toHaveLength(1);
    expect(edges[0]).toMatchObject({ sourceId: 'root', targetId: 'sibling', labelText: 'connects to' });
  });
});

describe('liveAncestorSizes', () => {
  // A single-child chain (root -> mid -> leaf), all at (0,0) manual so every
  // offset is deterministic — matches the "manual position override" style
  // above (see childAreaOrigin() equality checks there).
  const chain: AtlasDocument = {
    v: 1,
    nodes: [
      { id: 'root', name: 'Root', x: 0, y: 0 },
      { id: 'mid', name: 'Mid', parent: 'root', x: 0, y: 0 },
      { id: 'leaf', name: 'Leaf', parent: 'mid', x: 0, y: 0 },
    ],
    edges: [],
  };

  it('returns an empty map for a top-level node — no ancestor to expand', () => {
    const rendered = projectAtlasNodes(chain);
    expect(liveAncestorSizes(rendered, ['root'], 50, 30)).toEqual(new Map());
  });

  it('grows every ancestor on the path by the drag delta, one memo down the chain', () => {
    const rendered = projectAtlasNodes(chain);
    const byId = new Map(rendered.map((rn) => [rn.node.id, rn]));
    const mid = byId.get('mid')!;
    const root = byId.get('root')!;

    const live = liveAncestorSizes(rendered, ['leaf', 'mid', 'root'], 50, 30);

    expect(live.get('mid')).toEqual({ w: mid.w + 50, h: mid.h + 30 });
    expect(live.get('root')).toEqual({ w: root.w + 50, h: root.h + 30 });
    // Only the two ancestors are keyed — the dragged leaf itself never grows.
    expect(live.has('leaf')).toBe(false);
    expect(live.size).toBe(2);
  });

  it('leaves a sibling branch unaffected, and stops growing an ancestor once a bigger sibling already dominates it', () => {
    const withSibling: AtlasDocument = {
      v: 1,
      nodes: [
        ...chain.nodes,
        // Far enough from the origin that its extent already exceeds
        // whatever the grown "mid" branch can reach.
        { id: 'big', name: 'Big', parent: 'root', x: 500, y: 500 },
      ],
      edges: [],
    };
    const rendered = projectAtlasNodes(withSibling);
    const byId = new Map(rendered.map((rn) => [rn.node.id, rn]));
    const root = byId.get('root')!;

    const live = liveAncestorSizes(rendered, ['leaf', 'mid', 'root'], 50, 30);

    // root's committed size already accounts for "big" as the dominant
    // child, so the live-expand preview leaves it exactly as committed.
    expect(live.get('root')).toEqual({ w: root.w, h: root.h });
    // "big" itself is never touched — it isn't on the dragged node's path.
    expect(live.has('big')).toBe(false);
  });

  it('clamps a negative (up/left) delta to no growth, matching committed sizes exactly', () => {
    const rendered = projectAtlasNodes(chain);
    const byId = new Map(rendered.map((rn) => [rn.node.id, rn]));
    const mid = byId.get('mid')!;
    const root = byId.get('root')!;

    const live = liveAncestorSizes(rendered, ['leaf', 'mid', 'root'], -50, -30);

    expect(live.get('mid')).toEqual({ w: mid.w, h: mid.h });
    expect(live.get('root')).toEqual({ w: root.w, h: root.h });
  });
});
