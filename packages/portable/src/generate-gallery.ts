import { readFile, mkdir, mkdtemp, writeFile, rm, access } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { dirname, join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import { galleryInputPath, galleryMarkdown, parseGallery } from './gallery.js';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');
const { values } = parseArgs({ options: {
  manifest: { type: 'string', default: join(root, 'packages/portable/demo/artifacts.json') },
  'input-dir': { type: 'string', default: join(root, 'packages/portable/examples') },
  'output-dir': { type: 'string', default: join(root, 'packages/client/dist/portable') },
  help: { type: 'boolean', default: false },
} });

if (values.help) {
  console.log('just portable-gallery [--manifest ordered-list.json] [--input-dir artifacts] [--output-dir site/portable]');
} else {
  const entries = parseGallery(JSON.parse(await readFile(resolve(values.manifest), 'utf8')));
  const inputDir = resolve(values['input-dir']);
  const outputDir = resolve(values['output-dir']);
  // Resolve and check the complete selection before writing output.
  for (const entry of entries) for (const file of [entry.input, entry.theme, entry.css]) {
    if (file !== undefined) await access(galleryInputPath(inputDir, file));
  }
  const generate = (input: string, output: string, title: string, extra: string[] = []) => {
    execFileSync(process.execPath, ['--import', 'tsx', join(root, 'packages/portable/src/generate.ts'),
      '--input', input, '--output', output, '--title', title, '--force', ...extra], { cwd: root, stdio: 'inherit' });
  };
  for (const entry of entries) {
    const extra = [
      ...(entry.theme ? ['--theme', galleryInputPath(inputDir, entry.theme)] : []),
      ...(entry.css ? ['--css', galleryInputPath(inputDir, entry.css)] : []),
    ];
    generate(galleryInputPath(inputDir, entry.input), join(outputDir, entry.slug, 'index.html'), entry.title, extra);
  }
  const temporary = await mkdtemp(join(tmpdir(), 'portable-gallery-'));
  try {
    const input = join(temporary, 'portable-overview.md');
    await writeFile(input, galleryMarkdown(entries));
    await mkdir(outputDir, { recursive: true });
    generate(input, join(outputDir, 'index.html'), 'Luminous Portable', ['--css', join(root, 'packages/portable/demo/gallery.css')]);
  } finally {
    await rm(temporary, { recursive: true, force: true });
  }
  console.log(`Portable gallery: ${join(outputDir, 'index.html')}`);
}
