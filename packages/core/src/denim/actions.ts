import {
  addDenimNode,
  clearDenimSequence,
  connectDenimChild,
  createDenimChild,
  deleteDenimNode,
  deleteDenimNodeAndChildren,
  getDenimGraph,
  getJourneyGraph,
  initializeDenimSequence,
  listCapabilities,
  listDenimWorkspaces,
  listJourneys,
  listTopLevelResources,
  putDenimWorkspace,
  removeDenimWorkspace,
  updateDenimEdgePriority,
  updateDenimNode,
  type DenimDatabase,
  type DenimNode,
} from './database.ts';

export type DenimQuerySource =
  | { kind: 'journeys' }
  | { kind: 'capabilities' }
  | { kind: 'resources' }
  | { kind: 'journey'; journeyId: string };

export interface DenimTabView {
  version: 1;
  id: string;
  kind: 'pinned' | 'workspace';
  title: string;
  sources: DenimQuerySource[];
  includedNodeIds: string[];
  positions: Record<string, { x: number; y: number }>;
  sequenceModes: Record<string, 'rank' | 'priority'>;
}

export const DENIM_PINNED_VIEWS: DenimTabView[] = [
  { version: 1, id: 'pinned:journeys', kind: 'pinned', title: 'Journeys', sources: [{ kind: 'journeys' }], includedNodeIds: [], positions: {}, sequenceModes: {} },
  { version: 1, id: 'pinned:capabilities', kind: 'pinned', title: 'Capabilities', sources: [{ kind: 'capabilities' }], includedNodeIds: [], positions: {}, sequenceModes: {} },
  { version: 1, id: 'pinned:resources', kind: 'pinned', title: 'Resources', sources: [{ kind: 'resources' }], includedNodeIds: [], positions: {}, sequenceModes: {} },
];

export type DenimAction =
  | { op: 'journey.create'; id?: string; text?: string }
  | { op: 'node.differentiate'; parentId: string; id?: string; edgeId?: string; type?: string; text?: string }
  | { op: 'edge.connect'; parentId: string; childId: string; edgeId?: string }
  | { op: 'node.update'; id: string; patch: Partial<Pick<DenimNode, 'type' | 'text'>> }
  | { op: 'node.delete'; id: string; scope: 'node' | 'subtree' }
  | { op: 'edge.priority.set'; edgeId: string; priority: number }
  | { op: 'sequence.initialize'; parentId: string; orderedChildIds: string[] }
  | { op: 'sequence.clear'; parentId: string }
  | { op: 'view.sequenceMode.set'; tabId: string; parentId: string; mode: 'rank' | 'priority' }
  | { op: 'view.includeNode'; tabId: string; nodeId: string }
  | { op: 'view.node.move'; tabId: string; nodeId: string; position: { x: number; y: number } }
  | { op: 'view.openJourney'; journeyId: string; tabId?: string }
  | { op: 'view.close'; tabId: string };

export const DENIM_ACTION_CATALOG = [
  { op: 'journey.create', required: [], optional: ['id', 'text'], purpose: 'Create a Journey Node.' },
  { op: 'node.differentiate', required: ['parentId'], optional: ['id', 'edgeId', 'type', 'text'], purpose: 'Create a child Node and connect it to its parent.' },
  { op: 'edge.connect', required: ['parentId', 'childId'], optional: ['edgeId'], purpose: 'Connect an existing Node as a child.' },
  { op: 'node.update', required: ['id', 'patch'], optional: [], purpose: 'Change a Node type or text.' },
  { op: 'node.delete', required: ['id', 'scope'], optional: [], purpose: 'Delete one Node or its full descendant subtree; scope is node or subtree.' },
  { op: 'edge.priority.set', required: ['edgeId', 'priority'], optional: [], purpose: 'Set an edge sequence priority.' },
  { op: 'sequence.initialize', required: ['parentId', 'orderedChildIds'], optional: [], purpose: 'Assign priorities in the supplied child order.' },
  { op: 'sequence.clear', required: ['parentId'], optional: [], purpose: 'Clear priorities on all child edges.' },
  { op: 'view.sequenceMode.set', required: ['tabId', 'parentId', 'mode'], optional: [], purpose: 'Set a view parent label mode to rank or priority.' },
  { op: 'view.includeNode', required: ['tabId', 'nodeId'], optional: [], purpose: 'Include a Node in a view.' },
  { op: 'view.node.move', required: ['tabId', 'nodeId', 'position'], optional: [], purpose: 'Save a Node position in a view.' },
  { op: 'view.openJourney', required: ['journeyId'], optional: ['tabId'], purpose: 'Create a workspace view sourced from a Journey.' },
  { op: 'view.close', required: ['tabId'], optional: [], purpose: 'Close a workspace view; pinned views cannot be closed.' },
] as const;

export interface DenimActionResult {
  ok: true;
  changed: boolean;
  nodeId?: string;
  tabId?: string;
}

const newId = (prefix: string) => `${prefix}-${crypto.randomUUID()}`;

export function readDenimViews(db: DenimDatabase): DenimTabView[] {
  const persisted = listDenimWorkspaces(db).map(({ payload }) => decodeView(payload)).filter((v): v is DenimTabView => Boolean(v));
  const overrides = new Map(persisted.filter((v) => v.kind === 'pinned').map((v) => [v.id, v]));
  return [
    ...DENIM_PINNED_VIEWS.map((view) => overrides.get(view.id) ?? view),
    ...persisted.filter((v) => v.kind === 'workspace'),
  ];
}

function isQuerySource(value: unknown): value is DenimQuerySource {
  if (!value || typeof value !== 'object') return false;
  const source = value as Record<string, unknown>;
  return source.kind === 'journeys' || source.kind === 'capabilities' || source.kind === 'resources'
    || (source.kind === 'journey' && typeof source.journeyId === 'string');
}

function decodeView(value: unknown): DenimTabView | undefined {
  if (!value || typeof value !== 'object') return;
  const tab = value as Partial<DenimTabView>;
  if (tab.version !== 1 || typeof tab.id !== 'string' || !Array.isArray(tab.sources) || !tab.sources.every(isQuerySource)
    || !Array.isArray(tab.includedNodeIds) || !tab.includedNodeIds.every((id) => typeof id === 'string')
    || !tab.positions || typeof tab.positions !== 'object') return;
  const positions: DenimTabView['positions'] = {};
  for (const [id, point] of Object.entries(tab.positions)) {
    if (!point || !Number.isFinite(point.x) || !Number.isFinite(point.y)) return;
    positions[id] = { x: point.x, y: point.y };
  }
  const sequenceModes: DenimTabView['sequenceModes'] = {};
  if (tab.sequenceModes && typeof tab.sequenceModes === 'object') {
    for (const [id, mode] of Object.entries(tab.sequenceModes)) if (mode === 'rank' || mode === 'priority') sequenceModes[id] = mode;
  }
  if (tab.kind === 'pinned') {
    const pinned = DENIM_PINNED_VIEWS.find((view) => view.id === tab.id);
    if (!pinned) return;
    return { ...pinned, includedNodeIds: [...new Set(tab.includedNodeIds)], positions, sequenceModes };
  }
  if (tab.kind !== 'workspace' || typeof tab.title !== 'string' || DENIM_PINNED_VIEWS.some((view) => view.id === tab.id)) return;
  return { version: 1, id: tab.id, kind: 'workspace', title: tab.title, sources: tab.sources,
    includedNodeIds: [...new Set(tab.includedNodeIds)], positions, sequenceModes };
}

function putView(db: DenimDatabase, view: DenimTabView): void {
  putDenimWorkspace(db, { id: view.id, payload: view });
}

function graphForView(db: DenimDatabase, view: DenimTabView) {
  const nodes = new Map<string, DenimNode>();
  const edges = new Map<string, ReturnType<typeof getDenimGraph>['edges'][number]>();
  for (const source of view.sources) {
    const graph = source.kind === 'journey' ? getJourneyGraph(db, source.journeyId)
      : source.kind === 'capabilities' ? { nodes: listCapabilities(db), edges: [] }
        : source.kind === 'resources' ? { nodes: listTopLevelResources(db), edges: [] }
          : { nodes: listJourneys(db), edges: [] };
    graph.nodes.forEach((node) => nodes.set(node.id, node));
    graph.edges.forEach((edge) => edges.set(edge.id, edge));
  }
  if (view.includedNodeIds.length) {
    const graph = getDenimGraph(db);
    const included = new Set(view.includedNodeIds);
    graph.nodes.filter((node) => included.has(node.id)).forEach((node) => nodes.set(node.id, node));
    graph.edges.filter((edge) => nodes.has(edge.sourceId) && nodes.has(edge.targetId)).forEach((edge) => edges.set(edge.id, edge));
  }
  return { nodes: [...nodes.values()], edges: [...edges.values()] };
}

function requireNode(db: DenimDatabase, id: string): DenimNode {
  const node = getDenimGraph(db).nodes.find((candidate) => candidate.id === id);
  if (!node) throw new Error(`Node not found: ${id}`);
  return node;
}

function requireView(db: DenimDatabase, id: string): DenimTabView {
  const view = readDenimViews(db).find((candidate) => candidate.id === id);
  if (!view) throw new Error(`View not found: ${id}`);
  return view;
}

/** Apply one validated Denim domain action to an open database. */
export function applyDenimAction(db: DenimDatabase, action: DenimAction): DenimActionResult {
  if (!action || typeof action !== 'object' || typeof action.op !== 'string') throw new Error('Invalid Denim action');
  switch (action.op) {
    case 'journey.create': {
      if (action.id !== undefined && typeof action.id !== 'string') throw new Error('Journey ID must be text');
      if (action.text !== undefined && typeof action.text !== 'string') throw new Error('Journey text must be text');
      const nodeId = action.id ?? newId('journey');
      addDenimNode(db, { id: nodeId, type: 'Journey', text: action.text ?? 'New journey' });
      return { ok: true, changed: true, nodeId };
    }
    case 'node.differentiate': {
      if (action.type !== undefined && typeof action.type !== 'string') throw new Error('Node type must be text');
      if (action.text !== undefined && typeof action.text !== 'string') throw new Error('Node text must be text');
      requireNode(db, action.parentId);
      const nodeId = action.id ?? newId('node');
      createDenimChild(db, action.parentId, { id: nodeId, type: action.type ?? 'Action', text: action.text ?? 'New action' }, action.edgeId ?? newId('parent-child'));
      return { ok: true, changed: true, nodeId };
    }
    case 'edge.connect':
      requireNode(db, action.parentId); requireNode(db, action.childId);
      if (action.parentId === action.childId) throw new Error('A node cannot connect to itself');
      if (getDenimGraph(db).edges.some((edge) => edge.type === 'parent-child'
        && edge.sourceId === action.parentId && edge.targetId === action.childId)) {
        throw new Error('These Nodes are already connected');
      }
      connectDenimChild(db, action.parentId, action.childId, action.edgeId ?? newId('parent-child'));
      return { ok: true, changed: true, nodeId: action.childId };
    case 'node.update': {
      if (!action.patch || typeof action.patch !== 'object' || Array.isArray(action.patch)) throw new Error('Node patch must be an object');
      const previous = requireNode(db, action.id);
      if (action.patch.type === undefined && action.patch.text === undefined) throw new Error('Node update requires type or text');
      if (action.patch.type !== undefined && typeof action.patch.type !== 'string') throw new Error('Node type must be text');
      if (action.patch.text !== undefined && typeof action.patch.text !== 'string') throw new Error('Node text must be text');
      updateDenimNode(db, action.id, action.patch);
      if (previous.type === 'Journey' && action.patch.text !== undefined) {
        for (const view of readDenimViews(db)) if (view.kind === 'workspace' && view.sources.some((source) => source.kind === 'journey' && source.journeyId === action.id)) {
          putView(db, { ...view, title: action.patch.text });
        }
      }
      return { ok: true, changed: true, nodeId: action.id };
    }
    case 'node.delete': {
      if (action.scope !== 'node' && action.scope !== 'subtree') throw new Error('Node delete scope must be node or subtree');
      const node = requireNode(db, action.id);
      const graph = getDenimGraph(db);
      const children = new Map<string, string[]>();
      for (const edge of graph.edges) if (edge.type === 'parent-child') children.set(edge.sourceId, [...(children.get(edge.sourceId) ?? []), edge.targetId]);
      const descendants = new Set<string>();
      const pending = [...(children.get(action.id) ?? [])];
      while (pending.length) {
        const next = pending.pop()!;
        if (descendants.has(next)) continue;
        descendants.add(next); pending.push(...(children.get(next) ?? []));
      }
      const removed = action.scope === 'subtree' ? new Set([action.id, ...descendants]) : new Set([action.id]);
      const visibleViews = new Set(readDenimViews(db).filter((view) => graphForView(db, view).nodes.some((item) => item.id === action.id)).map((view) => view.id));
      if (action.scope === 'subtree') deleteDenimNodeAndChildren(db, action.id); else deleteDenimNode(db, action.id);
      for (const view of readDenimViews(db)) {
        if (action.scope === 'subtree' && view.kind === 'workspace' && view.sources.some((source) => source.kind === 'journey' && removed.has(source.journeyId))) {
          removeDenimWorkspace(db, view.id);
          continue;
        }
        let includedNodeIds = view.includedNodeIds.filter((id) => !removed.has(id));
        if (action.scope === 'node' && visibleViews.has(view.id)) includedNodeIds = [...new Set([...includedNodeIds, ...descendants])];
        putView(db, { ...view, includedNodeIds,
          positions: Object.fromEntries(Object.entries(view.positions).filter(([id]) => !removed.has(id))),
          sequenceModes: Object.fromEntries(Object.entries(view.sequenceModes).filter(([id]) => !removed.has(id))),
        });
      }
      return { ok: true, changed: true, nodeId: node.id };
    }
    case 'edge.priority.set':
      if (!Number.isFinite(action.priority)) throw new Error('Edge priority must be finite');
      if (!getDenimGraph(db).edges.some((edge) => edge.id === action.edgeId)) throw new Error(`Edge not found: ${action.edgeId}`);
      updateDenimEdgePriority(db, action.edgeId, action.priority);
      return { ok: true, changed: true };
    case 'sequence.initialize':
      if (!Array.isArray(action.orderedChildIds) || action.orderedChildIds.some((id) => typeof id !== 'string')) throw new Error('orderedChildIds must be an array of IDs');
      requireNode(db, action.parentId); initializeDenimSequence(db, action.parentId, action.orderedChildIds);
      return { ok: true, changed: true };
    case 'sequence.clear':
      requireNode(db, action.parentId); clearDenimSequence(db, action.parentId);
      return { ok: true, changed: true };
    case 'view.sequenceMode.set': {
      if (action.mode !== 'rank' && action.mode !== 'priority') throw new Error('Sequence mode must be rank or priority');
      requireNode(db, action.parentId);
      const view = requireView(db, action.tabId);
      putView(db, { ...view, sequenceModes: { ...view.sequenceModes, [action.parentId]: action.mode } });
      return { ok: true, changed: true, tabId: view.id };
    }
    case 'view.includeNode': {
      const view = requireView(db, action.tabId); requireNode(db, action.nodeId);
      if (view.includedNodeIds.includes(action.nodeId)) return { ok: true, changed: false, tabId: view.id };
      putView(db, { ...view, includedNodeIds: [...view.includedNodeIds, action.nodeId] });
      return { ok: true, changed: true, tabId: view.id };
    }
    case 'view.node.move': {
      const view = requireView(db, action.tabId); requireNode(db, action.nodeId);
      if (![action.position?.x, action.position?.y].every(Number.isFinite)) throw new Error('Node position must contain finite x and y values');
      putView(db, { ...view, positions: { ...view.positions, [action.nodeId]: action.position } });
      return { ok: true, changed: true, tabId: view.id };
    }
    case 'view.openJourney': {
      const journey = requireNode(db, action.journeyId);
      if (journey.type !== 'Journey') throw new Error(`Node is not a Journey: ${action.journeyId}`);
      const tabId = action.tabId ?? newId('journey-tab');
      if (readDenimViews(db).some((view) => view.id === tabId)) throw new Error(`View already exists: ${tabId}`);
      putView(db, { version: 1, id: tabId, kind: 'workspace', title: journey.text,
        sources: [{ kind: 'journey', journeyId: journey.id }], includedNodeIds: [], positions: {}, sequenceModes: {} });
      return { ok: true, changed: true, tabId };
    }
    case 'view.close': {
      const view = requireView(db, action.tabId);
      if (view.kind === 'pinned') throw new Error('Pinned views cannot be closed');
      removeDenimWorkspace(db, view.id);
      return { ok: true, changed: true, tabId: view.id };
    }
    default: throw new Error(`Unknown Denim action: ${(action as { op: string }).op}`);
  }
}

/** Read the graph and persisted/pinned views agents need to understand a database. */
export function readDenimSnapshot(db: DenimDatabase) {
  return { graph: getDenimGraph(db), views: readDenimViews(db) };
}
