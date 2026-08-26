import { describe, expect, it } from 'vitest';
import { emptyMerinoDocument } from '@luminous/core/merino';
import type { Action, MenuItem } from '@luminous/cactus';
import { backgroundContextMenu, type MerinoMenuDeps } from '../menus.tsx';

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
