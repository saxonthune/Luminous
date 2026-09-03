import type { MerinoDocument, MerinoNodeType } from '@luminous/core/merino';
import { SEED_NODE_TYPES } from '@luminous/core/merino';
import type { CanvasContextMenuPosition, MenuItem, MenuSchema } from '@luminous/cactus';

export interface MerinoMenuDeps {
  doc: () => MerinoDocument;
  /** Node Type ids in most-recently-used-first order (session state). */
  recentTypeIds: () => string[];
  /** Stable Node ids currently presented as Overview roots. */
  overviewRootIds: () => readonly string[];
}

export interface MerinoDownstreamNode {
  id: string;
  name: string;
}

/** Distinct destinations of authored outbound Edges, in Document order. */
export function downstreamNodes(doc: MerinoDocument, nodeId: string): MerinoDownstreamNode[] {
  const names = new Map(doc.nodes.map((node) => [node.id, node.name]));
  const seen = new Set<string>();
  const downstream: MerinoDownstreamNode[] = [];
  for (const edge of doc.edges) {
    if (edge.from !== nodeId || seen.has(edge.to) || !names.has(edge.to)) continue;
    seen.add(edge.to);
    downstream.push({ id: edge.to, name: names.get(edge.to)! });
  }
  return downstream;
}

export function downstreamMenuItems(nodes: ReadonlyArray<MerinoDownstreamNode>): MenuItem[] {
  return nodes.map((node) => ({
    type: 'action',
    action: { id: 'node.viewDownstream', label: node.name || node.id, payload: { targetId: node.id } },
  }));
}

/** The ids of the built-in starter Node Types, in their canonical order. */
const SEED_TYPE_IDS = SEED_NODE_TYPES.map((t) => t.id);

function addTypedItem(t: MerinoNodeType, position: CanvasContextMenuPosition): MenuItem {
  return {
    type: 'action',
    action: {
      id: 'node.add',
      label: t.name,
      payload: { nodeType: t.id, x: position.canvasX, y: position.canvasY },
    },
  };
}

function nodeTypeSubmenu(doc: MerinoDocument, currentTypeId: string, nodeId: string): MenuItem {
  const currentType = doc.nodeTypes.find((t) => t.id === currentTypeId);
  const hasChildren = doc.nodes.some((n) => n.parent === nodeId);
  // A Node with children must keep a Container Type — offer the others disabled
  // so the reason the option is unavailable is visible (mirrors operations.setNode).
  const wouldOrphanChildren = (t: MerinoNodeType): boolean =>
    hasChildren && currentType?.layout !== undefined && t.layout === undefined;
  const typeItems: MenuItem[] = doc.nodeTypes.map((t) => ({
    type: 'action',
    action: {
      id: 'node.setType',
      label: t.id === currentTypeId ? `● ${t.name}` : t.name,
      enabled: !wouldOrphanChildren(t),
      payload: { id: nodeId, typeId: t.id },
    },
  }));
  return {
    type: 'submenu',
    label: 'Type',
    items: [
      ...typeItems,
      { type: 'divider' },
      { type: 'action', action: { id: 'node.newType', label: 'New type…', payload: { id: nodeId } } },
    ],
  };
}

export function nodeContextMenu(deps: MerinoMenuDeps, nodeId: string): MenuSchema | undefined {
  const doc = deps.doc();
  const node = doc.nodes.find((n) => n.id === nodeId);
  if (!node) return undefined;
  const downstream = downstreamNodes(doc, nodeId);
  const downstreamItem: MenuItem | undefined = downstream.length > 0
    ? {
        type: 'action-submenu',
        action: {
          id: 'node.viewDownstream',
          label: 'View Downstream Node',
          payload: { targetId: downstream[0].id },
        },
        items: downstreamMenuItems(downstream),
      }
    : undefined;
  return {
    id: `merino-node-${nodeId}`,
    items: [
      { type: 'action', action: { id: 'selection.copy', label: 'Copy', payload: {} } },
      { type: 'action', action: { id: 'selection.paste', label: 'Paste', payload: {} } },
      { type: 'divider' },
      { type: 'action', action: { id: 'node.addSubnode', label: 'Add subnode', payload: { parent: nodeId } } },
      {
        type: 'action',
        action: {
          id: deps.overviewRootIds().includes(nodeId) ? 'node.removeFromOverview' : 'node.pinToOverview',
          label: deps.overviewRootIds().includes(nodeId) ? 'Remove from Overview' : 'Pin to Overview',
          selected: deps.overviewRootIds().includes(nodeId),
          payload: { id: nodeId },
        },
      },
      nodeTypeSubmenu(doc, node.type, nodeId),
      ...(downstreamItem ? [downstreamItem] : []),
      { type: 'divider' },
      { type: 'action', action: { id: 'node.delete', label: 'Delete', tone: 'danger', payload: { id: nodeId } } },
    ],
  };
}

export function backgroundContextMenu(deps: MerinoMenuDeps, position: CanvasContextMenuPosition): MenuSchema {
  const doc = deps.doc();
  const byId = new Map(doc.nodeTypes.map((t) => [t.id, t]));

  // The six most-recently-used Types, newest first — only those still in the
  // registry.
  const recent = deps
    .recentTypeIds()
    .filter((id) => byId.has(id))
    .slice(0, 6)
    .map((id) => addTypedItem(byId.get(id)!, position));

  // The built-in starter Types that still exist, in their canonical order.
  const builtin = SEED_TYPE_IDS.filter((id) => byId.has(id)).map((id) => addTypedItem(byId.get(id)!, position));

  const addItems: MenuItem[] = [...recent];
  if (recent.length > 0 && builtin.length > 0) addItems.push({ type: 'divider' });
  addItems.push(...builtin);
  if (addItems.length === 0) {
    addItems.push({
      type: 'action',
      action: { id: 'node.add', label: 'New node', payload: { x: position.canvasX, y: position.canvasY } },
    });
  }

  return {
    id: 'merino-background',
    items: [
      { type: 'submenu', label: 'Add Node', items: addItems },
      { type: 'action', action: { id: 'selection.paste', label: 'Paste', payload: { x: position.canvasX, y: position.canvasY } } },
      { type: 'divider' },
      { type: 'action', action: { id: 'types.manage', label: 'Manage types…', payload: {} } },
    ],
  };
}

export function edgeContextMenu(deps: MerinoMenuDeps, edgeId: string): MenuSchema | undefined {
  const doc = deps.doc();
  const edge = doc.edges.find((e) => e.id === edgeId);
  // A dotted Subnode link (id "sub:…") is not an authored Edge — it has no menu.
  if (!edge) return undefined;
  const typeItems: MenuItem[] = doc.edgeTypes.map((t) => ({
    type: 'action',
    action: {
      id: 'edge.setType',
      label: t.id === edge.type ? `● ${t.name}` : t.name,
      payload: { id: edgeId, typeId: t.id },
    },
  }));
  return {
    id: `merino-edge-${edgeId}`,
    items: [
      {
        type: 'submenu',
        label: 'Type',
        items: [
          ...typeItems,
          { type: 'divider' },
          { type: 'action', action: { id: 'edge.newType', label: 'New type…', payload: { id: edgeId } } },
        ],
      },
      { type: 'divider' },
      { type: 'action', action: { id: 'edge.delete', label: 'Delete', tone: 'danger', payload: { id: edgeId } } },
    ],
  };
}
