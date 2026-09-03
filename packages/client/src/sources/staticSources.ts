import type { CanvasSource } from './CanvasSource';

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
  const entries = suffix
    ? data.documents.filter((entry) => entry.path.endsWith(suffix))
    : data.documents;
  return entries.map((entry) => ({
    id: entry.path,
    label: entry.name,
    root: entry.root,
    load: () =>
      fetch(`${import.meta.env.BASE_URL}canvases/${entry.path}`).then((r) => r.text()),
  }));
}
