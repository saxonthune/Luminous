import type { CanvasSource } from './CanvasSource';

interface DocumentMeta {
  path: string;
  name: string;
  root?: string;
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

export async function fetchServerSources(): Promise<CanvasSource[]> {
  const res = await fetch('/api/documents');
  const data: DocumentsResponse = await res.json();
  return data.documents.map((doc) => ({
    id: doc.path,
    label: doc.name,
    root: rootOf(doc),
    load: () =>
      fetch('/api/document/' + encodeURIComponent(doc.path)).then((r) => r.text()),
  }));
}
