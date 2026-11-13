import { mkdir, readFile, writeFile, rename, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { createHash, randomUUID } from 'node:crypto';
import type { PortableArtifact } from './graph.js';
import type { ArtifactVersion, VersionedArtifact } from './versions.js';

/** The lock covers snapshot allocation and publication. A failed publish leaves history unchanged. */
export async function publishHistory(directory: string, artifact: PortableArtifact, customCss: string, label: string | undefined, publish: (payload: VersionedArtifact) => Promise<void>, amendLatest = false): Promise<void> {
  await mkdir(directory, { recursive: true });
  const lock = join(directory, '.write-lock');
  await mkdir(lock).catch(() => { throw new Error(`Artifact history is locked: ${lock}. Check for an active generator before removing a stale lock.`); });
  try {
    let ids: number[] = [];
    try { ids = JSON.parse(await readFile(join(directory, 'versions.json'), 'utf8')); }
    catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error; }
    if (!Array.isArray(ids) || ids.some((id, i) => !Number.isSafeInteger(id) || id <= 0 || (i > 0 && id <= ids[i - 1]))) throw new Error('Invalid artifact history index');
    const versions: ArtifactVersion[] = await Promise.all(ids.map(async id => {
      const revision = JSON.parse(await readFile(join(directory, `${id}.json`), 'utf8')) as ArtifactVersion;
      if (revision.version !== id || !revision.artifact || typeof revision.customCss !== 'string') throw new Error(`Invalid artifact revision ${id}`);
      return revision;
    }));
    // Keep measured layout, source, theme, and custom CSS; exclude diagnostic noise.
    const { bundleSize: _bundleSize, debugPerformance: _debug, ...content } = artifact;
    const digest = createHash('sha256').update(JSON.stringify({ content, customCss })).digest('hex');
    const latest = versions.at(-1);
    if (amendLatest && !latest) throw new Error('Cannot amend an empty artifact history');
    const added = latest?.digest !== digest;
    const revision: ArtifactVersion = added ? { version: amendLatest ? latest!.version : (latest?.version ?? 0) + 1, label: label ?? (amendLatest ? latest!.label : artifact.title), createdAt: amendLatest ? latest!.createdAt : new Date().toISOString(), digest, customCss, artifact: content } : latest!;
    const payload: VersionedArtifact = { format: 'portable-versions-1', versions: added ? [...(amendLatest ? versions.slice(0, -1) : versions), revision] : versions };
    await publish(payload);
    if (added) {
      // Manifest is the commit point. Orphans after interruption can be overwritten on retry.
      const write = async (file: string, text: string) => {
        const temporary = join(directory, `.${randomUUID()}.tmp`);
        await writeFile(temporary, text);
        await rename(temporary, join(directory, file));
      };
      await write(`${revision.version}.json`, JSON.stringify(revision));
      await write(`${revision.version}.md`, artifact.sourceMarkdown);
      await write(`${revision.version}.css`, customCss);
      await write(`${revision.version}.theme.json`, JSON.stringify(artifact.theme ?? null, null, 2));
      await write('versions.json', JSON.stringify(payload.versions.map(item => item.version)) + '\n');
    }
  } finally { await rm(lock, { recursive: true, force: true }); }
}
