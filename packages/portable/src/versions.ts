import type { PortableArtifact } from './graph.js';

export interface ArtifactVersion {
  version: number;
  label: string;
  createdAt: string;
  digest: string;
  customCss: string;
  artifact: PortableArtifact;
}
export interface VersionedArtifact { format: 'portable-versions-1'; versions: ArtifactVersion[] }

export function selectedVersion(versions: readonly ArtifactVersion[], href: string): ArtifactVersion {
  if (!versions.length) throw new Error('This artifact has no versions.');
  const value = new URL(href).searchParams.get('v');
  if (value === null || value === 'latest') return versions.reduce((a, b) => a.version > b.version ? a : b);
  const match = /^[1-9]\d*$/.test(value) && versions.find(item => item.version === Number(value));
  if (!match) throw new Error(`Artifact version ${JSON.stringify(value)} is unavailable.`);
  return match;
}
export function urlWithVersion(href: string, version: number | 'latest'): string {
  const url = new URL(href);
  url.searchParams.set('v', String(version));
  return url.href;
}
