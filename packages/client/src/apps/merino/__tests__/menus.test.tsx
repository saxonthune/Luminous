import { describe, expect, it } from 'vitest';
import { emptyMerinoDocument } from '@luminous/core/merino';
import type { Action, MenuItem } from '@luminous/cactus';
import { backgroundContextMenu, downstreamNodes, nodeContextMenu, type MerinoMenuDeps } from '../menus.tsx';

function findAction(items: MenuItem[], id: string): Action | undefined {
  for (const item of items) {
    if (item.type === 'action' && item.action.id === id) return item.action;
    if (item.type === 'submenu') {
      const found = findAction(item.items, id);
      if (found) return found;
    }
    if (item.type === 'action-submenu') {
      if (item.action.id === id) return item.action;
      const found = findAction(item.items, id);
      if (found) return found;
    }
  }
  return undefined;
}

describe('Merino background context menu', () => {
  it('carries the canvas-space click position into Add Node actions', () => {
    const doc = emptyMerinoDocument();
    const deps: MerinoMenuDeps = { doc: () => doc, recentTypeIds: () => [] };
    const menu = backgroundContextMenu(deps, {
      clientX: 900,
      clientY: 500,
      canvasX: 275,
      canvasY: 125,
    });

    expect(findAction(menu.items, 'node.add')?.payload).toMatchObject({ x: 275, y: 125 });
    expect(findAction(menu.items, 'selection.paste')?.payload).toEqual({ x: 275, y: 125 });
  });
});

describe('Merino downstream navigation', () => {
  it('uses distinct outbound destinations in Document order', () => {
    const base = emptyMerinoDocument();
    const doc = {
      ...base,
      nodes: [
        { id: 'source', tab: 'requirements' as const, type: base.nodeTypes[0].id, name: 'Source', x: 0, y: 0 },
        { id: 'first', tab: 'requirements' as const, type: base.nodeTypes[0].id, name: 'First', x: 100, y: 0 },
        { id: 'second', tab: 'requirements' as const, type: base.nodeTypes[0].id, name: 'Second', x: 200, y: 0 },
      ],
      edges: [
        { id: 'e1', type: base.edgeTypes[0].id, from: 'source', to: 'second', tab: 'requirements' as const },
        { id: 'e2', type: base.edgeTypes[0].id, from: 'source', to: 'first', tab: 'requirements' as const },
        { id: 'e3', type: base.edgeTypes[0].id, from: 'source', to: 'second', tab: 'requirements' as const },
      ],
    };
    const deps: MerinoMenuDeps = { doc: () => doc, recentTypeIds: () => [] };

    expect(downstreamNodes(doc, 'source')).toEqual([
      { id: 'second', name: 'Second' },
      { id: 'first', name: 'First' },
    ]);

    const item = nodeContextMenu(deps, 'source')?.items.find((candidate) => candidate.type === 'action-submenu');
    expect(item).toMatchObject({
      action: { id: 'node.viewDownstream', payload: { targetId: 'second' } },
      items: [
        { action: { payload: { targetId: 'second' } } },
        { action: { payload: { targetId: 'first' } } },
      ],
    });
  });

  it('omits downstream navigation when a Node has no outbound Edge', () => {
    const doc = emptyMerinoDocument();
    const node = { id: 'leaf', tab: 'requirements' as const, type: doc.nodeTypes[0].id, name: 'Leaf', x: 0, y: 0 };
    const withNode = { ...doc, nodes: [node] };
    const deps: MerinoMenuDeps = { doc: () => withNode, recentTypeIds: () => [] };

    expect(nodeContextMenu(deps, 'leaf')?.items.some((item) => item.type === 'action-submenu')).toBe(false);
  });
});
