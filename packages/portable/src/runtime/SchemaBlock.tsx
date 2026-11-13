import { createSignal, For, Show } from 'solid-js';
import type { PortableCard } from '../graph.js';
import { SchemaCard } from './SchemaCard.js';

/** Document-flow presentation: shared field colors and disclosure, no canvas. */
export function SchemaBlock(props: { content: PortableCard }) {
  const [open, setOpen] = createSignal<ReadonlySet<string>>(new Set());
  const toggle = (name: string) => setOpen(previous => {
    const next = new Set(previous);
    if (next.has(name)) next.delete(name); else next.add(name);
    return next;
  });
  return <section class="portable-schema-block" aria-label={props.content.title}>
    <SchemaCard content={props.content} zoom={1} onField={toggle} isOpen={name => open().has(name)} />
    <For each={props.content.fields}>{field => <Show when={field.schema && open().has(field.name)}>
      <div class="portable-schema-nested"><SchemaBlock content={field.schema!} /></div>
    </Show>}</For>
  </section>;
}
