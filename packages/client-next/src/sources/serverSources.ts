import type { CanvasSource } from './CanvasSource';
import { isVisibleSource } from './allowlist';

interface DocumentMeta {
  path: string;
  name: string;
  lastModified: number;
}

interface DocumentsResponse {
  documents: DocumentMeta[];
}

export async function fetchServerSources(): Promise<CanvasSource[]> {
  const res = await fetch('/api/documents');
  const data: DocumentsResponse = await res.json();
  return data.documents
    .filter((doc) => isVisibleSource(doc.path))
    .map((doc) => ({
      id: doc.path,
      label: doc.name,
      load: () =>
        fetch('/api/document/' + encodeURIComponent(doc.path)).then((r) => r.text()),
    }));
}
