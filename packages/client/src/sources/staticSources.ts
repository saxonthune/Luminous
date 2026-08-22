import type { CanvasSource } from './CanvasSource';

interface ManifestEntry {
  path: string;
  name: string;
  root: string;
}

interface CanvasManifest {
  canvases: ManifestEntry[];
}

export async function fetchStaticSources(): Promise<CanvasSource[]> {
  const res = await fetch(`${import.meta.env.BASE_URL}canvases/index.json`);
  const data: CanvasManifest = await res.json();
  return data.canvases.map((entry) => ({
    id: entry.path,
    label: entry.name,
    root: entry.root,
    load: () =>
      fetch(`${import.meta.env.BASE_URL}canvases/${entry.path}`).then((r) => r.text()),
  }));
}
