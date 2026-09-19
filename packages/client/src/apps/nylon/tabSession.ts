import { decodePips, type NylonPipSession } from './pipSession.ts';
import type { NylonViewDefinition } from '@luminous/core/nylon/projection';
import type { NylonCanvasState } from './NylonCanvas.tsx';

export interface NylonTab {
  key: string;
  view: NylonViewDefinition;
  state?: NylonCanvasState;
}

export interface NylonTabSession {
  tabs: NylonTab[];
  closed: NylonTab[];
  activeKey: string;
}

export function nylonTabKey(view: NylonViewDefinition): string {
  return view.kind === 'continuous' ? 'continuous' : JSON.stringify(['standard', view.focusId]);
}

const storageKey = (source: string) => `nylon-tabs:${source}`;

/** Invalid or unavailable browser storage leaves normal in-memory tabs usable. */
export function readNylonTabSession(source: string): NylonTabSession | undefined {
  try {
    const saved = JSON.parse(sessionStorage.getItem(storageKey(source)) ?? 'null');
    if (!saved || (saved.v !== 1 && saved.v !== 2) || !Array.isArray(saved.tabs) || !Array.isArray(saved.closed)) return;
    const seen = new Set<string>();
    const decode = (entry: { view: NylonViewDefinition; state?: { camera: NylonCanvasState['camera']; selection: string[]; containerStates: [string, string][]; pips?: NylonPipSession } }): NylonTab => {
      const view = entry.view;
      if (!view || (view.kind !== 'continuous' && !(view.kind === 'standard' && (view.focusId === null || typeof view.focusId === 'string')))) throw new Error('Invalid View');
      const key = nylonTabKey(view);
      if (seen.has(key)) throw new Error('Duplicate Tab');
      seen.add(key);
      if (!entry.state) return { key, view };
      const { camera, selection, containerStates } = entry.state;
      if (!camera || ![camera.x, camera.y, camera.k].every(Number.isFinite) || camera.k <= 0
        || !Array.isArray(selection) || !selection.every((id) => typeof id === 'string')
        || !Array.isArray(containerStates) || !containerStates.every((pair) => Array.isArray(pair)
          && typeof pair[0] === 'string' && ['expanded', 'covered', 'collapsed'].includes(pair[1]))) throw new Error('Invalid Tab state');
      return { key, view, state: { camera, selection, pips: decodePips(entry.state.pips),
        containerStates: new Map(containerStates as [string, 'expanded' | 'covered' | 'collapsed'][]) } };
    };
    const tabs = saved.tabs.map(decode) as NylonTab[];
    const closed = saved.closed.map(decode) as NylonTab[];
    if (tabs[0]?.view.kind !== 'continuous' || closed.some((tab) => tab.view.kind === 'continuous')) return;
    return { tabs, closed, activeKey: tabs.some((tab) => tab.key === saved.activeKey) ? saved.activeKey : tabs[0].key };
  } catch { return; }
}

export function writeNylonTabSession(source: string, session: NylonTabSession): void {
  const encode = (tab: NylonTab) => ({ view: tab.view, state: tab.state ? {
    ...tab.state, containerStates: [...tab.state.containerStates],
  } : undefined });
  try {
    sessionStorage.setItem(storageKey(source), JSON.stringify({
      v: 2, tabs: session.tabs.map(encode), closed: session.closed.map(encode), activeKey: session.activeKey,
    }));
  } catch { /* Storage can be disabled or full; navigation still works. */ }
}
