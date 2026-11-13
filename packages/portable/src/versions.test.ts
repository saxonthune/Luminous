import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { publishHistory } from './history.js';
import { selectedVersion, urlWithVersion, type VersionedArtifact } from './versions.js';
import type { PortableArtifact } from './graph.js';
const artifact: PortableArtifact = { title: 'Example', sourceFilename: 'example.md', sourceMarkdown: '# Example', html: '<h1>Example</h1>', diagrams: [] };

test('snapshots append changed content, reuse unchanged content and preserve old revisions', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'portable-history-test-'));
  try {
    let payload!: VersionedArtifact;
    const publish = async (value: VersionedArtifact) => { payload = value; };
    await publishHistory(dir, artifact, '', 'First', publish);
    const first = await readFile(join(dir, '1.json'), 'utf8');
    await publishHistory(dir, artifact, '', 'Ignored duplicate label', publish);
    assert.equal(payload.versions.length, 1);
    await publishHistory(dir, { ...artifact, sourceMarkdown: '# Second' }, 'body {color:red}', 'Second', publish);
    assert.equal(payload.versions.length, 2);
    assert.equal(await readFile(join(dir, '1.json'), 'utf8'), first);
    assert.equal(selectedVersion(payload.versions, 'file:///design.html').version, 2);
    assert.equal(selectedVersion(payload.versions, 'file:///design.html?v=latest').version, 2);
    assert.equal(selectedVersion(payload.versions, 'file:///design.html?v=1').label, 'First');
    assert.throws(() => selectedVersion(payload.versions, 'file:///design.html?v=99'), /unavailable/);
    assert.equal(urlWithVersion('file:///design.html?theme=dark&view=source#x', 1), 'file:///design.html?theme=dark&view=source&v=1#x');
    assert.equal(payload.versions[0].customCss, '');
    assert.equal(payload.versions[1].customCss, 'body {color:red}');
    await assert.rejects(publishHistory(dir, { ...artifact, title: 'Rejected' }, '', undefined, async () => { throw new Error('publish failed'); }), /publish failed/);
    assert.deepEqual(JSON.parse(await readFile(join(dir, 'versions.json'), 'utf8')), [1, 2]);
    await publishHistory(dir, artifact, '', 'Return to first content', publish);
    assert.equal(payload.versions.at(-1)?.version, 3);
  } finally { await rm(dir, { recursive: true, force: true }); }
});

test('amend latest keeps its version and earlier snapshots, and publishes before replacing history', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'portable-amend-test-'));
  try {
    let payload!: VersionedArtifact;
    const publish = async (value: VersionedArtifact) => { payload = value; };
    await assert.rejects(publishHistory(dir, artifact, '', undefined, publish, true), /empty/);
    await publishHistory(dir, artifact, '', 'First', publish);
    const first = await readFile(join(dir, '1.json'), 'utf8');
    await publishHistory(dir, { ...artifact, sourceMarkdown: '# Second' }, '', 'Second', publish);
    const prior = await readFile(join(dir, '2.json'), 'utf8');
    const amended = { ...artifact, sourceMarkdown: '# Second\n\nAdditional diagram' };
    await assert.rejects(publishHistory(dir, amended, '', undefined, async () => { throw new Error('publish failed'); }, true), /publish failed/);
    assert.equal(await readFile(join(dir, '2.json'), 'utf8'), prior);
    await publishHistory(dir, amended, 'body {color:blue}', undefined, publish, true);
    assert.deepEqual(payload.versions.map(v => v.version), [1, 2]);
    assert.equal(payload.versions[1].label, 'Second');
    assert.equal(payload.versions[1].createdAt, JSON.parse(prior).createdAt);
    assert.equal(await readFile(join(dir, '1.json'), 'utf8'), first);
    assert.equal(await readFile(join(dir, '2.md'), 'utf8'), amended.sourceMarkdown);
    assert.equal(await readFile(join(dir, '2.css'), 'utf8'), 'body {color:blue}');
    assert.deepEqual(JSON.parse(await readFile(join(dir, 'versions.json'), 'utf8')), [1, 2]);
  } finally { await rm(dir, { recursive: true, force: true }); }
});
