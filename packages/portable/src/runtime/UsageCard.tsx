import { createSignal, createUniqueId, For, onCleanup, onMount, Show } from 'solid-js';
import type { EndpointUse, PortableCard } from '../graph.js';
import { USAGE_CARD_MAX_HEIGHT } from '../usage.js';
import { Card } from './Card.js';

function UsageEndpoint(props: { row: EndpointUse }) {
  const [expanded, setExpanded] = createSignal(false);
  const id = createUniqueId();
  return <li>
    <button type="button" class="portable-usage-endpoint" aria-expanded={expanded()} aria-controls={id}
      onPointerDown={event => event.stopPropagation()}
      onClick={event => { event.stopPropagation(); setExpanded(value => !value); }}>
      <span class="portable-usage-verb">{props.row.method}</span><span>{props.row.endpoint}</span>
    </button>
    <Show when={expanded()}><div id={id} class="portable-usage-description">{props.row.description}</div></Show>
  </li>;
}

export function UsageCard(props: { content: PortableCard; zoom: number; onMore?: (id: string, opener: HTMLAnchorElement) => void }) {
  let scroller!: HTMLDivElement, content!: HTMLDivElement;
  const [above, setAbove] = createSignal(false), [below, setBelow] = createSignal(false);
  const updateOverflow = () => {
    setAbove(scroller.scrollTop > 1);
    setBelow(scroller.scrollHeight - scroller.clientHeight - scroller.scrollTop > 1);
  };
  onMount(() => {
    const observer = new ResizeObserver(updateOverflow);
    observer.observe(scroller);
    observer.observe(content);
    updateOverflow();
    onCleanup(() => observer.disconnect());
  });
  return <div class="portable-usage-card" style={{ 'max-height': `${USAGE_CARD_MAX_HEIGHT}px` }}>
    <Card content={props.content} zoom={props.zoom} onMore={props.onMore} bodyContent={
      <div class="portable-usage-frame">
        <div ref={scroller} class="portable-usage" on:wheel={event => event.stopPropagation()} onScroll={updateOverflow}>
          <div ref={content} class="portable-usage-content">
            <section class="portable-usage-route" aria-label="UI route">
              <h3>UI route</h3>
              <For each={props.content.usage!.uiRoute.paths}>{path => <code>{path}</code>}</For>
              <p>{props.content.usage!.uiRoute.context}</p>
            </section>
            <For each={['startup', 'capabilities'] as const}>{section =>
              <section>
                <h3>{section === 'startup' ? 'Startup' : 'Capabilities'}</h3>
                <Show when={props.content.usage![section].length} fallback={<span class="portable-usage-empty">—</span>}>
                  <ul><For each={props.content.usage![section]}>{row => <UsageEndpoint row={row} />}</For></ul>
                </Show>
              </section>
            }</For>
          </div>
        </div>
        <div class="portable-usage-scroll-hint" aria-label="Hidden usage content">
          <span class="portable-usage-scroll-arrow" style={{ visibility: above() ? 'visible' : 'hidden' }} aria-hidden="true">↑</span>
          <span style={{ visibility: above() || below() ? 'visible' : 'hidden' }}>Score for more</span>
          <span class="portable-usage-scroll-arrow" style={{ visibility: below() ? 'visible' : 'hidden' }} aria-hidden="true">↓</span>
        </div>
      </div>
    } />
  </div>;
}
