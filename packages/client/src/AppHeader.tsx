import { For, Show, createSignal } from 'solid-js';
import { Button } from './ui/Controls';
import { AnchoredMenu } from './ui/Menu';
import { theme, themeIcon } from './theme';
import { resetDemoState } from './sources/staticSources';
import type { LuminousApp } from './apps/registry';

interface AppHeaderProps {
  apps: LuminousApp[];
  activeAppId: string;
  onSelectApp: (id: string) => void;
  onCycleTheme: () => void;
}

export function AppHeader(props: AppHeaderProps) {
  let resetButton: HTMLButtonElement | undefined;
  const [confirmReset, setConfirmReset] = createSignal(false);
  const [resetting, setResetting] = createSignal(false);
  const [resetError, setResetError] = createSignal('');
  async function resetDemo() {
    if (resetting()) return;
    setResetting(true);
    setResetError('');
    try {
      await resetDemoState();
      // A browser-created project may no longer exist after reset.
      const url = new URL(window.location.href);
      url.searchParams.delete('src');
      window.location.replace(url.href);
    } catch (error) {
      setResetError(error instanceof Error ? error.message : 'Could not reset demo state');
      setResetting(false);
    }
  }

  return (
    <header
      class="relative z-30 flex items-center justify-between border-b border-border-subtle bg-surface px-4"
      style={{ height: '44px', 'flex-shrink': 0 }}
    >
      <div class="flex items-center gap-3">
        <span class="text-sm font-semibold text-fg">Luminous</span>
        <For each={props.apps}>
          {(app) => (
            <button
              onClick={() => props.onSelectApp(app.id)}
              class={
                'rounded px-2 py-1 text-sm hover:bg-surface-alt ' +
                (app.id === props.activeAppId ? 'bg-surface-alt text-fg' : 'text-fg-muted')
              }
            >
              {app.label}
            </button>
          )}
        </For>
        <Show when={__STATIC__}>
          <a href="/portable/" class="rounded px-2 py-1 text-sm text-fg-muted hover:bg-surface-alt hover:text-fg">Portable</a>
        </Show>
        <span id="app-header-left" class="flex items-center gap-3" />
      </div>
      <div class="flex items-center gap-1">
        <span id="app-header-right" class="flex items-center gap-1" />
        <button
          onClick={() => props.onCycleTheme()}
          class="flex h-9 w-9 items-center justify-center rounded text-2xl leading-none text-fg-muted hover:bg-surface-alt hover:text-fg"
          aria-label={`Theme: ${theme()}. Cycle theme`}
          title={`Theme: ${theme()} (F2 to cycle)`}
        >
          <span aria-hidden="true">{themeIcon(theme())}</span>
        </button>
        <Show when={__STATIC__}>
          <Button ref={resetButton} tone="danger-primary" aria-haspopup="dialog" aria-expanded={confirmReset()}
            onClick={() => setConfirmReset((open) => !open)} disabled={resetting()}
            title="Discard locally saved demo projects and view state, then reload the bundled examples">
            {resetting() ? 'Resetting…' : 'Reset Demo State'}
          </Button>
          <Show when={confirmReset()}>
            <ResetDemoConfirmation anchor={resetButton} resetting={resetting()} onConfirm={() => void resetDemo()}
              onClose={() => setConfirmReset(false)} />
          </Show>
          <Show when={resetError()}><span role="alert" class="text-sm text-fg">{resetError()}</span></Show>
        </Show>
      </div>
    </header>
  );
}

function ResetDemoConfirmation(props: {
  anchor: HTMLButtonElement | undefined;
  resetting: boolean;
  onConfirm: () => void;
  onClose: () => void;
}) {
  return <AnchoredMenu anchor={props.anchor} label="Reset Demo State" role="dialog" side="bottom" alignRight initialFocus onClose={props.onClose}>
    <div class="max-w-xs space-y-3 p-3">
      <p class="text-sm text-fg">Discard locally saved demo projects and view state?</p>
      <div class="flex justify-end gap-2">
        <Button onClick={props.onClose}>Cancel</Button>
        <Button tone="danger-primary" disabled={props.resetting} onClick={props.onConfirm}>
          {props.resetting ? 'Resetting…' : 'Confirm Reset'}
        </Button>
      </div>
    </div>
  </AnchoredMenu>;
}
