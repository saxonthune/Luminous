import { chromium } from 'playwright';
import { build } from 'vite';
import solid from 'vite-plugin-solid';
import { readFile } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { PortableCard, PortableDiagram, PortableNode, PortableTheme, NodeMeasurements } from '../graph.js';
import type { MeasurementItem, MeasurementInput, MeasurementOutput } from './contracts.js';
import { buildRestTree } from '../rest-tree.js';

/** One browser for the complete document, including nested schema disclosures. */
export async function measureDiagrams(diagrams: Omit<PortableDiagram, 'defaultLayout'>[], theme: PortableTheme | undefined, customCss: string, temporary: string): Promise<NodeMeasurements[]> {
  if (!diagrams.some(diagram => diagram.graph.nodes.length)) return diagrams.map(() => ({}));
  const directory = dirname(fileURLToPath(import.meta.url));
  await build({ configFile: false, root: join(directory, '../..'), plugins: [solid()], logLevel: 'warn', build: {
    outDir: temporary, emptyOutDir: false, lib: { entry: join(directory, 'browser.tsx'), name: 'PortableMeasurement', formats: ['iife'], fileName: () => 'measurement.js' }, cssCodeSplit: false,
  } });
  const [script, css] = await Promise.all([readFile(join(temporary, 'measurement.js'), 'utf8'), readFile(join(temporary, 'portable.css'), 'utf8')]);
  const items: MeasurementItem[] = [];
  const nested: { id: string; card: PortableCard }[] = [];
  const nestedFields = (card: PortableCard | undefined, node: PortableNode, prefix: string) => {
    card?.fields?.forEach((field, i) => {
      if (!field.schema) return;
      const id = `${prefix}/field/${i}`;
      items.push({ id, node: { ...node, id, card: field.schema, group: false, parentId: undefined } });
      nested.push({ id, card: field.schema });
      nestedFields(field.schema, node, id);
    });
  };
  diagrams.forEach((diagram, i) => {
    const tree = diagram.mode === 'rest-api-tree' ? buildRestTree(diagram.graph) : undefined;
    diagram.graph.nodes.forEach((node, j) => {
      const id = `${i}/${j}`;
      items.push({ id, node, descendantCount: tree?.descendants.get(node.id)?.length });
      nestedFields(node.card, node, id);
    });
  });
  if (!items.length) return diagrams.map(() => ({}));
  const browser = await chromium.launch({ headless: true, executablePath: process.env.PORTABLE_CHROMIUM_PATH || undefined }).catch(error => {
    throw new Error(`Portable needs Chromium to measure styled components. Run pnpm --dir packages/portable exec playwright install chromium, or set PORTABLE_CHROMIUM_PATH. ${error.message}`);
  });
  try {
    const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
    await page.setContent('<!doctype html><html><head><meta charset="utf-8"></head><body></body></html>');
    await page.addStyleTag({ content: css + '\n' + customCss });
    await page.addScriptTag({ content: script });
    const measurements = await page.evaluate(async (input: MeasurementInput) => {
      const host = window as unknown as { measurePortable: (input: MeasurementInput) => Promise<MeasurementOutput> };
      return host.measurePortable(input);
    }, { items, theme });
    for (const item of nested) item.card.measuredSize = measurements[item.id];
    return diagrams.map((diagram, i) => Object.fromEntries(diagram.graph.nodes.map((node, j) => [node.id, measurements[`${i}/${j}`]])));
  } finally { await browser.close(); }
}
