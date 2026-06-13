import { For, Show, type JSX } from 'solid-js';
import type { ChromeSchema, ToolbarSchema } from './types.js';
import { Toolbar } from './ChromePrimitives.js';

interface ChromeSlotsProps {
  schema?: ChromeSchema;
  onAction?: (id: string, payload?: unknown) => void;
}

function SlotRow(props: {
  toolbars: ToolbarSchema[];
  style: JSX.CSSProperties;
  onAction?: (id: string, payload?: unknown) => void;
}): JSX.Element {
  return (
    <div
      data-no-pan="true"
      style={{
        position: 'absolute',
        display: 'flex',
        'flex-direction': 'row',
        gap: '4px',
        'z-index': '5',
        ...props.style,
      }}
    >
      <For each={props.toolbars}>
        {(tb) => <Toolbar schema={tb} onAction={props.onAction} />}
      </For>
    </div>
  );
}

function SlotColumn(props: {
  toolbars: ToolbarSchema[];
  style: JSX.CSSProperties;
  onAction?: (id: string, payload?: unknown) => void;
}): JSX.Element {
  return (
    <div
      data-no-pan="true"
      style={{
        position: 'absolute',
        display: 'flex',
        'flex-direction': 'column',
        gap: '4px',
        'z-index': '5',
        ...props.style,
      }}
    >
      <For each={props.toolbars}>
        {(tb) => <Toolbar schema={tb} onAction={props.onAction} />}
      </For>
    </div>
  );
}

export function ChromeSlots(props: ChromeSlotsProps): JSX.Element {
  return (
    <>
      <Show when={(props.schema?.top?.length ?? 0) > 0}>
        <SlotRow
          toolbars={props.schema!.top!}
          style={{ top: '8px', left: '50%', transform: 'translateX(-50%)' }}
          onAction={props.onAction}
        />
      </Show>

      <Show when={(props.schema?.left?.length ?? 0) > 0}>
        <SlotColumn
          toolbars={props.schema!.left!}
          style={{ top: '8px', left: '8px' }}
          onAction={props.onAction}
        />
      </Show>

      <Show when={(props.schema?.right?.length ?? 0) > 0}>
        <SlotColumn
          toolbars={props.schema!.right!}
          style={{ top: '8px', right: '8px' }}
          onAction={props.onAction}
        />
      </Show>

      <Show when={(props.schema?.bottom?.length ?? 0) > 0}>
        <SlotRow
          toolbars={props.schema!.bottom!}
          style={{ bottom: '8px', left: '50%', transform: 'translateX(-50%)' }}
          onAction={props.onAction}
        />
      </Show>
    </>
  );
}
