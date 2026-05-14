import { Show } from 'solid-js';
import { theme, themeIcon } from './theme';

interface AppHeaderProps {
  sourceLabel?: string | null;
  showBack: boolean;
  onBack: () => void;
  onCycleTheme: () => void;
}

export function AppHeader(props: AppHeaderProps) {
  return (
    <header
      class="flex items-center justify-between border-b border-border-subtle bg-surface px-4"
      style={{ height: '44px', 'flex-shrink': 0 }}
    >
      <div class="flex items-center gap-3">
        <Show when={props.showBack}>
          <button
            onClick={props.onBack}
            class="rounded px-2 py-1 text-sm text-fg-muted hover:bg-surface-alt hover:text-fg"
            title="Back to canvases"
          >
            ← Back
          </button>
        </Show>
        <span class="text-sm font-semibold text-fg">Luminous</span>
        <Show when={props.sourceLabel}>
          <span class="text-sm text-fg-muted">·</span>
          <span class="text-sm text-fg-muted">{props.sourceLabel}</span>
        </Show>
      </div>
      <button
        onClick={props.onCycleTheme}
        class="rounded px-2 py-1 text-base text-fg-muted hover:bg-surface-alt hover:text-fg"
        title={`Theme: ${theme()} (F2 to cycle)`}
      >
        {themeIcon(theme())}
      </button>
    </header>
  );
}
