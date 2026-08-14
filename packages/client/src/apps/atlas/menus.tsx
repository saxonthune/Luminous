import type { AtlasColorToken, AtlasDocument } from '@luminous/core/atlas';
import type { ChromeSchema, MenuSchema, MenuItem } from '@luminous/cactus';
import { ColorSwatchGrid } from './ColorSwatchGrid.tsx';
import { sameParent } from './arrange.ts';
import { childrenOf } from './mutations.ts';

/** What the menu builders read from AtlasCanvas — accessors, so each open
 * menu sees the live Document and selection. */
export interface AtlasMenuDeps {
  doc: () => AtlasDocument;
  nodeColor: (nodeId: string) => AtlasColorToken | undefined;
  selectedIds: () => readonly string[];
  onPreviewColor: (nodeId: string, token: AtlasColorToken | undefined) => void;
  onSelectColor: (nodeId: string, token: AtlasColorToken) => void;
}

export function nodeContextMenu(deps: AtlasMenuDeps, nodeId: string): MenuSchema {
  // R83: a leaf Node has no Children, so the item is hidden rather than disabled.
  const childIds = childrenOf(deps.doc(), nodeId);
  const items: MenuItem[] = [
    { type: 'action', action: { id: 'node.duplicate', label: 'Duplicate', payload: { id: nodeId } } },
    { type: 'action', action: { id: 'node.add', label: 'Add Node', payload: { parent: nodeId } } },
    ...(childIds.length > 0
      ? ([{
          type: 'action',
          action: { id: 'selection.selectChildren', label: 'Select all children', payload: { ids: childIds } },
        }] as MenuItem[])
      : []),
    // R97: only a Container with 2+ Children can hold a sibling overlap.
    ...(childIds.length >= 2
      ? ([{
          type: 'action',
          action: { id: 'overlap.remove', label: 'Remove Overlap', payload: { parent: nodeId } },
        }] as MenuItem[])
      : []),
    { type: 'divider' },
    {
      type: 'submenu',
      label: 'Color',
      items: [
        {
          type: 'custom',
          id: 'color-swatches',
          render: () => (
            <ColorSwatchGrid
              current={() => deps.nodeColor(nodeId)}
              onPreview={(token) => deps.onPreviewColor(nodeId, token)}
              onSelect={(token) => deps.onSelectColor(nodeId, token)}
            />
          ),
        },
      ],
    },
  ];
  // R28/R29: only offered for a 2+-Node selection; disabled when the
  // selection spans different Containers rather than hidden, per the plan.
  const selectedIds = deps.selectedIds();
  if (selectedIds.length >= 2) {
    items.push(
      { type: 'divider' },
      {
        type: 'submenu',
        label: 'Arrange as',
        items: [
          {
            type: 'action',
            action: {
              id: 'arrange.column',
              label: 'Column',
              enabled: sameParent(deps.doc(), [...selectedIds]),
              payload: { ids: [...selectedIds] },
            },
          },
          {
            type: 'action',
            action: {
              id: 'arrange.row',
              label: 'Row',
              enabled: sameParent(deps.doc(), [...selectedIds]),
              payload: { ids: [...selectedIds] },
            },
          },
        ],
      },
    );
  }
  // R53: Delete sits last, below a divider, so the destructive action never
  // neighbors the common ones.
  items.push(
    { type: 'divider' },
    { type: 'action', action: { id: 'node.delete', label: 'Delete', payload: { id: nodeId } } },
  );
  return { id: `node-menu-${nodeId}`, items };
}

export function backgroundContextMenu(): MenuSchema {
  return {
    id: 'background-menu',
    items: [
      { type: 'action', action: { id: 'node.add', label: 'Add Node', payload: {} } },
      { type: 'action', action: { id: 'overlap.remove', label: 'Remove Overlap', payload: {} } },
    ],
  };
}

export function buildChrome(history: { canUndo: () => boolean; canRedo: () => boolean }): ChromeSchema {
  return {
    top: [
      {
        id: 'atlas-history-toolbar',
        controls: [
          {
            type: 'button',
            action: { id: 'history.undo', label: 'Undo', hotkey: 'Mod+z', enabled: history.canUndo() },
          },
          {
            type: 'button',
            action: { id: 'history.redo', label: 'Redo', hotkey: 'Mod+Shift+z', enabled: history.canRedo() },
          },
        ],
      },
      {
        id: 'atlas-view-toolbar',
        controls: [{ type: 'button', action: { id: 'view.fit', label: 'Fit' } }],
      },
    ],
  };
}
