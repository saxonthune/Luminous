import { Show } from 'solid-js';
import { diffStyles, type DiffKind } from '../diff.js';

export function DiffBadge(props: { kind: DiffKind }) {
  const definition = () => diffStyles[props.kind];
  const variables = () => {
    const style = definition();
    return {
      '--diff-fill': style.light.fill, '--diff-ink': style.light.ink,
      '--diff-dark-fill': style.dark.fill, '--diff-dark-ink': style.dark.ink,
      '--diff-remove': 'removed' in style.light ? style.light.removed : style.light.fill,
      '--diff-remove-ink': 'removedInk' in style.light ? style.light.removedInk : style.light.ink,
      '--diff-dark-remove': 'removed' in style.dark ? style.dark.removed : style.dark.fill,
      '--diff-dark-remove-ink': 'removedInk' in style.dark ? style.dark.removedInk : style.dark.ink,
    };
  };
  return <span class="portable-diff-badge" style={variables()} role="img" aria-label={definition().label} title={definition().label}>
    <Show when={props.kind === 'modified'} fallback={<Show when={props.kind === 'new'} fallback={<span aria-hidden="true">{definition().symbol}</span>}>
      <svg viewBox="0 0 24 24" width="55%" height="55%" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" aria-hidden="true"><path d="M12 5v14M5 12h14" /></svg>
    </Show>}>
      <span class="portable-diff-removed" aria-hidden="true">−</span><span aria-hidden="true">+</span>
    </Show>
  </span>;
}
