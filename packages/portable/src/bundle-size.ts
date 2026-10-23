import type { Plugin } from 'vite';
import type { BundleSizeReport } from './graph.js';

/** Bundler attribution is before final chunk minification; don't present it as
 * an exact partition of the emitted bytes. No source text or absolute paths ship. */
export function bundleSizePlugin(report: BundleSizeReport): Plugin {
  return {
    name: 'portable-bundle-size',
    generateBundle(_options, bundle) {
      const totals = new Map<string, { renderedCharacters: number; modules: number }>();
      for (const output of Object.values(bundle)) {
        if (output.type !== 'chunk') continue;
        for (const [id, module] of Object.entries(output.modules)) {
          if (!module.renderedLength) continue;
          const path = id.replaceAll('\\', '/');
          const dependency = path.split('/node_modules/').at(-1)!;
          const packageName = dependency.startsWith('@') ? dependency.split('/').slice(0, 2).join('/') : dependency.split('/')[0];
          const workspace = path.match(/\/packages\/([^/]+)\//)?.[1];
          const group = path.includes('/node_modules/') ? packageName : workspace ? `@luminous/${workspace}` : 'other / bundler helpers';
          const current = totals.get(group) ?? { renderedCharacters: 0, modules: 0 };
          current.renderedCharacters += module.renderedLength;
          current.modules++;
          totals.set(group, current);
        }
      }
      report.packages = [...totals].map(([name, values]) => ({ name, ...values })).sort((a, b) => b.renderedCharacters - a.renderedCharacters);
    },
  };
}
