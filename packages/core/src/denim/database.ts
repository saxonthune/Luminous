import type { Database, SqlJsStatic } from 'sql.js';

export type DenimDatabase = Database;

export interface DenimNode {
  id: string;
  type: string;
  text: string;
}

export interface DenimEdge {
  id: string;
  type: string;
  sourceId: string;
  targetId: string;
}

export interface DenimGraph {
  nodes: DenimNode[];
  edges: DenimEdge[];
}

export const PARENT_CHILD = 'parent-child';
export const JOURNEY_TYPE = 'Journey';
export const RESOURCE_TYPE = 'Resource';
export const CAPABILITY_TYPE = 'Capability';

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
  CREATE TABLE IF NOT EXISTS nodes (
    id TEXT PRIMARY KEY,
    type TEXT NOT NULL,
    text TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS edges (
    id TEXT PRIMARY KEY,
    type TEXT NOT NULL,
    source_id TEXT NOT NULL REFERENCES nodes(id) ON DELETE CASCADE,
    target_id TEXT NOT NULL REFERENCES nodes(id) ON DELETE CASCADE
  );
  CREATE INDEX IF NOT EXISTS nodes_by_type ON nodes(type);
  CREATE INDEX IF NOT EXISTS edges_by_source ON edges(source_id);
  CREATE INDEX IF NOT EXISTS edges_by_target ON edges(target_id);
  CREATE INDEX IF NOT EXISTS edges_by_type ON edges(type);
  CREATE TABLE IF NOT EXISTS denim_workspaces (
    id TEXT PRIMARY KEY,
    payload_json TEXT NOT NULL
  );
  PRAGMA user_version = 2;
`;

export async function openDenimDatabase(bytes?: Uint8Array, wasm?: string | Uint8Array): Promise<Database> {
  const SQL = await sql(wasm);
  const db = bytes ? new SQL.Database(bytes) : new SQL.Database();
  db.exec(SCHEMA);
  return db;
}

export function exportDenimDatabase(db: Database): Uint8Array {
  return db.export();
}

/** A workspace payload stays opaque to SQLite so its document shape can evolve. */
export interface DenimWorkspaceRecord {
  id: string;
  payload: unknown;
}

export function listDenimWorkspaces(db: Database): DenimWorkspaceRecord[] {
  return rows<{ id: string; payload_json: string }>(db,
    'SELECT id, payload_json FROM denim_workspaces ORDER BY rowid')
    .flatMap(({ id, payload_json }) => {
      try { return [{ id, payload: JSON.parse(payload_json) as unknown }]; }
      catch { return []; }
    });
}

export function putDenimWorkspace(db: Database, record: DenimWorkspaceRecord): void {
  db.run(`INSERT INTO denim_workspaces (id, payload_json) VALUES (?, ?)
    ON CONFLICT(id) DO UPDATE SET payload_json = excluded.payload_json`,
  [record.id, JSON.stringify(record.payload)]);
}

export function removeDenimWorkspace(db: Database, id: string): void {
  db.run('DELETE FROM denim_workspaces WHERE id = ?', [id]);
}

function rows<T>(db: Database, statement: string, values: unknown[] = []): T[] {
  const result = db.exec(statement, values as (string | number | null | Uint8Array)[])[0];
  if (!result) return [];
  return result.values.map((row) => Object.fromEntries(result.columns.map((column, i) => [column, row[i]])) as T);
}

export function getDenimGraph(db: Database): DenimGraph {
  return {
    nodes: rows<DenimNode>(db, 'SELECT id, type, text FROM nodes ORDER BY rowid'),
    edges: rows<{ id: string; type: string; source_id: string; target_id: string }>(
      db, 'SELECT id, type, source_id, target_id FROM edges ORDER BY rowid',
    ).map(({ source_id, target_id, ...edge }) => ({ ...edge, sourceId: source_id, targetId: target_id })),
  };
}

export function listJourneys(db: Database): DenimNode[] {
  return rows(db, 'SELECT id, type, text FROM nodes WHERE type = ? ORDER BY rowid', [JOURNEY_TYPE]);
}

export function getJourneyGraph(db: Database, journeyId: string): DenimGraph {
  const nodes = rows<DenimNode>(db, `
    WITH RECURSIVE descendants(id) AS (
      SELECT ?
      UNION
      SELECT e.target_id FROM edges e JOIN descendants d ON e.source_id = d.id
      WHERE e.type = ?
    )
    SELECT n.id, n.type, n.text FROM nodes n JOIN descendants d ON d.id = n.id ORDER BY n.rowid
  `, [journeyId, PARENT_CHILD]);
  const ids = nodes.map((node) => node.id);
  if (ids.length === 0) return { nodes, edges: [] };
  const placeholders = ids.map(() => '?').join(',');
  const edges = rows<{ id: string; type: string; source_id: string; target_id: string }>(db,
    `SELECT id, type, source_id, target_id FROM edges WHERE source_id IN (${placeholders}) AND target_id IN (${placeholders}) ORDER BY rowid`,
    [...ids, ...ids],
  ).map(({ source_id, target_id, ...edge }) => ({ ...edge, sourceId: source_id, targetId: target_id }));
  return { nodes, edges };
}

export function listCapabilities(db: Database): DenimNode[] {
  return rows(db, 'SELECT id, type, text FROM nodes WHERE type = ? ORDER BY rowid', [CAPABILITY_TYPE]);
}

export function listTopLevelResources(db: Database): DenimNode[] {
  return rows(db, `
    SELECT n.id, n.type, n.text FROM nodes n
    WHERE n.type = ? AND NOT EXISTS (
      SELECT 1 FROM edges e JOIN nodes parent ON parent.id = e.source_id
      WHERE e.target_id = n.id AND e.type = ? AND parent.type = ?
    ) ORDER BY n.rowid
  `, [RESOURCE_TYPE, PARENT_CHILD, RESOURCE_TYPE]);
}

/** Populate a new Denim database with the starter Journey and Action. */
export function seedDenimDatabase(db: Database): void {
  transaction(db, () => {
    addDenimNode(db, {
      id: 'a-user-builds-a-journey',
      type: JOURNEY_TYPE,
      text: 'A user builds a journey',
    });
    addDenimNode(db, {
      id: 'user-creates-a-new-journey',
      type: 'Action',
      text: 'User creates a new journey',
    });
    addDenimEdge(db, {
      id: 'journey-has-action-user-creates-a-new-journey',
      type: PARENT_CHILD,
      sourceId: 'a-user-builds-a-journey',
      targetId: 'user-creates-a-new-journey',
    });
  });
}

export function addDenimNode(db: Database, node: DenimNode): void {
  db.run('INSERT INTO nodes (id, type, text) VALUES (?, ?, ?)', [node.id, node.type, node.text]);
}

export function updateDenimNode(db: Database, id: string, patch: Partial<Pick<DenimNode, 'type' | 'text'>>): void {
  if (patch.type !== undefined) db.run('UPDATE nodes SET type = ? WHERE id = ?', [patch.type, id]);
  if (patch.text !== undefined) db.run('UPDATE nodes SET text = ? WHERE id = ?', [patch.text, id]);
}

export function addDenimEdge(db: Database, edge: DenimEdge): void {
  if (edge.type === PARENT_CHILD) {
    if (edge.sourceId === edge.targetId) throw new Error('A node cannot be its own parent');
    const cycle = db.exec(`
      WITH RECURSIVE descendants(id) AS (
        SELECT ? UNION SELECT e.target_id FROM edges e JOIN descendants d ON e.source_id = d.id WHERE e.type = ?
      ) SELECT 1 FROM descendants WHERE id = ? LIMIT 1
    `, [edge.targetId, PARENT_CHILD, edge.sourceId]);
    if (cycle.length > 0) throw new Error('This parent-child edge would create a cycle');
  }
  db.run('INSERT INTO edges (id, type, source_id, target_id) VALUES (?, ?, ?, ?)',
    [edge.id, edge.type, edge.sourceId, edge.targetId]);
}

function transaction(db: Database, run: () => void): void {
  db.run('BEGIN');
  try {
    run();
    db.run('COMMIT');
  } catch (error) {
    db.run('ROLLBACK');
    throw error;
  }
}

export function createDenimChild(db: Database, parentId: string, node: DenimNode, edgeId: string): void {
  transaction(db, () => {
    addDenimNode(db, node);
    addDenimEdge(db, { id: edgeId, type: PARENT_CHILD, sourceId: parentId, targetId: node.id });
  });
}

export function connectDenimChild(db: Database, parentId: string, childId: string, edgeId: string): void {
  transaction(db, () => {
    addDenimEdge(db, { id: edgeId, type: PARENT_CHILD, sourceId: parentId, targetId: childId });
  });
}

export function removeDenimEdge(db: Database, id: string): void {
  db.run('DELETE FROM edges WHERE id = ?', [id]);
}

export function removeDenimNode(db: Database, id: string): void {
  db.run('DELETE FROM nodes WHERE id = ?', [id]);
}
