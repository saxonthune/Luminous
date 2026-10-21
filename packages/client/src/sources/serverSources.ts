import type { CanvasSource } from './CanvasSource';
import { SourceConflictError } from './CanvasSource';

interface DocumentMeta {
  path: string;
  name: string;
  root?: string;
  rootDir?: string;
  lastModified: number;
}

interface DocumentsResponse {
  documents: DocumentMeta[];
}

/** Derive a grouping key, tolerating servers that omit `root`. */
function rootOf(doc: DocumentMeta): string {
  if (doc.root) return doc.root;
  const slash = doc.path.indexOf('/');
  return slash !== -1 ? doc.path.slice(0, slash) : 'workspace';
}

/** Absolute path of the document, joining rootDir with the path's in-root remainder. */
function absPathOf(doc: DocumentMeta): string | undefined {
  if (!doc.rootDir) return undefined;
  const prefix = `${rootOf(doc)}/`;
  const rel = doc.path.startsWith(prefix) ? doc.path.slice(prefix.length) : doc.path;
  return `${doc.rootDir}/${rel}`;
}

export async function fetchServerSources(suffix: string): Promise<CanvasSource[]> {
  const res = await fetch('/api/documents');
  const data: DocumentsResponse = await res.json();
  return data.documents
    .filter((doc) => doc.path.endsWith(suffix))
    .map((doc) => ({
      id: doc.path,
      label: doc.name,
      root: rootOf(doc),
      rootDir: doc.rootDir,
      absPath: absPathOf(doc),
      load: () =>
        fetch('/api/document/' + encodeURIComponent(doc.path)).then((r) => r.text()),
      ...(doc.path.endsWith('.sqlite') ? {
        loadBytes: async () => {
          const response = await fetch('/api/denim/database/' + encodeURIComponent(doc.path));
          if (!response.ok) throw new Error(`Failed to read database (${response.status})`);
          const revision = response.headers.get('ETag');
          if (!revision) throw new Error('Database response has no revision');
          return { bytes: new Uint8Array(await response.arrayBuffer()), revision };
        },
        saveBytes: async (bytes: Uint8Array, revision: string) => {
          const response = await fetch('/api/denim/database/' + encodeURIComponent(doc.path), {
            method: 'PUT', headers: { 'Content-Type': 'application/vnd.sqlite3', 'If-Match': revision }, body: bytes as BodyInit,
          });
          if (response.status === 412) throw new SourceConflictError('This database changed elsewhere. Reload it before saving.');
          if (!response.ok) throw new Error(`Failed to save database (${response.status})`);
          const nextRevision = response.headers.get('ETag');
          if (!nextRevision) throw new Error('Save response has no revision');
          return nextRevision;
        },
      } : {}),
    }));
}
