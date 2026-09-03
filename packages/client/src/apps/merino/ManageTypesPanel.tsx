import { For, Show, type JSX } from 'solid-js';
import {
  MERINO_COLOR_TOKENS,
  MERINO_DASHES,
  type MerinoColorToken,
  type MerinoContainerLayout,
  type MerinoDash,
  type MerinoDocument,
} from '@luminous/core/merino';
import { tokenVar } from './projection.ts';

export interface ManageTypesPanelProps {
  doc: () => MerinoDocument;
  onSetNodeType: (id: string, patch: { name?: string; color?: MerinoColorToken; layout?: MerinoContainerLayout }) => void;
  onRemoveNodeType: (id: string) => void;
  onAddNodeType: () => void;
  onSetEdgeType: (id: string, patch: { name?: string; color?: MerinoColorToken; dash?: MerinoDash; arrowHead?: boolean; directed?: boolean }) => void;
  onRemoveEdgeType: (id: string) => void;
  onAddEdgeType: () => void;
  onClose: () => void;
}

function SwatchRow(props: { current: MerinoColorToken; onSelect: (t: MerinoColorToken) => void }): JSX.Element {
  return (
    <div style={{ display: 'flex', gap: '3px' }}>
      <For each={MERINO_COLOR_TOKENS}>
        {(token) => (
          <button
            type="button"
            aria-label={token}
            class="h-5 w-5 rounded"
            style={{
              'background-color': tokenVar(token),
              border: '1px solid',
              'border-color': props.current === token ? 'var(--fg)' : 'var(--border)',
              outline: props.current === token ? '2px solid var(--accent)' : 'none',
              'outline-offset': '1px',
            }}
            onClick={() => props.onSelect(token)}
          />
        )}
      </For>
    </div>
  );
}

export function ManageTypesPanel(props: ManageTypesPanelProps): JSX.Element {
  return (
    <div
      class="absolute inset-0 z-30 flex items-center justify-center"
      style={{ background: 'rgba(0,0,0,0.35)' }}
      onClick={() => props.onClose()}
    >
      <div
        class="flex max-h-[80%] w-[560px] max-w-[90%] flex-col overflow-hidden rounded-lg border border-border bg-surface shadow-lg"
        onClick={(e) => e.stopPropagation()}
      >
        <div class="flex items-center justify-between border-b border-border px-4 py-3">
          <span class="text-sm font-semibold text-fg">Manage types</span>
          <button class="rounded px-2 py-1 text-sm text-fg-muted hover:bg-surface-alt hover:text-fg" onClick={() => props.onClose()}>
            Close
          </button>
        </div>

        <div class="flex-1 overflow-auto px-4 py-3">
          <div class="mb-2 text-xs font-semibold uppercase tracking-wide text-fg-subtle">Node types</div>
          <For each={props.doc().nodeTypes}>
            {(t) => (
              <div class="mb-2 flex flex-wrap items-center gap-2">
                <input
                  class="w-32 rounded border border-border bg-canvas px-2 py-1 text-sm text-fg"
                  value={t.name}
                  onChange={(e) => props.onSetNodeType(t.id, { name: e.currentTarget.value })}
                />
                <SwatchRow current={t.color} onSelect={(color) => props.onSetNodeType(t.id, { color })} />
                <label class="flex items-center gap-1 text-xs text-fg-muted" title="A Container Node holds its children inside its box — freely placed, or as a vertical ordered list">
                  holds
                  <select
                    class="rounded border border-border bg-canvas px-1 py-1 text-xs text-fg"
                    value={t.layout ?? 'none'}
                    onChange={(e) => {
                      const v = e.currentTarget.value;
                      props.onSetNodeType(t.id, { layout: v === 'none' ? undefined : (v as MerinoContainerLayout) });
                    }}
                  >
                    <option value="none">nothing</option>
                    <option value="container">a container</option>
                    <option value="list">a list</option>
                  </select>
                </label>
                <button
                  class="ml-auto rounded px-2 py-1 text-xs text-fg-muted hover:bg-surface-alt hover:text-danger"
                  onClick={() => props.onRemoveNodeType(t.id)}
                >
                  Remove
                </button>
              </div>
            )}
          </For>
          <button class="mt-1 rounded border border-border px-2 py-1 text-xs text-fg-muted hover:bg-surface-alt hover:text-fg" onClick={() => props.onAddNodeType()}>
            + Add node type
          </button>

          <div class="mb-2 mt-5 text-xs font-semibold uppercase tracking-wide text-fg-subtle">Edge types</div>
          <For each={props.doc().edgeTypes}>
            {(t) => (
              <div class="mb-2 flex flex-wrap items-center gap-2">
                <input
                  class="w-28 rounded border border-border bg-canvas px-2 py-1 text-sm text-fg"
                  value={t.name}
                  onChange={(e) => props.onSetEdgeType(t.id, { name: e.currentTarget.value })}
                />
                <SwatchRow current={t.color} onSelect={(color) => props.onSetEdgeType(t.id, { color })} />
                <select
                  class="rounded border border-border bg-canvas px-1 py-1 text-xs text-fg"
                  value={t.dash}
                  onChange={(e) => props.onSetEdgeType(t.id, { dash: e.currentTarget.value as MerinoDash })}
                >
                  <For each={MERINO_DASHES}>{(d) => <option value={d}>{d}</option>}</For>
                </select>
                <label class="flex items-center gap-1 text-xs text-fg-muted">
                  <input type="checkbox" checked={t.arrowHead} onChange={(e) => props.onSetEdgeType(t.id, { arrowHead: e.currentTarget.checked })} />
                  arrow
                </label>
                <label class="flex items-center gap-1 text-xs text-fg-muted">
                  <input type="checkbox" checked={t.directed} onChange={(e) => props.onSetEdgeType(t.id, { directed: e.currentTarget.checked })} />
                  directed
                </label>
                <button
                  class="ml-auto rounded px-2 py-1 text-xs text-fg-muted hover:bg-surface-alt hover:text-danger"
                  onClick={() => props.onRemoveEdgeType(t.id)}
                >
                  Remove
                </button>
              </div>
            )}
          </For>
          <button class="mt-1 rounded border border-border px-2 py-1 text-xs text-fg-muted hover:bg-surface-alt hover:text-fg" onClick={() => props.onAddEdgeType()}>
            + Add edge type
          </button>

          <Show when={props.doc().nodeTypes.length === 0 && props.doc().edgeTypes.length === 0}>
            <p class="mt-3 text-xs text-fg-subtle">No types yet.</p>
          </Show>
        </div>
      </div>
    </div>
  );
}
