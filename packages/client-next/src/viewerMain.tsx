import { render } from 'solid-js/web';
import { createSignal, Show } from 'solid-js';
import './index.css';
import { staticPersistence, type Document } from './api';
import { defaultSchemas } from './schemas';
import { CanvasView } from './CanvasView';

function isDocumentV2(doc: unknown): doc is Document {
  return !!doc && typeof doc === 'object' && (doc as Document).version === 2;
}

function ViewerApp() {
  const params = new URLSearchParams(window.location.search);
  const src = params.get('src');

  const [doc, setDoc] = createSignal<Document | null>(null);
  const [loading, setLoading] = createSignal(true);
  const [error, setError] = createSignal<string | null>(null);

  if (!src) {
    return (
      <div class="flex h-screen items-center justify-center p-8 text-center">
        <div>
          <p class="text-lg font-medium text-[var(--text-primary)] mb-2">Missing <code>src</code> parameter</p>
          <p class="text-sm text-[var(--text-secondary)]">
            Expected URL format:{' '}
            <code>viewer.html?src=https://raw.githubusercontent.com/owner/repo/main/path/to/file.canvas.json</code>
          </p>
        </div>
      </div>
    );
  }

  // Kick off fetch immediately (outside reactive tracking)
  fetch(src)
    .then((res) => {
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return res.json();
    })
    .then((raw) => {
      if (!isDocumentV2(raw)) {
        setError('This canvas is in the v1 format or is not a valid Luminous canvas document.');
        setLoading(false);
        return;
      }
      const docWithDefaults: Document = {
        ...raw,
        schemas: { ...defaultSchemas, ...raw.schemas },
      };
      setDoc(docWithDefaults);
      setLoading(false);
    })
    .catch((err: unknown) => {
      console.error('[viewer] failed to fetch canvas:', src, err);
      setError(`Failed to load canvas: ${err instanceof Error ? err.message : String(err)}`);
      setLoading(false);
    });

  return (
    <Show
      when={!loading() && !error() && doc()}
      fallback={
        <div class="flex h-screen items-center justify-center">
          <Show when={loading()}>
            <p class="text-sm text-[var(--text-secondary)]">Loading…</p>
          </Show>
          <Show when={error()}>
            <p class="text-sm text-red-500">{error()}</p>
          </Show>
        </div>
      }
    >
      {(d) => <CanvasView initialDocument={d()} persistence={staticPersistence} />}
    </Show>
  );
}

const root = document.getElementById('root');
if (!root) throw new Error('No root element');
render(() => <ViewerApp />, root);
