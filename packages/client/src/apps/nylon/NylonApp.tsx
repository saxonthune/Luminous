import { Match, Show, Switch, batch, createSignal, onCleanup, onMount } from 'solid-js';
import { Portal } from 'solid-js/web';
import type { NylonDocument } from '@luminous/core/nylon';
import { parseNylonDocument } from '@luminous/core/nylon';
import { DocumentPicker } from '../../DocumentPicker.tsx';
import { ToastTray, type Toast } from '../../ToastTray.tsx';
import { fetchServerSources, fetchStaticSources, type CanvasSource } from '../../sources/index.ts';
import type { NylonAction } from '@luminous/core/nylon/actions';
import { memoryNylonHistory, type NylonHistory, type NylonSnapshot } from '@luminous/core/nylon/history';
import { readNylonSnapshot, sendNylonAction } from './actionClient.ts';
import { createNylonActionController, type NylonActionView } from './actionController.ts';
import { readParam, writeParam } from '../../urlState.ts';
import { watchDocuments } from '../../ws/watchClient.ts';
import { NylonCanvas } from './NylonCanvas.tsx';

type NylonAppState =
  | { kind: 'booting' }
  | { kind: 'picker' }
  | { kind: 'loadingDoc' }
  | { kind: 'mounted' }
  | { kind: 'error'; reason: string };

export function NylonApp() {
  const initialSrc = readParam('src');
  const [shell, setShell] = createSignal<NylonAppState>({ kind: 'booting' });
  const [sources, setSources] = createSignal<CanvasSource[]>([]);
  const [sourceId, setSourceId] = createSignal<string | null>(null);
  const [doc, setDoc] = createSignal<NylonDocument | null>(null);
  const [toasts, setToasts] = createSignal<Toast[]>([]);
  const [snapshot, setSnapshot] = createSignal<NylonSnapshot | null>(null);
  const [busy, setBusy] = createSignal(false);
  const [blocked, setBlocked] = createSignal(false);
  let controller: ReturnType<typeof createNylonActionController> | undefined;
  const localSessions = new Map<string, NylonHistory>();
  let loadGeneration = 0;

  function accept(view: NylonActionView): void {
    batch(() => {
      setSnapshot(view.snapshot); setDoc(view.snapshot.document);
      setBusy(view.saving); setBlocked(view.blocked || view.refreshing);
    });
  }

  async function readSnapshot(id: string): Promise<NylonSnapshot> {
    if (!__STATIC__) return readNylonSnapshot(id);
    let session = localSessions.get(id);
    if (!session) {
      const source = sources().find((item) => item.id === id);
      if (!source) throw new Error('Unknown Document');
      const parsed = parseNylonDocument(await source.load());
      if (!parsed.ok) throw new Error(parsed.issues.join('; '));
      session = memoryNylonHistory(parsed.doc);
      localSessions.set(id, session);
    }
    return session.read();
  }

  function enqueueToast(message: string): void {
    const id = `t-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    setToasts((items) => [...items, { id, message }]);
    window.setTimeout(() => setToasts((items) => items.filter((item) => item.id !== id)), 6000);
  }

  function loadDoc(id: string): void {
    const source = sources().find((item) => item.id === id);
    if (!source) return;
    const generation = ++loadGeneration;
    // eslint-disable-next-line solid/reactivity -- Read current navigation state when the asynchronous response arrives.
    readSnapshot(id).then((next) => {
      if (generation !== loadGeneration || sourceId() !== id) return;
      controller?.dispose();
      controller = createNylonActionController({
        initial: next,
        read: () => readSnapshot(id),
        send: (request) => __STATIC__ ? localSessions.get(id)!.dispatch(request) : sendNylonAction(id, request),
        onChange: accept,
        onError: enqueueToast,
      });
      accept(controller.state());
      setShell({ kind: 'mounted' });
    // eslint-disable-next-line solid/reactivity -- Read current navigation state when the asynchronous failure arrives.
    }).catch((error: unknown) => {
      if (generation !== loadGeneration || sourceId() !== id) return;
      const reason = error instanceof Error ? error.message : String(error);
      enqueueToast(`Failed to load "${source.label}": ${reason}`);
      if (shell().kind === 'mounted') {
        setSnapshot((current) => current ? { ...current, undo: [], redo: [] } : null);
        return;
      }
      setSourceId(null);
      setDoc(null);
      writeParam('src', null);
      setShell({ kind: 'picker' });
    });
  }

  function onSelect(source: CanvasSource): void {
    controller?.dispose();
    controller = undefined;
    setSourceId(source.id);
    writeParam('src', source.id);
    setShell({ kind: 'loadingDoc' });
    loadDoc(source.id);
  }

  function dispatchAction(action: NylonAction, viewRevision?: string): boolean {
    return controller?.dispatch(action, viewRevision) ?? false;
  }

  const undoEntry = () => snapshot()?.undo.at(-1);
  const redoEntry = () => snapshot()?.redo.at(-1);
  const historyTitle = (kind: 'undo' | 'redo') => {
    const entry = kind === 'undo' ? undoEntry() : redoEntry();
    const label = kind === 'undo' ? 'Undo' : 'Redo';
    return entry ? `${label} ${entry.origin}: ${entry.label}` : `Nothing to ${kind}`;
  };

  function boot(): void {
    const fetchSources = __STATIC__
      ? () => fetchStaticSources('.nylon.json')
      : () => fetchServerSources('.nylon.json');
    fetchSources()
      // eslint-disable-next-line solid/reactivity -- async continuation; setters are not reactive reads
      .then((items) => {
        setSources(items);
        setShell({ kind: 'picker' });
        if (initialSrc && items.some((item) => item.id === initialSrc)) {
          setSourceId(initialSrc);
          setShell({ kind: 'loadingDoc' });
          loadDoc(initialSrc);
        }
      })
      .catch((error: unknown) => {
        setShell({ kind: 'error', reason: error instanceof Error ? error.message : String(error) });
      });
  }

  onMount(() => {
    boot();
    // eslint-disable-next-line solid/reactivity -- WS callback; sourceId() is intentionally read when the event arrives
    const dispose = watchDocuments((path, message) => {
      if (path !== sourceId()) return;
      controller?.changed(message?.revision, message?.actionId);
    }, () => {
      void controller?.refresh();
    });
    onCleanup(dispose);
    onCleanup(() => controller?.dispose());
    const onKeyDown = (event: KeyboardEvent) => {
      if (shell().kind !== 'mounted' || event.defaultPrevented || event.altKey || !(event.ctrlKey || event.metaKey)) return;
      const target = event.target;
      if (target instanceof HTMLElement && (target.isContentEditable || target.closest('input, textarea, select, [role="textbox"]'))) return;
      const key = event.key.toLowerCase();
      const op = key === 'z' ? event.shiftKey ? 'redo' : 'undo' : key === 'y' && event.ctrlKey ? 'redo' : null;
      if (!op) return;
      event.preventDefault();
      if (!blocked() && (op === 'undo' ? undoEntry() : redoEntry())) dispatchAction({ op });
    };
    window.addEventListener('keydown', onKeyDown);
    onCleanup(() => window.removeEventListener('keydown', onKeyDown));
  });

  const sourceLabel = () => {
    const id = sourceId();
    return id ? sources().find((source) => source.id === id)?.label ?? id : null;
  };

  const errorReason = () => {
    const state = shell();
    return state.kind === 'error' ? state.reason : '';
  };

  return (
    <>
      <Portal mount={document.getElementById('app-header-left')!}>
        <Show when={shell().kind === 'mounted'}>
          <button
            disabled={busy()}
            onClick={() => { controller?.dispose(); controller = undefined; ++loadGeneration; setDoc(null); setSourceId(null); writeParam('src', null); setShell({ kind: 'picker' }); }}
            class="rounded px-2 py-1 text-sm text-fg-muted hover:bg-surface-alt hover:text-fg"
          >← Back</button>
          <button class="rounded px-1 text-sm disabled:opacity-40" disabled={blocked() || !undoEntry()}
            title={historyTitle('undo')} aria-label={historyTitle('undo')}
            onClick={() => void dispatchAction({ op: 'undo' })}>Undo</button>
          <button class="rounded px-1 text-sm disabled:opacity-40" disabled={blocked() || !redoEntry()}
            title={historyTitle('redo')} aria-label={historyTitle('redo')}
            onClick={() => void dispatchAction({ op: 'redo' })}>Redo</button>
          <Show when={busy()}><span class="text-xs text-fg-muted" role="status">Saving…</span></Show>
          <Show when={blocked()}><button class="rounded px-1 text-sm" onClick={() => void controller?.refresh()}>Refresh</button></Show>
        </Show>
        <Show when={sourceLabel()}><span class="text-sm text-fg-muted">· {sourceLabel()}</span></Show>
      </Portal>
      <div style={{ flex: '1 1 auto', 'min-height': 0, display: 'flex', 'flex-direction': 'column' }}>
        <Switch>
          <Match when={shell().kind === 'booting'}><div class="flex flex-1 items-center justify-center text-fg-muted">Loading…</div></Match>
          <Match when={shell().kind === 'picker' || shell().kind === 'loadingDoc'}>
            <DocumentPicker heading="Nylon documents" sources={sources()} onSelect={onSelect} loadingId={shell().kind === 'loadingDoc' ? sourceId() : null} />
          </Match>
          <Match when={shell().kind === 'mounted' && doc()}>
            <NylonCanvas doc={doc()!} revision={snapshot()!.revision} blocked={blocked()} onAction={dispatchAction} />
          </Match>
          <Match when={shell().kind === 'error'}>
            <div class="flex flex-1 flex-col items-center justify-center gap-4 text-fg">
              <div>Failed to list Nylon documents</div>
              <div class="text-sm text-fg-muted">{errorReason()}</div>
              <button onClick={boot} class="rounded bg-accent px-3 py-1 text-sm text-on-accent">Retry</button>
            </div>
          </Match>
        </Switch>
      </div>
      <ToastTray toasts={toasts()} onDismiss={(id) => setToasts((items) => items.filter((item) => item.id !== id))} />
    </>
  );
}
