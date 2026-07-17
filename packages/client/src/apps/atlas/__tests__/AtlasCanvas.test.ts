import { describe, it, expect } from 'vitest';
import type { AtlasDocument } from '@luminous/core/atlas';
import { projectAtlasNodes, containerHeaderHeight } from '../projection.ts';
import { addDelta, growAncestors, shiftSubtree, type LayoutDelta } from '../layoutOverride.ts';

/**
 * Builds the same delta a live content-resize composes in AtlasNodeLayer
 * (AtlasCanvas.tsx's `layoutDeltas` memo) — kept here as a plain-function
 * mirror so the composition can be asserted without mounting the component.
 */
function contentResizeDelta(doc: AtlasDocument, nodeId: string, previewHeight: number): Map<string, LayoutDelta> {
  const rendered = projectAtlasNodes(doc);
  const rn = rendered.find((n) => n.node.id === nodeId)!;
  const parentOf = new Map<string, string>();
  const childrenOf = new Map<string, string[]>();
  for (const r of rendered) {
    if (r.node.parent === undefined) continue;
    parentOf.set(r.node.id, r.node.parent);
    const list = childrenOf.get(r.node.parent) ?? [];
    list.push(r.node.id);
    childrenOf.set(r.node.parent, list);
  }
  const committed = rn.hasChildren ? containerHeaderHeight(rn.node) : rn.h;
  const dh = previewHeight - committed;

  const map = new Map<string, LayoutDelta>();
  addDelta(map, nodeId, { dh });
  shiftSubtree(map, nodeId, childrenOf, 0, dh, { includeRoot: false });
  growAncestors(map, nodeId, parentOf, rendered, { dh });
  return map;
}

/**
 * Builds the same delta a live content-resize composes in AtlasNodeLayer
 * (AtlasCanvas.tsx's `layoutDeltas` memo) for a width and/or height preview —
 * kept here as a plain-function mirror so the composition can be asserted
 * without mounting the component.
 */
function contentResizeDelta2D(
  doc: AtlasDocument,
  nodeId: string,
  preview: { width?: number; height?: number },
): Map<string, LayoutDelta> {
  const rendered = projectAtlasNodes(doc);
  const rn = rendered.find((n) => n.node.id === nodeId)!;
  const parentOf = new Map<string, string>();
  const childrenOf = new Map<string, string[]>();
  for (const r of rendered) {
    if (r.node.parent === undefined) continue;
    parentOf.set(r.node.id, r.node.parent);
    const list = childrenOf.get(r.node.parent) ?? [];
    list.push(r.node.id);
    childrenOf.set(r.node.parent, list);
  }

  const map = new Map<string, LayoutDelta>();
  const ownDelta: Partial<{ dw: number; dh: number }> = {};
  if (preview.width !== undefined) {
    const dw = preview.width - rn.w;
    addDelta(map, nodeId, { dw });
    ownDelta.dw = dw;
  }
  if (preview.height !== undefined) {
    const committed = rn.hasChildren ? containerHeaderHeight(rn.node) : rn.h;
    const dh = preview.height - committed;
    addDelta(map, nodeId, { dh });
    shiftSubtree(map, nodeId, childrenOf, 0, dh, { includeRoot: false });
    ownDelta.dh = dh;
  }
  growAncestors(map, nodeId, parentOf, rendered, ownDelta);
  return map;
}

describe('live content-resize composition (2D)', () => {
  // root -> mid -> leaf, all manual so geometry is deterministic.
  const chain: AtlasDocument = {
    v: 1,
    nodes: [
      { id: 'root', name: 'Root', x: 0, y: 0 },
      { id: 'mid', name: 'Mid', parent: 'root', x: 0, y: 0 },
      { id: 'leaf', name: 'Leaf', parent: 'mid', x: 0, y: 0 },
    ],
    edges: [],
  };

  it('a width-only drag grows the Node and its ancestor with no child shift', () => {
    const rendered = projectAtlasNodes(chain);
    const mid = rendered.find((rn) => rn.node.id === 'mid')!;
    const widerMid = mid.w + 60;

    const deltas = contentResizeDelta2D(chain, 'mid', { width: widerMid });

    expect(deltas.get('mid')).toMatchObject({ dw: 60, dh: 0 });
    // Widening never shifts children (see the task's "Do NOT" list).
    expect(deltas.get('leaf')).toBeUndefined();
    expect(deltas.get('root')?.dw).toBeGreaterThan(0);
  });

  it('a diagonal drag grows the Node and its ancestor on both axes and shifts children down only', () => {
    const rendered = projectAtlasNodes(chain);
    const mid = rendered.find((rn) => rn.node.id === 'mid')!;
    const widerMid = mid.w + 60;
    const tallerMid = containerHeaderHeight(mid.node) + 40;

    const deltas = contentResizeDelta2D(chain, 'mid', { width: widerMid, height: tallerMid });

    expect(deltas.get('mid')).toMatchObject({ dw: 60, dh: 40 });
    expect(deltas.get('leaf')).toMatchObject({ dx: 0, dy: 40 });
    expect(deltas.get('root')?.dw).toBeGreaterThan(0);
    expect(deltas.get('root')?.dh).toBeGreaterThan(0);
  });
});

describe('live content-resize composition', () => {
  // root -> mid -> leaf, all manual so geometry is deterministic.
  const chain: AtlasDocument = {
    v: 1,
    nodes: [
      { id: 'root', name: 'Root', x: 0, y: 0 },
      { id: 'mid', name: 'Mid', parent: 'root', x: 0, y: 0 },
      { id: 'leaf', name: 'Leaf', parent: 'mid', x: 0, y: 0 },
    ],
    edges: [],
  };

  it('growing a container header shifts its children down and grows it and its ancestor, matching a committed re-projection', () => {
    const rendered = projectAtlasNodes(chain);
    const mid = rendered.find((rn) => rn.node.id === 'mid')!;
    const grownHeader = containerHeaderHeight(mid.node) + 40;

    const deltas = contentResizeDelta(chain, 'mid', grownHeader);

    // mid's own box grows by the header delta.
    expect(deltas.get('mid')).toMatchObject({ dh: 40 });
    // leaf (mid's only child) shifts down by the same delta, not sideways.
    expect(deltas.get('leaf')).toMatchObject({ dx: 0, dy: 40 });
    // root, mid's ancestor, grows to contain mid's live extent.
    expect(deltas.get('root')?.dh).toBeGreaterThan(0);

    // The live preview must match what committing the same contentHeight and
    // re-projecting would produce.
    const committedDoc: AtlasDocument = {
      ...chain,
      nodes: chain.nodes.map((n) => (n.id === 'mid' ? { ...n, contentHeight: grownHeader } : n)),
    };
    const committedRendered = projectAtlasNodes(committedDoc);
    const committedMid = committedRendered.find((rn) => rn.node.id === 'mid')!;
    const committedRoot = committedRendered.find((rn) => rn.node.id === 'root')!;
    const committedLeaf = committedRendered.find((rn) => rn.node.id === 'leaf')!;

    const liveMid = mid.h + (deltas.get('mid')?.dh ?? 0);
    expect(liveMid).toBe(committedMid.h);

    const root = rendered.find((rn) => rn.node.id === 'root')!;
    const liveRoot = root.h + (deltas.get('root')?.dh ?? 0);
    expect(liveRoot).toBe(committedRoot.h);

    const leaf = rendered.find((rn) => rn.node.id === 'leaf')!;
    const liveLeafY = leaf.y + (deltas.get('leaf')?.dy ?? 0);
    expect(liveLeafY).toBe(committedLeaf.y);
  });
});
