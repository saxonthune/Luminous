import { createUniqueId, type JSX, type ParentProps } from 'solid-js';

/** A themed, non-modal surface for a titled group of controls. */
export function Panel(props: ParentProps<{ title: string; class?: string }>): JSX.Element {
  const titleId = createUniqueId();
  return <section class={`lui-panel${props.class ? ` ${props.class}` : ''}`} aria-labelledby={titleId}>
    <header class="lui-panel__header"><h2 id={titleId}>{props.title}</h2></header>
    <div class="lui-panel__body">{props.children}</div>
  </section>;
}
