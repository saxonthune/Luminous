import { For, Show } from 'solid-js';
import { Card } from './Card.js';
import type { PortableCard } from '../graph.js';
import { VisibilityToolbar } from './VisibilityToolbar.js';

/** Reuse Card's sections and source disclosure; only the method row is specialized. */
export function RestCard(props: { content: PortableCard; zoom: number; onMore?: (id: string, opener: HTMLAnchorElement) => void; descendantCount?: number; collapsed?: boolean; onToggle?: () => void; onChildrenOnly?: () => void; onToolbarActiveChange?: (active: boolean) => void }) {
  return <Card content={props.content} zoom={props.zoom} onMore={props.onMore} rest headerAction={
    <Show when={props.descendantCount}>
      <VisibilityToolbar title={props.content.title} collapsed={!!props.collapsed} descendantCount={props.descendantCount!}
        onToggle={() => props.onToggle?.()} onChildrenOnly={() => props.onChildrenOnly?.()}
        onActiveChange={props.onToolbarActiveChange} />
    </Show>
  } badgeRow={
    <Show when={props.content.methods?.length}>
      <div class="portable-rest-methods" role="list" aria-label="HTTP methods">
        <For each={props.content.methods}>{method => <span role="listitem" class={`portable-rest-method portable-rest-method-${method.toLowerCase()}`}>{method}</span>}</For>
      </div>
    </Show>
  } />;
}
