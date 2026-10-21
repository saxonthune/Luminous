import type { Database, SqlJsStatic } from 'sql.js';
import {
  DEFAULT_DENIM_NODE_TYPES,
  CAPABILITY_TYPE,
  INSTANCE_TYPE,
  JOURNEY_TYPE,
  USER_ACTION_TYPE,
} from './node-types.ts';
export { CAPABILITY_TYPE, DEFAULT_DENIM_NODE_TYPES, INSTANCE_TYPE, JOURNEY_TYPE, USER_ACTION_TYPE } from './node-types.ts';

export type DenimDatabase = Database;

export interface DenimNode {
  id: string;
  type: string;
  text: string;
  /** Stable importer identity; null for nodes without a managed source identity. */
  uniqueKey?: string | null;
}

export interface DenimNodeType {
  id: string;
  name: string;
  themeSlot: number;
}

export interface DenimSequenceContainer {
  id: string;
  ownerNodeId: string;
  data: Record<string, unknown>;
}

export interface DenimContainer {
  id: string;
  ownerNodeId: string;
  data: Record<string, unknown>;
}

export interface DenimEdge {
  id: string;
  type: string;
  sourceId: string;
  targetId: string;
  priority: number | null;
  /** Stable importer identity; null for edges without a managed source identity. */
  uniqueKey?: string | null;
}

export interface DenimGraph {
  nodes: DenimNode[];
  edges: DenimEdge[];
}

export const PARENT_CHILD = 'parent-child';
let sqlPromise: Promise<SqlJsStatic> | undefined;

async function sql(wasm?: string | Uint8Array): Promise<SqlJsStatic> {
  // A browser caller supplies Vite's resolved WASM URL. Node uses sql.js's
  // package-relative default, so the same module works in the CLI.
  if (!sqlPromise) {
    sqlPromise = import('sql.js').then(({ default: initSqlJs }) => initSqlJs(typeof wasm === 'string'
      ? { locateFile: () => wasm }
      : wasm ? { wasmBinary: wasm.slice().buffer as ArrayBuffer } : undefined));
  }
  return sqlPromise;
}

const SCHEMA = `
  PRAGMA foreign_keys = ON;
  CREATE TABLE IF NOT EXISTS denim_node_types (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL UNIQUE,
    theme_slot INTEGER NOT NULL DEFAULT 1
  );
  CREATE TABLE IF NOT EXISTS nodes (
    id TEXT PRIMARY KEY,
    type TEXT NOT NULL,
    text TEXT NOT NULL,
    unique_key TEXT NULL
  );
  CREATE TABLE IF NOT EXISTS edges (
    id TEXT PRIMARY KEY,
    type TEXT NOT NULL,
    source_id TEXT NOT NULL REFERENCES nodes(id) ON DELETE CASCADE,
    target_id TEXT NOT NULL REFERENCES nodes(id) ON DELETE CASCADE,
    priority REAL NULL,
    unique_key TEXT NULL
  );
  CREATE INDEX IF NOT EXISTS nodes_by_type ON nodes(type);
  CREATE INDEX IF NOT EXISTS edges_by_source ON edges(source_id);
  CREATE INDEX IF NOT EXISTS edges_by_target ON edges(target_id);
  CREATE INDEX IF NOT EXISTS edges_by_type ON edges(type);
  CREATE TABLE IF NOT EXISTS denim_boards (
    id TEXT PRIMARY KEY,
    payload_json TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS denim_sequence_containers (
    id TEXT PRIMARY KEY,
    owner_node_id TEXT NOT NULL UNIQUE REFERENCES nodes(id) ON DELETE CASCADE,
    data_json TEXT NOT NULL DEFAULT '{}'
  );
  CREATE TABLE IF NOT EXISTS denim_containers (
    id TEXT PRIMARY KEY,
    owner_node_id TEXT NOT NULL UNIQUE REFERENCES nodes(id) ON DELETE CASCADE,
    data_json TEXT NOT NULL DEFAULT '{}'
  );
`;

export async function openDenimDatabase(bytes?: Uint8Array, wasm?: string | Uint8Array): Promise<Database> {
  const SQL = await sql(wasm);
  const db = bytes ? new SQL.Database(bytes) : new SQL.Database();
  db.exec(SCHEMA);
  const schemaVersion = Number(db.exec('PRAGMA user_version')[0]?.values[0]?.[0] ?? 0);
  // Node kinds are stored as text values, so rename existing Resource nodes
  // when opening databases created by earlier Denim versions.
  db.run('UPDATE nodes SET type = ? WHERE type = ?', [INSTANCE_TYPE, 'Resource']);
  // Preserve existing graphs while adopting the more specific node type name.
  // Run once so future user-created types named "Action" remain user data.
  if (schemaVersion < 6) db.run('UPDATE nodes SET type = ? WHERE type = ?', [USER_ACTION_TYPE, 'Action']);
  const tables = rows<{ name: string }>(db, "SELECT name FROM sqlite_master WHERE type = 'table'");
  if (tables.some((table) => table.name === 'denim_workspaces')) {
    const legacy = rows<{ id: string; payload_json: string }>(db,
      'SELECT id, payload_json FROM denim_workspaces ORDER BY rowid');
    for (const record of legacy) {
      let payload: unknown;
      try { payload = JSON.parse(record.payload_json) as unknown; } catch { continue; }
      if (payload && typeof payload === 'object' && (payload as { kind?: unknown }).kind === 'workspace') {
        (payload as { kind: string }).kind = 'board';
      }
      db.run('INSERT OR IGNORE INTO denim_boards (id, payload_json) VALUES (?, ?)', [record.id, JSON.stringify(payload)]);
    }
    db.run('DROP TABLE denim_workspaces');
  }
  // Preserve pinned Board settings while moving its query source and key.
  for (const record of rows<{ id: string; payload_json: string }>(db,
    'SELECT id, payload_json FROM denim_boards ORDER BY rowid')) {
    try {
      const payload = JSON.parse(record.payload_json) as { id?: unknown; sources?: unknown };
      if (payload.id === 'pinned:resources') payload.id = 'pinned:instances';
      if (Array.isArray(payload.sources)) {
        for (const source of payload.sources) {
          if (source && typeof source === 'object' && (source as { kind?: unknown }).kind === 'resources') {
            (source as { kind: string }).kind = 'instances';
          }
        }
      }
      const id = record.id === 'pinned:resources' ? 'pinned:instances' : record.id;
      db.run('INSERT OR REPLACE INTO denim_boards (id, payload_json) VALUES (?, ?)', [id, JSON.stringify(payload)]);
      if (id !== record.id) db.run('DELETE FROM denim_boards WHERE id = ?', [record.id]);
    } catch { /* Ignore malformed legacy Board data. */ }
  }
  const edgeColumns = rows<{ name: string }>(db, 'PRAGMA table_info(edges)');
  if (!edgeColumns.some((column) => column.name === 'priority')) {
    db.run('ALTER TABLE edges ADD COLUMN priority INTEGER NULL');
  }
  const nodeColumns = rows<{ name: string }>(db, 'PRAGMA table_info(nodes)');
  if (!nodeColumns.some((column) => column.name === 'unique_key')) {
    db.run('ALTER TABLE nodes ADD COLUMN unique_key TEXT NULL');
  }
  if (!edgeColumns.some((column) => column.name === 'unique_key')) {
    db.run('ALTER TABLE edges ADD COLUMN unique_key TEXT NULL');
  }
  if (schemaVersion < 7) {
    for (const { type } of rows<{ type: string }>(db, 'SELECT DISTINCT type FROM nodes ORDER BY type')) {
      ensureDenimNodeType(db, type);
    }
  }
  // SQLite permits multiple NULLs in a unique index, so manual/unmanaged
  // records can remain unkeyed while importer-managed identities stay unique.
  db.run('CREATE UNIQUE INDEX IF NOT EXISTS nodes_by_unique_key ON nodes(unique_key)');
  db.run('CREATE UNIQUE INDEX IF NOT EXISTS edges_by_unique_key ON edges(unique_key)');
  if (schemaVersion < 9) migrateBoardContainers(db);
  db.run('PRAGMA user_version = 9');
  return db;
}

function migrateBoardContainers(db: Database): void {
  for (const { payload_json } of rows<{ payload_json: string }>(db, 'SELECT payload_json FROM denim_boards ORDER BY rowid')) {
    let payload: unknown;
    try { payload = JSON.parse(payload_json) as unknown; } catch { continue; }
    if (!payload || typeof payload !== 'object') continue;
    const containers = (payload as { containers?: unknown }).containers;
    if (!containers || typeof containers !== 'object' || Array.isArray(containers)) continue;
    for (const [ownerNodeId, bounds] of Object.entries(containers)) {
      if (!bounds || typeof bounds !== 'object' || typeof (bounds as { sequenceContainerId?: unknown }).sequenceContainerId === 'string') continue;
      if (!rows<{ id: string }>(db, 'SELECT id FROM nodes WHERE id = ?', [ownerNodeId]).length) continue;
      db.run('INSERT OR IGNORE INTO denim_containers (id, owner_node_id, data_json) VALUES (?, ?, ?)',
        [`container-${crypto.randomUUID()}`, ownerNodeId, '{}']);
    }
  }
}

export function exportDenimDatabase(db: Database): Uint8Array {
  return db.export();
}

/** A board payload stays opaque to SQLite so its shape can evolve. */
export interface DenimBoardRecord {
  id: string;
  payload: unknown;
}

export function listDenimBoards(db: Database): DenimBoardRecord[] {
  return rows<{ id: string; payload_json: string }>(db,
    'SELECT id, payload_json FROM denim_boards ORDER BY rowid')
    .flatMap(({ id, payload_json }) => {
      try { return [{ id, payload: JSON.parse(payload_json) as unknown }]; }
      catch { return []; }
    });
}

export function putDenimBoard(db: Database, record: DenimBoardRecord): void {
  db.run(`INSERT INTO denim_boards (id, payload_json) VALUES (?, ?)
    ON CONFLICT(id) DO UPDATE SET payload_json = excluded.payload_json`,
  [record.id, JSON.stringify(record.payload)]);
}

export function removeDenimBoard(db: Database, id: string): void {
  db.run('DELETE FROM denim_boards WHERE id = ?', [id]);
}

function decodeDenimContainer(row: { id: string; owner_node_id: string; data_json: string }): DenimContainer {
  let data: unknown;
  try { data = JSON.parse(row.data_json) as unknown; } catch { data = undefined; }
  return {
    id: row.id,
    ownerNodeId: row.owner_node_id,
    data: data && typeof data === 'object' && !Array.isArray(data) ? data as Record<string, unknown> : {},
  };
}

export function getDenimContainerByOwner(db: Database, ownerNodeId: string): DenimContainer | undefined {
  const row = rows<{ id: string; owner_node_id: string; data_json: string }>(db,
    'SELECT id, owner_node_id, data_json FROM denim_containers WHERE owner_node_id = ?', [ownerNodeId])[0];
  return row ? decodeDenimContainer(row) : undefined;
}

export function listDenimContainers(db: Database): DenimContainer[] {
  return rows<{ id: string; owner_node_id: string; data_json: string }>(db,
    'SELECT id, owner_node_id, data_json FROM denim_containers ORDER BY rowid').map(decodeDenimContainer);
}

export function createDenimContainerIfMissing(
  db: Database,
  input: { id: string; ownerNodeId: string; data?: Record<string, unknown> },
): { container: DenimContainer; changed: boolean } {
  const existing = getDenimContainerByOwner(db, input.ownerNodeId);
  if (existing) return { container: existing, changed: false };
  db.run('INSERT INTO denim_containers (id, owner_node_id, data_json) VALUES (?, ?, ?)',
    [input.id, input.ownerNodeId, JSON.stringify(input.data ?? {})]);
  return { container: getDenimContainerByOwner(db, input.ownerNodeId)!, changed: true };
}

function rows<T>(db: Database, statement: string, values: unknown[] = []): T[] {
  const result = db.exec(statement, values as (string | number | null | Uint8Array)[])[0];
  if (!result) return [];
  return result.values.map((row) => Object.fromEntries(result.columns.map((column, i) => [column, row[i]])) as T);
}

export function getDenimGraph(db: Database): DenimGraph {
  return {
    nodes: rows<{ id: string; type: string; text: string; unique_key: string | null }>(
      db, 'SELECT id, type, text, unique_key FROM nodes ORDER BY rowid',
    ).map(({ unique_key, ...node }) => ({ ...node, uniqueKey: unique_key })),
    edges: rows<{ id: string; type: string; source_id: string; target_id: string; priority: number | null; unique_key: string | null }>(
      db, 'SELECT id, type, source_id, target_id, priority, unique_key FROM edges ORDER BY rowid',
    ).map(({ source_id, target_id, unique_key, ...edge }) => ({ ...edge, uniqueKey: unique_key, sourceId: source_id, targetId: target_id })),
  };
}

export function getDenimNode(db: Database, id: string): DenimNode | undefined {
  const node = rows<{ id: string; type: string; text: string; unique_key: string | null }>(
    db, 'SELECT id, type, text, unique_key FROM nodes WHERE id = ?', [id],
  )[0];
  return node ? { id: node.id, type: node.type, text: node.text, uniqueKey: node.unique_key } : undefined;
}

export function getDenimNodeByUniqueKey(db: Database, uniqueKey: string): DenimNode | undefined {
  const node = rows<{ id: string; type: string; text: string; unique_key: string | null }>(
    db, 'SELECT id, type, text, unique_key FROM nodes WHERE unique_key = ?', [uniqueKey],
  )[0];
  return node ? { id: node.id, type: node.type, text: node.text, uniqueKey: node.unique_key } : undefined;
}

function decodeSequenceContainer(row: { id: string; owner_node_id: string; data_json: string }): DenimSequenceContainer {
  let data: unknown;
  try { data = JSON.parse(row.data_json) as unknown; } catch { data = undefined; }
  return {
    id: row.id,
    ownerNodeId: row.owner_node_id,
    data: data && typeof data === 'object' && !Array.isArray(data) ? data as Record<string, unknown> : {},
  };
}

export function getDenimSequenceContainerByOwner(db: Database, ownerNodeId: string): DenimSequenceContainer | undefined {
  const row = rows<{ id: string; owner_node_id: string; data_json: string }>(db,
    'SELECT id, owner_node_id, data_json FROM denim_sequence_containers WHERE owner_node_id = ?', [ownerNodeId])[0];
  return row ? decodeSequenceContainer(row) : undefined;
}

export function createDenimSequenceContainer(
  db: Database,
  input: { id: string; ownerNodeId: string; data?: Record<string, unknown> },
): DenimSequenceContainer {
  db.run('INSERT INTO denim_sequence_containers (id, owner_node_id, data_json) VALUES (?, ?, ?)',
    [input.id, input.ownerNodeId, JSON.stringify(input.data ?? {})]);
  return getDenimSequenceContainerByOwner(db, input.ownerNodeId)!;
}

export function hasDenimEdge(db: Database, type: string, sourceId: string, targetId: string): boolean {
  return rows<{ present: number }>(db,
    'SELECT 1 AS present FROM edges WHERE type = ? AND source_id = ? AND target_id = ? LIMIT 1',
    [type, sourceId, targetId]).length > 0;
}

export function listDenimNodeIds(db: Database): string[] {
  return rows<{ id: string }>(db, 'SELECT id FROM nodes ORDER BY rowid').map(({ id }) => id);
}

function ensureDenimNodeType(db: Database, name: string): DenimNodeType {
  const existing = rows<DenimNodeType>(db,
    'SELECT id, name, theme_slot AS themeSlot FROM denim_node_types WHERE name = ?', [name])[0];
  if (existing) return existing;
  const id = `node-type-${crypto.randomUUID()}`;
  const themeSlot = DEFAULT_DENIM_NODE_TYPES.find((type) => type.name === name)?.themeSlot ?? 1;
  db.run('INSERT INTO denim_node_types (id, name, theme_slot) VALUES (?, ?, ?)', [id, name, themeSlot]);
  return { id, name, themeSlot };
}

export function seedDefaultDenimNodeTypes(db: Database): void {
  for (const type of DEFAULT_DENIM_NODE_TYPES) ensureDenimNodeType(db, type.name);
}

export function listDenimNodeTypes(db: Database): DenimNodeType[] {
  return rows(db, 'SELECT id, name, theme_slot AS themeSlot FROM denim_node_types ORDER BY rowid');
}

export function createDenimNodeType(db: Database, name: string): { type: DenimNodeType; changed: boolean } {
  const normalized = name.trim();
  if (!normalized) throw new Error('Node type name must be nonempty text');
  const existing = rows<DenimNodeType>(db,
    'SELECT id, name, theme_slot AS themeSlot FROM denim_node_types WHERE name = ?', [normalized])[0];
  if (existing) return { type: existing, changed: false };
  return { type: ensureDenimNodeType(db, normalized), changed: true };
}

export function setDenimNodeTypeColor(db: Database, id: string, themeSlot: number): boolean {
  if (!Number.isInteger(themeSlot) || themeSlot < 1 || themeSlot > 8) throw new Error('Theme slot must be an integer from 1 to 8');
  const previous = rows<DenimNodeType>(db, 'SELECT id, name, theme_slot AS themeSlot FROM denim_node_types WHERE id = ?', [id])[0];
  if (!previous) throw new Error(`Node type not found: ${id}`);
  if (previous.themeSlot === themeSlot) return false;
  db.run('UPDATE denim_node_types SET theme_slot = ? WHERE id = ?', [themeSlot, id]);
  return true;
}

export function renameDenimNodeType(db: Database, id: string, name: string): { type: DenimNodeType; changed: boolean } {
  const normalized = name.trim();
  if (!normalized) throw new Error('Node type name must be nonempty text');
  const previous = rows<DenimNodeType>(db,
    'SELECT id, name, theme_slot AS themeSlot FROM denim_node_types WHERE id = ?', [id])[0];
  if (!previous) throw new Error(`Node type not found: ${id}`);
  if (previous.name === normalized) return { type: previous, changed: false };
  const conflict = rows<{ id: string }>(db, 'SELECT id FROM denim_node_types WHERE name = ?', [normalized])[0];
  if (conflict) throw new Error(`Node type already exists: ${normalized}`);
  runDenimTransaction(db, () => {
    db.run('UPDATE denim_node_types SET name = ? WHERE id = ?', [normalized, id]);
    db.run('UPDATE nodes SET type = ? WHERE type = ?', [normalized, previous.name]);
  });
  return { type: { ...previous, name: normalized }, changed: true };
}

export function listDenimDescendantIds(db: Database, nodeId: string): string[] {
  return rows<{ id: string }>(db, `
    WITH RECURSIVE descendants(id) AS (
      SELECT target_id FROM edges WHERE source_id = ? AND type = ?
      UNION
      SELECT edges.target_id FROM edges
      JOIN descendants ON edges.source_id = descendants.id
      WHERE edges.type = ?
    ) SELECT id FROM descendants
  `, [nodeId, PARENT_CHILD, PARENT_CHILD]).map(({ id }) => id);
}

export function getDenimEdge(db: Database, id: string): DenimEdge | undefined {
  const edge = rows<{ id: string; type: string; source_id: string; target_id: string; priority: number | null; unique_key: string | null }>(
    db, 'SELECT id, type, source_id, target_id, priority, unique_key FROM edges WHERE id = ?', [id],
  )[0];
  return edge ? { id: edge.id, type: edge.type, sourceId: edge.source_id, targetId: edge.target_id, priority: edge.priority, uniqueKey: edge.unique_key } : undefined;
}

export function getDenimEdgeByUniqueKey(db: Database, uniqueKey: string): DenimEdge | undefined {
  const edge = rows<{ id: string; type: string; source_id: string; target_id: string; priority: number | null; unique_key: string | null }>(
    db, 'SELECT id, type, source_id, target_id, priority, unique_key FROM edges WHERE unique_key = ?', [uniqueKey],
  )[0];
  return edge ? { id: edge.id, type: edge.type, sourceId: edge.source_id, targetId: edge.target_id, priority: edge.priority, uniqueKey: edge.unique_key } : undefined;
}

export function getDenimContainment(db: Database, nodeId: string): DenimEdge | undefined {
  const edge = rows<{ id: string; type: string; source_id: string; target_id: string; priority: number | null; unique_key: string | null }>(
    db, "SELECT id, type, source_id, target_id, priority, unique_key FROM edges WHERE type = 'contains' AND target_id = ? LIMIT 1", [nodeId],
  )[0];
  return edge ? { id: edge.id, type: edge.type, sourceId: edge.source_id, targetId: edge.target_id, priority: edge.priority, uniqueKey: edge.unique_key } : undefined;
}

export function listDenimContainerMembers(db: Database, ownerId: string): DenimNode[] {
  return rows<DenimNode>(db, `SELECT n.id, n.type, n.text, n.unique_key AS uniqueKey FROM nodes n
    JOIN edges e ON e.target_id = n.id
    WHERE e.type = 'contains' AND e.source_id = ? ORDER BY n.rowid`, [ownerId]);
}

export function listJourneys(db: Database): DenimNode[] {
  return rows(db, 'SELECT id, type, text, unique_key AS uniqueKey FROM nodes WHERE type = ? ORDER BY rowid', [JOURNEY_TYPE]);
}

export function getJourneyGraph(db: Database, journeyId: string): DenimGraph {
  const nodes = rows<DenimNode>(db, `
    WITH RECURSIVE descendants(id) AS (
      SELECT ?
      UNION
      SELECT e.target_id FROM edges e JOIN descendants d ON e.source_id = d.id
      WHERE e.type = ?
    )
    SELECT n.id, n.type, n.text, n.unique_key AS uniqueKey FROM nodes n JOIN descendants d ON d.id = n.id ORDER BY n.rowid
  `, [journeyId, PARENT_CHILD]);
  const ids = nodes.map((node) => node.id);
  if (ids.length === 0) return { nodes, edges: [] };
  const placeholders = ids.map(() => '?').join(',');
  const edges = rows<{ id: string; type: string; source_id: string; target_id: string; priority: number | null; unique_key: string | null }>(db,
    `SELECT id, type, source_id, target_id, priority, unique_key FROM edges WHERE source_id IN (${placeholders}) AND target_id IN (${placeholders}) ORDER BY rowid`,
    [...ids, ...ids],
  ).map(({ source_id, target_id, unique_key, ...edge }) => ({ ...edge, uniqueKey: unique_key, sourceId: source_id, targetId: target_id }));
  return { nodes, edges };
}

export function listCapabilities(db: Database): DenimNode[] {
  return rows(db, 'SELECT id, type, text, unique_key AS uniqueKey FROM nodes WHERE type = ? ORDER BY rowid', [CAPABILITY_TYPE]);
}

export function listTopLevelInstances(db: Database): DenimNode[] {
  return rows(db, `
    SELECT n.id, n.type, n.text, n.unique_key AS uniqueKey FROM nodes n
    WHERE n.type = ? AND NOT EXISTS (
      SELECT 1 FROM edges e JOIN nodes parent ON parent.id = e.source_id
      WHERE e.target_id = n.id AND e.type = ? AND parent.type = ?
    ) ORDER BY n.rowid
  `, [INSTANCE_TYPE, PARENT_CHILD, INSTANCE_TYPE]);
}

/** Starter graph hydrated into a newly created Denim project. */
export const STARTER_DENIM_GRAPH: DenimGraph = {
  nodes: [
    { id: 'a-user-builds-a-journey', type: JOURNEY_TYPE, text: 'A user builds a journey' },
    { id: 'user-creates-a-new-journey', type: USER_ACTION_TYPE, text: 'User creates a new journey' },
  ],
  edges: [{
    id: 'journey-has-action-user-creates-a-new-journey', type: PARENT_CHILD,
    sourceId: 'a-user-builds-a-journey', targetId: 'user-creates-a-new-journey', priority: null,
  }],
};

/** Hydrate an initialized database with the starter project graph. */
export function hydrateDenimDatabase(db: Database, graph: DenimGraph = STARTER_DENIM_GRAPH): void {
  transaction(db, () => {
    seedDefaultDenimNodeTypes(db);
    for (const node of graph.nodes) addDenimNode(db, node);
    for (const edge of graph.edges) addDenimEdge(db, edge);
  });
}

/** CLI compatibility name: seed an already initialized database. */
export const seedDenimDatabase = hydrateDenimDatabase;

export function addDenimNode(db: Database, node: DenimNode): void {
  ensureDenimNodeType(db, node.type);
  db.run('INSERT INTO nodes (id, type, text, unique_key) VALUES (?, ?, ?, ?)', [node.id, node.type, node.text, node.uniqueKey ?? null]);
}

export function updateDenimNode(db: Database, id: string, patch: Partial<Pick<DenimNode, 'type' | 'text' | 'uniqueKey'>>): void {
  if (patch.type !== undefined) {
    ensureDenimNodeType(db, patch.type);
    db.run('UPDATE nodes SET type = ? WHERE id = ?', [patch.type, id]);
  }
  if (patch.text !== undefined) db.run('UPDATE nodes SET text = ? WHERE id = ?', [patch.text, id]);
  if (patch.uniqueKey !== undefined) db.run('UPDATE nodes SET unique_key = ? WHERE id = ?', [patch.uniqueKey, id]);
}

export function upsertDenimNode(
  db: Database,
  node: { id?: string; type: string; text: string; uniqueKey: string },
): { id: string; changed: boolean } {
  const existing = getDenimNodeByUniqueKey(db, node.uniqueKey)
    ?? (node.id ? getDenimNode(db, node.id) : undefined);
  if (!existing) {
    if (!node.id) throw new Error('A Node ID is required when creating a keyed Node');
    addDenimNode(db, { ...node, id: node.id });
    return { id: node.id, changed: true };
  }
  if (existing.uniqueKey && existing.uniqueKey !== node.uniqueKey) {
    throw new Error(`Node ID ${existing.id} already has a different unique key`);
  }
  const changed = existing.type !== node.type || existing.text !== node.text || existing.uniqueKey !== node.uniqueKey;
  if (changed) updateDenimNode(db, existing.id, { type: node.type, text: node.text, uniqueKey: node.uniqueKey });
  return { id: existing.id, changed };
}

/** Delete a node and all of its incoming and outgoing edges. */
export function deleteDenimNode(db: Database, id: string): void {
  db.run('DELETE FROM edges WHERE source_id = ? OR target_id = ?', [id, id]);
  db.run('DELETE FROM nodes WHERE id = ?', [id]);
}

/** Delete one edge without changing either endpoint node. */
export function deleteDenimEdge(db: Database, id: string): void {
  db.run('DELETE FROM edges WHERE id = ?', [id]);
}

/** Delete a node and every node reachable through its parent-child edges. */
export function deleteDenimNodeAndChildren(db: Database, id: string): void {
  transaction(db, () => {
    const descendants = rows<{ id: string }>(db, `
      WITH RECURSIVE descendants(id) AS (
        SELECT id FROM nodes WHERE id = ?
        UNION
        SELECT edges.target_id FROM edges
        JOIN descendants ON edges.source_id = descendants.id
        WHERE edges.type = ?
      ) SELECT id FROM descendants
    `, [id, PARENT_CHILD]).map((row) => row.id);
    for (const descendantId of descendants) deleteDenimNode(db, descendantId);
  });
}

export function updateDenimEdgePriority(db: Database, edgeId: string, priority: number): void {
  if (!Number.isFinite(priority)) throw new Error('Edge priority must be finite');
  db.run('UPDATE edges SET priority = ? WHERE id = ?', [priority, edgeId]);
}

export function addDenimEdge(db: Database, edge: Omit<DenimEdge, 'priority'> & { priority?: number | null }): void {
  assertDenimEdgeAcyclic(db, edge.type, edge.sourceId, edge.targetId);
  const priority = edge.priority ?? (edge.type === PARENT_CHILD ? nextChildPriority(db, edge.sourceId) : null);
  db.run('INSERT INTO edges (id, type, source_id, target_id, priority, unique_key) VALUES (?, ?, ?, ?, ?, ?)',
    [edge.id, edge.type, edge.sourceId, edge.targetId, priority, edge.uniqueKey ?? null]);
}

export function upsertDenimEdge(
  db: Database,
  edge: { id?: string; type: string; sourceId: string; targetId: string; uniqueKey: string; priority?: number | null },
): { id: string; changed: boolean } {
  const existingByKey = getDenimEdgeByUniqueKey(db, edge.uniqueKey);
  const existingById = edge.id ? getDenimEdge(db, edge.id) : undefined;
  const existingByRelationship = rows<{ id: string; unique_key: string | null }>(db,
    'SELECT id, unique_key FROM edges WHERE type = ? AND source_id = ? AND target_id = ? LIMIT 1',
    [edge.type, edge.sourceId, edge.targetId])[0];
  const existing = existingByKey ?? existingById
    ?? (existingByRelationship?.unique_key === null ? getDenimEdge(db, existingByRelationship.id) : undefined);
  if (existingByRelationship && existing && existingByRelationship.id !== existing.id) {
    throw new Error(`Another Edge already connects ${edge.sourceId} to ${edge.targetId}`);
  }
  if (!existing && existingByRelationship) {
    throw new Error(`Another keyed Edge already connects ${edge.sourceId} to ${edge.targetId}`);
  }
  if (!existing) {
    if (!edge.id) throw new Error('An Edge ID is required when creating a keyed Edge');
    addDenimEdge(db, { ...edge, id: edge.id });
    return { id: edge.id, changed: true };
  }
  if (existing.uniqueKey && existing.uniqueKey !== edge.uniqueKey) {
    throw new Error(`Edge ID ${existing.id} already has a different unique key`);
  }
  assertDenimEdgeAcyclic(db, edge.type, edge.sourceId, edge.targetId, existing.id);
  const priority = edge.priority === undefined ? existing.priority : edge.priority;
  const changed = existing.type !== edge.type || existing.sourceId !== edge.sourceId
    || existing.targetId !== edge.targetId || existing.uniqueKey !== edge.uniqueKey || existing.priority !== priority;
  if (changed) {
    db.run('UPDATE edges SET type = ?, source_id = ?, target_id = ?, priority = ?, unique_key = ? WHERE id = ?',
      [edge.type, edge.sourceId, edge.targetId, priority, edge.uniqueKey, existing.id]);
  }
  return { id: existing.id, changed };
}

function assertDenimEdgeAcyclic(db: Database, type: string, sourceId: string, targetId: string, excludingEdgeId?: string): void {
  if (type !== PARENT_CHILD) return;
  if (sourceId === targetId) throw new Error('A node cannot be its own parent');
  const cycle = db.exec(`
    WITH RECURSIVE descendants(id) AS (
      SELECT ? UNION SELECT e.target_id FROM edges e JOIN descendants d ON e.source_id = d.id
      WHERE e.type = ? AND (? IS NULL OR e.id != ?)
    ) SELECT 1 FROM descendants WHERE id = ? LIMIT 1
  `, [targetId, PARENT_CHILD, excludingEdgeId ?? null, excludingEdgeId ?? null, sourceId]);
  if (cycle.length > 0) throw new Error('This parent-child edge would create a cycle');
}

/** Move one Node's parent-child Edge and persist its position among the new parent's children. */
export function moveDenimChild(
  db: Database,
  nodeId: string,
  fromParentId: string,
  parentId: string,
  placement: { beforeNodeId?: string; afterNodeId?: string } = {},
): boolean {
  if (placement.beforeNodeId && placement.afterNodeId) throw new Error('Choose either beforeNodeId or afterNodeId');
  if (!getDenimNode(db, nodeId)) throw new Error(`Node not found: ${nodeId}`);
  if (!getDenimNode(db, parentId)) throw new Error(`Parent Node not found: ${parentId}`);
  let changed = false;
  transaction(db, () => {
    const parentEdge = rows<{ id: string }>(db,
      'SELECT id FROM edges WHERE type = ? AND source_id = ? AND target_id = ? ORDER BY rowid LIMIT 1',
      [PARENT_CHILD, fromParentId, nodeId])[0];
    if (!parentEdge) throw new Error(`Sequence Node is not a child of ${fromParentId}: ${nodeId}`);
    const oldParentId = fromParentId;
    if (oldParentId !== parentId && hasDenimEdge(db, PARENT_CHILD, parentId, nodeId)) {
      throw new Error(`Node is already a child of ${parentId}: ${nodeId}`);
    }
    const oldOrder = rows<{ target_id: string }>(db,
      'SELECT target_id FROM edges WHERE type = ? AND source_id = ? ORDER BY CASE WHEN priority IS NULL THEN 1 ELSE 0 END, priority, rowid',
      [PARENT_CHILD, oldParentId]).map(({ target_id }) => target_id);
    const newOrder = parentId === oldParentId ? oldOrder.filter((id) => id !== nodeId)
      : rows<{ target_id: string }>(db,
        'SELECT target_id FROM edges WHERE type = ? AND source_id = ? ORDER BY CASE WHEN priority IS NULL THEN 1 ELSE 0 END, priority, rowid',
        [PARENT_CHILD, parentId]).map(({ target_id }) => target_id).filter((id) => id !== nodeId);

    const beforeNodeId = placement.beforeNodeId;
    const afterNodeId = placement.afterNodeId;
    if (beforeNodeId && !newOrder.includes(beforeNodeId)) throw new Error(`Before Node is not a child of ${parentId}: ${beforeNodeId}`);
    if (afterNodeId && !newOrder.includes(afterNodeId)) throw new Error(`After Node is not a child of ${parentId}: ${afterNodeId}`);
    const insertAt = beforeNodeId ? newOrder.indexOf(beforeNodeId)
      : afterNodeId ? newOrder.indexOf(afterNodeId) + 1 : newOrder.length;
    newOrder.splice(insertAt, 0, nodeId);
    const nextOldOrder = oldParentId === parentId ? newOrder : oldOrder.filter((id) => id !== nodeId);
    changed = oldParentId !== parentId || oldOrder.some((id, index) => id !== newOrder[index]);
    if (!changed) return;

    assertDenimEdgeAcyclic(db, PARENT_CHILD, parentId, nodeId, parentEdge.id);
    db.run('UPDATE edges SET source_id = ? WHERE id = ?', [parentId, parentEdge.id]);
    const assignOrder = (ownerId: string, orderedIds: string[]) => {
      const children = rows<{ id: string; target_id: string }>(db,
        'SELECT id, target_id FROM edges WHERE type = ? AND source_id = ?', [PARENT_CHILD, ownerId]);
      const edgeByChild = new Map(children.map((edge) => [edge.target_id, edge.id]));
      orderedIds.forEach((childId, index) => {
        const edgeId = edgeByChild.get(childId);
        if (edgeId) db.run('UPDATE edges SET priority = ? WHERE id = ?', [index + 1, edgeId]);
      });
    };
    assignOrder(parentId, newOrder);
    if (oldParentId !== parentId) assignOrder(oldParentId, nextOldOrder);
  });
  return changed;
}

/** Insert a new child at a sibling index, preserving IDs and contiguous priorities. */
export function insertDenimSequenceChild(db: Database, parentId: string, node: DenimNode, edgeId: string, index: number): void {
  transaction(db, () => {
    const children = rows<{ id: string }>(db,
      'SELECT id FROM edges WHERE type = ? AND source_id = ? ORDER BY CASE WHEN priority IS NULL THEN 1 ELSE 0 END, priority, target_id',
      [PARENT_CHILD, parentId]);
    addDenimNode(db, node);
    addDenimEdge(db, { id: edgeId, type: PARENT_CHILD, sourceId: parentId, targetId: node.id });
    children.splice(index, 0, { id: edgeId });
    children.forEach((edge, offset) => updateDenimEdgePriority(db, edge.id, offset + 1));
  });
}

/** Create a sibling after an existing child, copying that Node's type and preserving its indentation. */
export function createDenimChildAfter(
  db: Database,
  parentId: string,
  afterNodeId: string,
  id: string,
  edgeId: string,
  text = '',
): DenimNode {
  const afterNode = getDenimNode(db, afterNodeId);
  if (!afterNode) throw new Error(`Node not found: ${afterNodeId}`);
  if (!hasDenimEdge(db, PARENT_CHILD, parentId, afterNodeId)) {
    throw new Error(`Node is not a child of ${parentId}: ${afterNodeId}`);
  }
  if (getDenimNode(db, id)) throw new Error(`Node already exists: ${id}`);
  transaction(db, () => {
    const orderedIds = rows<{ target_id: string }>(db,
      'SELECT target_id FROM edges WHERE type = ? AND source_id = ? ORDER BY CASE WHEN priority IS NULL THEN 1 ELSE 0 END, priority, rowid',
      [PARENT_CHILD, parentId]).map(({ target_id }) => target_id);
    const insertAt = orderedIds.indexOf(afterNodeId) + 1;
    if (insertAt === 0) throw new Error(`Node is not a child of ${parentId}: ${afterNodeId}`);
    addDenimNode(db, { id, type: afterNode.type, text });
    db.run('INSERT INTO edges (id, type, source_id, target_id, priority, unique_key) VALUES (?, ?, ?, ?, NULL, NULL)',
      [edgeId, PARENT_CHILD, parentId, id]);
    orderedIds.splice(insertAt, 0, id);
    const children = rows<{ id: string; target_id: string }>(db,
      'SELECT id, target_id FROM edges WHERE type = ? AND source_id = ?', [PARENT_CHILD, parentId]);
    const edgeByChild = new Map(children.map((edge) => [edge.target_id, edge.id]));
    orderedIds.forEach((childId, index) => {
      const childEdgeId = edgeByChild.get(childId);
      if (childEdgeId) db.run('UPDATE edges SET priority = ? WHERE id = ?', [index + 1, childEdgeId]);
    });
  });
  return getDenimNode(db, id)!;
}

function nextChildPriority(db: Database, parentId: string): number | null {
  const values = rows<{ total: number; prioritized: number; max_priority: number | null }>(db, `
    SELECT COUNT(*) AS total, COUNT(priority) AS prioritized, MAX(priority) AS max_priority FROM edges
    WHERE type = ? AND source_id = ?
  `, [PARENT_CHILD, parentId])[0];
  if (!values || values.prioritized === 0) return null;
  if (values.prioritized !== values.total) {
    throw new Error('Child sequence is incomplete; initialize or clear it before adding a child');
  }
  return (values.max_priority ?? 0) + 1;
}

/** Assign sequence priorities in the caller's chosen order for one parent's child edges. */
export function initializeDenimSequence(db: Database, parentId: string, orderedChildIds: string[]): void {
  transaction(db, () => {
    const edges = rows<{ id: string; target_id: string }>(db,
      'SELECT id, target_id FROM edges WHERE type = ? AND source_id = ?', [PARENT_CHILD, parentId]);
    const expected = edges.map((edge) => edge.target_id).sort();
    const supplied = [...orderedChildIds].sort();
    if (new Set(supplied).size !== supplied.length
      || expected.length !== supplied.length
      || expected.some((id, index) => id !== supplied[index])) {
      throw new Error('Sequence initialization must include each child exactly once');
    }
    const edgeByChild = new Map(edges.map((edge) => [edge.target_id, edge.id]));
    orderedChildIds.forEach((childId, index) => {
      db.run('UPDATE edges SET priority = ? WHERE id = ?', [index + 1, edgeByChild.get(childId)!]);
    });
  });
}

/** Clear the priority values for every child edge of one parent. */
export function clearDenimSequence(db: Database, parentId: string): void {
  db.run('UPDATE edges SET priority = NULL WHERE type = ? AND source_id = ?', [PARENT_CHILD, parentId]);
}

export function runDenimTransaction(db: Database, run: () => void): void {
  db.run('BEGIN');
  try {
    run();
    db.run('COMMIT');
  } catch (error) {
    db.run('ROLLBACK');
    throw error;
  }
}

const transaction = runDenimTransaction;

export function createDenimChild(db: Database, parentId: string, node: DenimNode, edgeId: string): void {
  transaction(db, () => {
    addDenimNode(db, node);
    addDenimEdge(db, {
      id: edgeId, type: PARENT_CHILD, sourceId: parentId, targetId: node.id,
      priority: nextChildPriority(db, parentId),
    });
  });
}

export function createDenimContainedNode(db: Database, ownerId: string, node: DenimNode, edgeId: string): void {
  transaction(db, () => {
    addDenimNode(db, node);
    addDenimEdge(db, { id: edgeId, type: 'contains', sourceId: ownerId, targetId: node.id, priority: null });
  });
}

/** Replace a node's current containment edge with an edge to the requested owner. */
export function replaceDenimContainment(db: Database, ownerId: string, nodeId: string, edgeId: string): void {
  transaction(db, () => {
    const existing = getDenimContainment(db, nodeId);
    if (existing?.sourceId === ownerId) return;
    if (existing) deleteDenimEdge(db, existing.id);
    addDenimEdge(db, { id: edgeId, type: 'contains', sourceId: ownerId, targetId: nodeId, priority: null });
  });
}

export function connectDenimChild(db: Database, parentId: string, childId: string, edgeId: string): void {
  transaction(db, () => {
    addDenimEdge(db, {
      id: edgeId, type: PARENT_CHILD, sourceId: parentId, targetId: childId,
      priority: nextChildPriority(db, parentId),
    });
  });
}

export function removeDenimEdge(db: Database, id: string): void {
  db.run('DELETE FROM edges WHERE id = ?', [id]);
}

export function removeDenimNode(db: Database, id: string): void {
  db.run('DELETE FROM nodes WHERE id = ?', [id]);
}
