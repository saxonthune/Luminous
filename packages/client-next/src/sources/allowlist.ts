// Single point of control for which canvases appear in the document picker.
// Edit this list to expose more fixtures as they migrate to v3.
const ALLOWED_PATHS: ReadonlySet<string> = new Set([
  'rtp-statechart.graph.json',
  'rtp-navigation.graph.json',
  'sample-primitives.graph.json',
]);

export function isVisibleSource(path: string): boolean {
  return ALLOWED_PATHS.has(path);
}
