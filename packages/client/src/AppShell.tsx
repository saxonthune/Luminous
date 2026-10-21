import { createSignal, createEffect, onCleanup, onMount, ErrorBoundary, Suspense } from 'solid-js';
import { AppHeader } from './AppHeader';
import { APPS, createAppRegistry } from './apps/registry';
import { theme, cycleTheme, persistTheme } from './theme';
import { readParam, writeParam } from './urlState';

export function AppShell() {
  const [activeAppId, setActiveAppId] = createSignal(readParam('app') ?? 'canvas');
  const [apps, setApps] = createSignal(APPS);
  const [retryFailedApp, setRetryFailedApp] = createSignal<(() => void) | undefined>();

  function onSelectApp(id: string) {
    setActiveAppId(id);
    writeParam('app', id);
  }

  const activeApp = () => apps().find((a) => a.id === activeAppId()) ?? apps()[0];

  createEffect(() => persistTheme(theme()));

  document.title = 'Luminous';

  onMount(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'F2') {
        e.preventDefault();
        cycleTheme();
      }
    };
    window.addEventListener('keydown', onKey);
    onCleanup(() => window.removeEventListener('keydown', onKey));

    if (import.meta.hot) {
      const retryAfterUpdate = () => {
        const retry = retryFailedApp();
        if (!retry) return;
        setApps(createAppRegistry());
        setRetryFailedApp(undefined);
        retry();
      };
      import.meta.hot.on('vite:afterUpdate', retryAfterUpdate);
      onCleanup(() => import.meta.hot?.off('vite:afterUpdate', retryAfterUpdate));
    }
  });

  return (
    <div style={{ display: 'flex', 'flex-direction': 'column', width: '100vw', height: '100vh' }}>
      <AppHeader
        apps={apps()}
        activeAppId={activeAppId()}
        onSelectApp={onSelectApp}
        onCycleTheme={cycleTheme}
      />
      {(() => {
        const App = activeApp().component;
        return <Suspense fallback={<div role="status" class="flex min-h-0 flex-1 items-center justify-center text-sm text-fg-muted">Loading {activeApp().label}…</div>}>
          <ErrorBoundary fallback={(cause, reset) => {
            if (import.meta.env.DEV) console.error('[Luminous app error]', cause);
            setRetryFailedApp(() => reset);
            return <div role="alert" class="m-4 rounded border border-red-300 bg-red-50 p-4 text-sm text-red-900">
              <div class="font-semibold">{activeApp().label} failed to render.</div>
              <pre class="mt-2 whitespace-pre-wrap">{import.meta.env.DEV
                ? cause instanceof Error ? cause.stack ?? cause.message : String(cause)
                : 'Check the browser console for details.'}</pre>
              <button class="mt-3 underline" onClick={() => {
                setRetryFailedApp(undefined);
                reset();
              }}>Try again</button>
            </div>;
          }}><App /></ErrorBoundary>
        </Suspense>;
      })()}
    </div>
  );
}
