import { For } from 'solid-js';
import { theme, themeIcon } from './theme';
import type { LuminousApp } from './apps/registry';

interface AppHeaderProps {
  apps: LuminousApp[];
  activeAppId: string;
  onSelectApp: (id: string) => void;
  onCycleTheme: () => void;
}

export function AppHeader(props: AppHeaderProps) {
  return (
    <header
      class="flex items-center justify-between border-b border-border-subtle bg-surface px-4"
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
        <span id="app-header-left" class="flex items-center gap-3" />
      </div>
      <div class="flex items-center gap-1">
        <span id="app-header-right" class="flex items-center gap-1" />
        <button
          onClick={() => props.onCycleTheme()}
          class="rounded px-2 py-1 text-base text-fg-muted hover:bg-surface-alt hover:text-fg"
          title={`Theme: ${theme()} (F2 to cycle)`}
        >
          {themeIcon(theme())}
        </button>
      </div>
    </header>
  );
}
