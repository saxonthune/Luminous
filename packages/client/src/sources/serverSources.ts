import type { CanvasSource } from './CanvasSource';

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
    }));
}
