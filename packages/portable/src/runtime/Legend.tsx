import { DiffBadge } from './DiffBadge.js';
import { diffStyles } from '../diff.js';
import { createMemo, createSignal, createUniqueId, For, Show } from 'solid-js';
import type { PortableDiagram, PortableTheme } from '../graph.js';

/** Explicitly declared canvas overlay; each mounted canvas owns its state. */
export function Legend(props: {
  definition: NonNullable<PortableDiagram['settings']>['legend'];
  palette?: PortableTheme;
  theme: 'ground' | 'light' | 'dark';
}) {
  const [minimized, setMinimized] = createSignal(false);
  const bodyId = createUniqueId();
  const entries = createMemo(() => props.definition?.entries ?? []);
  return <Show when={entries().length > 0}>
    <aside class="portable-legend" aria-label="Diagram legend"
      onPointerDown={event => event.stopPropagation()}
      onKeyDown={event => { if (event.key !== 'Escape') event.stopPropagation(); }}>
      <div class="portable-legend-header">
        <strong>Legend</strong>
        <button type="button" aria-expanded={!minimized()} aria-controls={bodyId}
          aria-label={minimized() ? 'Expand legend' : 'Minimize legend'}
          onClick={() => setMinimized(value => !value)}>{minimized() ? '+' : '−'}</button>
      </div>
      <ul id={bodyId} hidden={minimized()}>
        <For each={entries()}>{entry => {
          const kind = () => 'diff' in entry ? entry.diff : undefined;
          const style = () => 'class' in entry ? props.palette?.styles[entry.class] : undefined;
          const colors = () => props.theme === 'dark' ? style()?.dark : style()?.light;
          const label = () => entry.label ?? (kind() ? diffStyles[kind()!].label : style()?.label);
          return <li><Show when={kind()} fallback={<span class="portable-legend-swatch" aria-hidden="true"
            style={{ background: colors()?.fill, 'border-color': colors()?.stroke }} />}>
            {value => <DiffBadge kind={value()} />}
          </Show><span>{label()}</span></li>;
        }}</For>
      </ul>
    </aside>
  </Show>;
}
