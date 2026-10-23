import { readFile, writeFile, mkdir, mkdtemp, rm } from 'node:fs/promises';
import { resolve, dirname, join, basename } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import { bundleSizePlugin } from './bundle-size.js';
import { build } from 'vite';
import solid from 'vite-plugin-solid';
import { validateDocument, projectDiagram, formatDiagnostic } from './semantics.js';
import { computeDefaultLayout } from './layout/index.js';
import { renderInfo } from './import/extended-info.js';
import { importMarkdown } from './import/markdown.js';
import type { PortableArtifact, PortableTheme, BundleSizeReport } from './graph.js';

const { values } = parseArgs({ options: { input: { type: 'string' }, theme: { type: 'string' }, css: { type: 'string' }, output: { type: 'string' }, title: { type: 'string', default: 'Luminous Portable' }, 'debug-performance': { type: 'boolean', default: false }, force: { type: 'boolean', default: false }, help: { type: 'boolean' } } });
if (values.help) {
  console.log('just portable --input INPUT.md [--theme theme.json] [--css style.css] [--output design.html] [--title TITLE] [--force] [--debug-performance]');
} else {
  if (!values.input || !values.input.toLowerCase().endsWith('.md')) throw new Error('--input requires a Markdown (.md) file');
  const source = await readFile(resolve(values.input), 'utf8');
  const notebook = await importMarkdown(source).catch(error => {
    console.error(formatDiagnostic({ ruleId: 'input/parse', severity: 'error', message: error instanceof Error ? error.message : String(error) }, values.input!));
    console.error('Generation rejected. Existing HTML, if any, is unchanged.');
    process.exit(1);
  });
  const theme: PortableTheme | undefined = values.theme ? JSON.parse(await readFile(resolve(values.theme), 'utf8')) : undefined;
  if (theme) {
    if (theme.version !== 1 || !theme.styles) throw new Error('Expected theme version 1 with styles');
    for (const style of Object.values(theme.styles)) if (typeof style.label !== 'string' || !style.label.trim()) throw new Error('Theme styles require nonempty legend labels');
    for (const style of Object.values(theme.styles)) for (const palette of [style.light, style.dark]) for (const color of [palette?.fill, palette?.stroke]) if (!/^#[0-9a-f]{6}$/i.test(color)) throw new Error('Theme colors must be six-digit hex values');
  }
  const diagnostics = validateDocument(notebook, theme);
  for (const diagnostic of diagnostics) console.error(formatDiagnostic(diagnostic, values.input));
  if (diagnostics.some(d => d.severity === 'error')) {
    console.error('Generation rejected. Existing HTML, if any, is unchanged and represents the previous successful generation.');
    process.exitCode = 1;
  } else {
    const diagrams = [];
    for (const source of notebook.diagrams) {
      const diagram = projectDiagram(source, notebook.model);
      diagrams.push({ ...diagram, defaultLayout: await computeDefaultLayout(diagram.graph, source.mode, source.settings?.layout) });
    }
    const artifact: PortableArtifact = { debugPerformance: values['debug-performance'], title: values.title, sourceFilename: basename(values.input), html: notebook.html, diagrams, theme, model: notebook.model, info: renderInfo(notebook.info) };
    const directory = dirname(fileURLToPath(import.meta.url));
    const temporary = await mkdtemp(join(tmpdir(), 'luminous-portable-build-'));
    const sizeReport: BundleSizeReport = { javascriptBytes: 0, cssBytes: 0, contentBytes: 0, packages: [] };
    try {
      await build({ configFile: false, root: resolve(directory, '..'), plugins: [solid(), ...(values['debug-performance'] ? [bundleSizePlugin(sizeReport)] : [])], logLevel: 'warn', build: { outDir: temporary, emptyOutDir: false, lib: { entry: join(directory, 'runtime/index.tsx'), name: 'LuminousPortable', formats: ['iife'], fileName: () => 'runtime.js' }, cssCodeSplit: false } });
      const js = await readFile(join(temporary, 'runtime.js'), 'utf8');
      const css = await readFile(join(temporary, 'portable.css'), 'utf8');
      const customCss = values.css ? await readFile(resolve(values.css), 'utf8') : '';
      if (values['debug-performance']) {
        sizeReport.javascriptBytes = Buffer.byteLength(js);
        sizeReport.cssBytes = Buffer.byteLength(css + customCss);
        sizeReport.contentBytes = Buffer.byteLength(JSON.stringify(artifact).replaceAll('<', '\\u003c'));
        artifact.bundleSize = sizeReport;
        console.info('[portable bundle size] Exact UTF-8 payload bytes (content excludes this report):', { javascript: sizeReport.javascriptBytes, css: sizeReport.cssBytes, content: sizeReport.contentBytes });
        console.info('Package attribution: rendered characters before final minification; not final byte totals.');
        console.table(sizeReport.packages);
      }
      const escape = (text: string) => text.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('"', '&quot;');
      const html = `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="darkreader-lock"><title>${escape(values.title)}</title><style>${(css + customCss).replace(/<\/style/gi, '<\\/style')}</style></head><body><div id="app"></div><script id="portable-data" type="application/json">${JSON.stringify(artifact).replaceAll('<', '\\u003c')}</script><script>${js.replace(/<\/script/gi, '<\\/script')}</script></body></html>`;
      const output = values.output ? resolve(values.output) : join(await mkdtemp(join(tmpdir(), 'luminous-portable-')), 'design.html');
      await mkdir(dirname(output), { recursive: true });
      await writeFile(output, html, { flag: values.force ? 'w' : 'wx' });
      console.log(output);
    } finally { await rm(temporary, { recursive: true, force: true }); }
  }
}
