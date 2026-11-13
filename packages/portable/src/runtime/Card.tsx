import { DiffBadge } from './DiffBadge.js';
import { createMemo, For, Show, type JSX } from 'solid-js';
import { stopWheelIfScrollable } from '@luminous/cactus/runtime';
import type { PortableCard } from '../graph.js';

export function Card(props: { content: PortableCard; zoom: number; onMore?: (id: string, opener: HTMLAnchorElement) => void; badgeRow?: JSX.Element; headerAction?: JSX.Element; rest?: boolean; bodyContent?: JSX.Element }) {
  const bodyContent = createMemo(() => props.bodyContent);
  const details = createMemo(() => props.zoom >= 0.6);
  return <div class="portable-card" classList={{ 'portable-card-summary': !details(), 'portable-rest-card': props.rest }}>
    <div class="portable-card-heading" classList={{ 'portable-card-heading-diff': !!props.content.diff }}>
      <div class="portable-card-title" onWheel={stopWheelIfScrollable}>{props.content.title}</div>
      <Show when={props.content.diff}>{kind => <DiffBadge kind={kind()} />}</Show>
      {props.headerAction}
    </div>
    <Show when={props.content.badges?.length}>
      <div class="portable-object-badges" aria-label="Component status">
        <For each={props.content.badges}>{badge => <span class="portable-object-badge">{badge}</span>}</For>
      </div>
    </Show>
    {props.badgeRow}
    <Show when={!details() && !props.content.info && (props.content.body || props.content.footer)}>
      <span class="portable-card-disclosure" title="Zoom in to see details" aria-label="Zoom in to see details">…</span>
    </Show>
    <Show when={details()}>
      <Show when={props.content.modifiers?.length}>
        <div class="portable-modifier-sections" onWheel={stopWheelIfScrollable}>
          <For each={props.content.modifiers}>{modifier => <section class="portable-modifier-section">
            <div class="portable-modifier-name">{modifier.name}</div>
            <dl><For each={modifier.parameters}>{parameter => <div class="portable-modifier-row"><dt>{parameter.name}</dt><dd>{parameter.value}</dd></div>}</For></dl>
          </section>}</For>
        </div>
      </Show>
      <Show when={bodyContent()}>{bodyContent()}</Show>
      <Show when={!bodyContent() && props.content.body}><div class="portable-card-body" onWheel={stopWheelIfScrollable}>{props.content.body}</div></Show>
    </Show>
    <Show when={props.content.info || details() && props.content.footer}>
      <div class="portable-card-footer" classList={{ 'portable-card-footer-summary': !details() }} onWheel={stopWheelIfScrollable}>
        <Show when={details() && props.content.footer}>{footer =>
          <Show when={footer().href} fallback={footer().text}>{href =>
            <a href={href()} onPointerDown={event => event.stopPropagation()} onClick={event => event.stopPropagation()}>{footer().text}</a>
          }</Show>
        }</Show>
        <Show when={props.content.info}>{id => <a class="portable-card-more" href={`#extended-info-${encodeURIComponent(id())}`}
          aria-label={`More about ${props.content.title}`} onPointerDown={event => event.stopPropagation()}
          onClick={event => { event.preventDefault(); event.stopPropagation(); props.onMore?.(id(), event.currentTarget); }}>[more]</a>}</Show>
      </div>
    </Show>
  </div>;
}
