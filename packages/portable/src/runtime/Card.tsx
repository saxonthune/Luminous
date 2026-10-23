import { DiffBadge } from './DiffBadge.js';
import { createMemo, Show } from 'solid-js';
import { stopWheelIfScrollable } from '@luminous/cactus/runtime';
import type { PortableCard } from '../graph.js';

export function Card(props: { content: PortableCard; zoom: number; onMore?: (id: string, opener: HTMLAnchorElement) => void }) {
  const details = createMemo(() => props.zoom >= 0.6);
  return <div class="portable-card" classList={{ 'portable-card-summary': !details() }}>
    <div class="portable-card-heading" classList={{ 'portable-card-heading-diff': !!props.content.diff }}>
      <div class="portable-card-title" onWheel={stopWheelIfScrollable}>{props.content.title}</div>
      <Show when={props.content.diff}>{kind => <DiffBadge kind={kind()} />}</Show>
    </div>
    <Show when={!details() && !props.content.info && (props.content.body || props.content.footer)}>
      <span class="portable-card-disclosure" title="Zoom in to see details" aria-label="Zoom in to see details">…</span>
    </Show>
    <Show when={details()}>
      <Show when={props.content.body}><div class="portable-card-body" onWheel={stopWheelIfScrollable}>{props.content.body}</div></Show>
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
