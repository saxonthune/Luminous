import { describe, it, expect } from 'vitest';
import type { AtlasDocument } from '@luminous/core/atlas';
import type { Action, MenuItem } from '@luminous/cactus';
import { nodeContextMenu, type AtlasMenuDeps } from '../menus.tsx';

const DOC: AtlasDocument = {
  v: 1,
  nodes: [
    { id: 'a', name: 'A' },
    { id: 'b', name: 'B', parent: 'a' },
    { id: 'c', name: 'C', parent: 'a' },
    { id: 'd', name: 'D', parent: 'b' },
  ],
  edges: [],
};

function deps(doc: AtlasDocument = DOC): AtlasMenuDeps {
  return {
    doc: () => doc,
    nodeColor: () => undefined,
    selectedIds: () => [],
    onPreviewColor: () => {},
    onSelectColor: () => {},
  };
}

function findAction(items: MenuItem[], id: string): Action | undefined {
  for (const item of items) {
    if (item.type === 'action' && item.action.id === id) return item.action;
    if (item.type === 'submenu') {
      const found = findAction(item.items, id);
      if (found) return found;
    }
  }
  return undefined;
}

describe('nodeContextMenu — Select all children (R83)', () => {
  it('offers the option on a Container, carrying its Children at depth 1', () => {
    const action = findAction(nodeContextMenu(deps(), 'a').items, 'selection.selectChildren');
    expect(action?.label).toBe('Select all children');
    expect(action?.payload).toEqual({ ids: ['b', 'c'] });
  });

  it('does not offer the option on a leaf Node', () => {
    const action = findAction(nodeContextMenu(deps(), 'd').items, 'selection.selectChildren');
    expect(action).toBeUndefined();
  });
});
