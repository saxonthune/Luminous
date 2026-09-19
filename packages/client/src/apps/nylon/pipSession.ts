export interface NylonPip {
  id: string;
  focusId: string;
  showContext?: boolean;
  sourceView: string;
  sourceNode: string;
  x: number;
  y: number;
}

export interface NylonPipSession {
  open: NylonPip[];
  closed: NylonPip[][];
}

export const pipNodeId = (view: string, node: string) => view === 'main' ? node : JSON.stringify(['pip', view, node]);
export const pipFrameId = (id: string) => JSON.stringify(['pip-frame', id]);

/** Older tab sessions simply have no PIPs. Invalid PIPs must not discard tabs. */
export function decodePips(value: unknown): NylonPipSession {
  const empty = { open: [], closed: [] };
  if (!value || typeof value !== 'object') return empty;
  const candidate = value as NylonPipSession;
  const ids = new Set<string>();
  const valid = (items: unknown): items is NylonPip[] => Array.isArray(items) && items.every((p) => {
    if (!p || typeof p.id !== 'string' || p.id === 'main' || ids.has(p.id)
      || typeof p.focusId !== 'string' || typeof p.sourceView !== 'string' || typeof p.sourceNode !== 'string'
      || (p.showContext !== undefined && typeof p.showContext !== 'boolean')
      || !Number.isFinite(p.x) || !Number.isFinite(p.y)) return false;
    ids.add(p.id);
    return true;
  });
  if (!valid(candidate.open) || !Array.isArray(candidate.closed) || !candidate.closed.every(valid)) return empty;
  const all = [...candidate.open, ...candidate.closed.flat()];
  const byId = new Map(all.map((p) => [p.id, p]));
  for (const pip of all) {
    const seen = new Set([pip.id]);
    let source = pip.sourceView;
    while (source !== 'main') {
      if (seen.has(source) || !byId.has(source)) return empty;
      seen.add(source);
      source = byId.get(source)!.sourceView;
    }
  }
  return candidate;
}
