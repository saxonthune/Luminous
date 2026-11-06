import { For } from 'solid-js';
import { stopWheelIfScrollable } from '@luminous/cactus/runtime';
import type { PortableCard } from '../graph.js';
import { Card } from './Card.js';
import { DiffBadge } from './DiffBadge.js';

export function SchemaCard(props: { content: PortableCard; zoom: number; onMore?: (id: string, opener: HTMLAnchorElement) => void; onField?: (name: string) => void; isOpen?: (name: string) => boolean; isFixed?: (name: string) => boolean }) {
  return <Card content={props.content} zoom={props.zoom} onMore={props.onMore} bodyContent={
    <div class="portable-schema-fields" onWheel={stopWheelIfScrollable}>
      {props.content.description && <div class="portable-schema-description">{props.content.description}</div>}
      <For each={props.content.fields}>{field => <div class="portable-schema-field">
        {field.schema && !props.isFixed?.(field.name) ? <button class="portable-schema-expand" aria-expanded={props.isOpen?.(field.name) ?? false} aria-label={`${props.isOpen?.(field.name) ? 'Hide' : 'Show'} ${field.type} definition`} onClick={() => props.onField?.(field.name)}>
          <span class="portable-schema-name">{field.name}{field.optional ? '?' : ''}</span><span class={`portable-schema-type portable-schema-${field.kind}`}>{field.type}</span><span aria-hidden="true">{props.isOpen?.(field.name) ? '−' : '+'}</span>
        </button> : <>
        <span class="portable-schema-name">{field.name}{field.optional ? '?' : ''}</span>
        <span class="portable-schema-field-end"><span class={`portable-schema-type portable-schema-${field.kind}`}>{field.type}</span></span></>}{field.diff && <DiffBadge kind={field.diff} />}
      </div>}</For>
    </div>
  } />;
}
