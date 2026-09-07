import { actionLabel, executeNylonAction, type NylonAction } from '@luminous/core/nylon/actions';
import { NYLON_HISTORY_LIMIT, type NylonActionRequest, type NylonActionResponse, type NylonSnapshot } from '@luminous/core/nylon/history';

export interface NylonActionView {
  snapshot: NylonSnapshot;
  saving: boolean;
  refreshing: boolean;
  blocked: boolean;
}

interface Pending {
  action: NylonAction;
  actionId: string;
  after: NylonSnapshot;
}

/** All UI actions pass through this controller. Display revisions describe the
 * optimistic document; only confirmed server revisions are sent over the wire. */
export function createNylonActionController(options: {
  initial: NylonSnapshot;
  send: (request: NylonActionRequest) => Promise<NylonActionResponse>;
  read: () => Promise<NylonSnapshot>;
  onChange: (view: NylonActionView) => void;
  onError: (message: string) => void;
}) {
  let confirmed = options.initial;
  let displayed = options.initial;
  let pending: Pending[] = [];
  let sending = false;
  let refreshing = false;
  let blocked = false;
  let disposed = false;
  let refreshWanted = false;
  const sameDocument = (a: NylonSnapshot, b: NylonSnapshot) => JSON.stringify(a.document) === JSON.stringify(b.document);
  const state = (): NylonActionView => ({ snapshot: displayed, saving: pending.length > 0, refreshing, blocked });
  const publish = () => { if (!disposed) options.onChange(state()); };

  async function refresh(): Promise<void> {
    if (disposed) return;
    if (sending || refreshing) { refreshWanted = true; return; }
    refreshWanted = false;
    refreshing = true;
    publish();
    try {
      const snapshot = await options.read();
      if (disposed) return;
      const unchanged = snapshot.revision === confirmed.revision;
      confirmed = snapshot;
      displayed = { ...snapshot, revision: unchanged ? displayed.revision : crypto.randomUUID() };
      blocked = false;
    } catch (error) {
      if (disposed) return;
      blocked = true;
      options.onError(`Could not refresh: ${error instanceof Error ? error.message : String(error)}. Refresh before making more changes.`);
    } finally {
      refreshing = false;
      publish();
      if (refreshWanted && !blocked && !disposed) { refreshWanted = false; void refresh(); }
    }
  }

  async function flush(): Promise<void> {
    if (sending || disposed) return;
    sending = true;
    try {
      while (pending.length) {
        const next = pending[0];
        const result = await options.send({ action: next.action, actionId: next.actionId,
          baseRevision: confirmed.revision, origin: 'ui' });
        if (!result.ok) throw new Error(result.error);
        confirmed = result.snapshot;
        pending.shift();
        // A retry may return a newer snapshot after an external edit. Never
        // reinterpret queued geometry-dependent actions against that state.
        if (!sameDocument(confirmed, next.after)
          || JSON.stringify(confirmed.undo) !== JSON.stringify(next.after.undo)
          || JSON.stringify(confirmed.redo) !== JSON.stringify(next.after.redo)) {
          pending = [];
          displayed = { ...confirmed, revision: crypto.randomUUID() };
          if (!disposed) options.onError('The Document changed while saving. Pending previews were discarded; try those actions again.');
          refreshWanted = true;
          break;
        }
        // Pending previews already include this action. Keep their document
        // and display revision stable while confirmations advance underneath.
        if (!pending.length) displayed = { ...confirmed, revision: displayed.revision };
        publish();
      }
    } catch (error) {
      if (disposed) return;
      pending = [];
      displayed = { ...confirmed, revision: crypto.randomUUID() };
      blocked = true;
      refreshWanted = true;
      options.onError(`${error instanceof Error ? error.message : String(error)} Pending previews were discarded.`);
    } finally {
      sending = false;
      publish();
      if (refreshWanted && !disposed) { refreshWanted = false; await refresh(); }
    }
  }

  /** Synchronously accepts and displays a preview before the gesture ends. */
  function dispatch(action: NylonAction, viewRevision = displayed.revision): boolean {
    if (disposed) return false;
    if (blocked || refreshing) { options.onError('Refresh is required before making more changes.'); return false; }
    if (viewRevision !== displayed.revision) { options.onError('The Document changed during the gesture. Try again.'); return false; }
    const captured = structuredClone(action);
    const actionId = crypto.randomUUID();
    let after: NylonSnapshot;
    if (captured.op === 'undo' || captured.op === 'redo') {
      const source = captured.op === 'undo' ? displayed.undo : displayed.redo;
      const entry = source.at(-1);
      if (!entry) return false;
      const reverse = { ...entry, document: displayed.document };
      after = { ...displayed, document: entry.document,
        undo: captured.op === 'undo' ? displayed.undo.slice(0, -1) : [...displayed.undo, reverse],
        redo: captured.op === 'redo' ? displayed.redo.slice(0, -1) : [...displayed.redo, reverse] };
    } else {
      const result = executeNylonAction(displayed.document, captured);
      if (!result.ok) { options.onError(result.error); return false; }
      const changed = JSON.stringify(result.doc) !== JSON.stringify(displayed.document);
      after = changed ? { ...displayed, document: result.doc,
        undo: [...displayed.undo, { actionId, label: actionLabel(captured), origin: 'ui', document: displayed.document }].slice(-NYLON_HISTORY_LIMIT),
        redo: [] } : displayed;
    }
    after = { ...after, revision: sameDocument(displayed, after) ? displayed.revision : crypto.randomUUID() };
    pending.push({ action: captured, actionId, after });
    displayed = after;
    publish();
    void flush();
    return true;
  }

  function changed(revision?: string, actionId?: string): void {
    if (revision === confirmed.revision || (actionId && pending.some((entry) => entry.actionId === actionId))) return;
    void refresh();
  }

  // Detach the view, but finish saving already accepted actions on navigation.
  return { state, dispatch, refresh, changed, dispose: () => { disposed = true; } };
}
