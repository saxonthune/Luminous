import { SourceConflictError, type CanvasSource, type LoadedBinaryDocument } from './CanvasSource';

interface ManifestEntry {
  path: string;
  name: string;
  root: string;
}

interface DocumentManifest {
  documents: ManifestEntry[];
}

/**
 * List documents bundled into the static site (public/canvases/index.json).
 * `suffix` (e.g. '.merino.json') filters the manifest to one document kind,
 * mirroring how `fetchServerSources` filters the server's document list; omit
 * it to list every bundled document.
 */
export async function fetchStaticSources(suffix?: string): Promise<CanvasSource[]> {
  const res = await fetch(`${import.meta.env.BASE_URL}canvases/index.json`);
  const data: DocumentManifest = await res.json();
  const bundled = suffix
    ? data.documents.filter((entry) => entry.path.endsWith(suffix))
    : data.documents;
  const savedPaths = suffix === '.denim.sqlite' ? await listSavedDatabasePaths() : [];
  const knownPaths = new Set(bundled.map((entry) => entry.path));
  const entries = [...bundled, ...savedPaths
    .filter((path) => !knownPaths.has(path))
    .map((path) => ({
      path,
      name: path.slice(path.lastIndexOf('/') + 1),
      root: path.includes('/') ? path.slice(0, path.indexOf('/')) : 'workspace',
    }))];
  return entries.map((entry) => ({
    id: entry.path,
    label: entry.name,
    root: entry.root,
    load: () =>
      fetch(`${import.meta.env.BASE_URL}canvases/${entry.path}`).then((r) => r.text()),
    ...(entry.path.endsWith('.sqlite') ? {
      loadBytes: () => loadStaticDatabase(entry.path),
      saveBytes: (bytes: Uint8Array, revision: string) => saveStaticDatabase(entry.path, bytes, revision),
    } : {}),
  }));
}

const DB_NAME = 'luminous-static-denim';
let resettingDemo = false;

/** Clear app-owned demo data, preserving the user's theme preference. */
export async function resetDemoState(): Promise<void> {
  if (!__STATIC__) throw new Error('Demo reset is only available in static mode');
  resettingDemo = true;
  try {
    const store = await openStaticDbStore();
    try {
      await new Promise<void>((resolve, reject) => {
        const tx = store.transaction('databases', 'readwrite');
        tx.objectStore('databases').clear();
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
        tx.onabort = () => reject(tx.error ?? new Error('Demo reset cancelled'));
      });
    } finally { store.close(); }
    for (const storage of [localStorage, sessionStorage]) {
      for (const key of Object.keys(storage)) {
        if (key.startsWith('luminous:') || key.startsWith('denim-active-') || key.startsWith('nylon-tabs:')) {
          storage.removeItem(key);
        }
      }
    }
  } catch (error) {
    resettingDemo = false;
    throw error;
  }
}


function openStaticDbStore(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = () => request.result.createObjectStore('databases');
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function listSavedDatabasePaths(): Promise<string[]> {
  const store = await openStaticDbStore();
  const paths = await new Promise<string[]>((resolve, reject) => {
    const request = store.transaction('databases', 'readonly').objectStore('databases').getAllKeys();
    request.onsuccess = () => resolve((request.result as string[]).filter((path) => path.endsWith('.denim.sqlite')));
    request.onerror = () => reject(request.error);
  });
  store.close();
  return paths;
}

interface StaticDatabaseRecord { bytes: ArrayBuffer | Uint8Array; revision: string }

async function loadStaticDatabase(path: string): Promise<LoadedBinaryDocument> {
  const store = await openStaticDbStore();
  const saved = await new Promise<StaticDatabaseRecord | undefined>((resolve, reject) => {
    const request = store.transaction('databases', 'readonly').objectStore('databases').get(path);
    request.onsuccess = () => resolve(request.result as StaticDatabaseRecord | undefined);
    request.onerror = () => reject(request.error);
  });
  store.close();
  if (saved) return { bytes: new Uint8Array(saved.bytes), revision: saved.revision };
  const response = await fetch(`${import.meta.env.BASE_URL}canvases/${path}`);
  if (!response.ok) throw new Error(`Failed to load ${path} (${response.status})`);
  return { bytes: new Uint8Array(await response.arrayBuffer()), revision: 'bundled' };
}

async function saveStaticDatabase(path: string, bytes: Uint8Array, expectedRevision: string): Promise<string> {
  if (resettingDemo) throw new Error('Demo state is being reset');
  const store = await openStaticDbStore();
  const nextRevision = crypto.randomUUID();
  try {
    await new Promise<void>((resolve, reject) => {
      const transaction = store.transaction('databases', 'readwrite');
      const objectStore = transaction.objectStore('databases');
      const current = objectStore.get(path);
      current.onsuccess = () => {
        const record = current.result as StaticDatabaseRecord | undefined;
        if ((record?.revision ?? 'bundled') !== expectedRevision) {
          transaction.abort();
          reject(new SourceConflictError('This database changed in another tab. Reload it before saving.'));
          return;
        }
        objectStore.put({ bytes: bytes.slice().buffer, revision: nextRevision } satisfies StaticDatabaseRecord, path);
      };
      current.onerror = () => reject(current.error);
      transaction.oncomplete = () => resolve();
      transaction.onabort = () => reject(transaction.error ?? new Error('Database save was cancelled'));
      transaction.onerror = () => reject(transaction.error ?? new Error('Database save failed'));
    });
    return nextRevision;
  } finally {
    store.close();
  }
}

/** Persist a newly created local Denim project in the static demo's IndexedDB store. */
export async function createStaticDatabase(path: string, bytes: Uint8Array): Promise<void> {
  if (resettingDemo) throw new Error('Demo state is being reset');
  if (!path.endsWith('.denim.sqlite')) throw new Error('Expected a Denim SQLite path');
  const store = await openStaticDbStore();
  try {
    await new Promise<void>((resolve, reject) => {
      const transaction = store.transaction('databases', 'readwrite');
      const objectStore = transaction.objectStore('databases');
      const request = objectStore.add({ bytes: bytes.slice().buffer, revision: crypto.randomUUID() } satisfies StaticDatabaseRecord, path);
      request.onerror = () => reject(request.error);
      transaction.oncomplete = () => resolve();
      transaction.onabort = () => reject(transaction.error ?? new Error('Project creation was cancelled'));
      transaction.onerror = () => reject(transaction.error ?? new Error('Project creation failed'));
    });
  } finally {
    store.close();
  }
}
