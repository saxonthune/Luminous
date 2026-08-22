import { For, Show, createSignal, type JSX } from 'solid-js';
import { ATLAS_COLOR_TOKENS, type AtlasColorToken, type AtlasLegend } from '@luminous/core/atlas';

export interface LegendOverlayProps {
  legend: () => AtlasLegend | undefined;
  onSave: (legend: AtlasLegend) => void;
}

function draftFrom(legend: AtlasLegend | undefined): Record<AtlasColorToken, string> {
  const draft = {} as Record<AtlasColorToken, string>;
  for (const token of ATLAS_COLOR_TOKENS) draft[token] = legend?.[token] ?? '';
  return draft;
}

function legendFrom(draft: Record<AtlasColorToken, string>): AtlasLegend {
  const legend: AtlasLegend = {};
  for (const token of ATLAS_COLOR_TOKENS) {
    const label = draft[token].trim();
    if (label !== '') legend[token] = label;
  }
  return legend;
}

function sameLegend(a: AtlasLegend, b: AtlasLegend): boolean {
  return ATLAS_COLOR_TOKENS.every((token) => (a[token] ?? '') === (b[token] ?? ''));
}

/** The info badge and the Legend panel it opens (doc01.07.04 R57-R66). The
 * panel floats over the canvas without blocking it (R59); view mode lists
 * every Color Token with its Label or a "No label" placeholder (R60, R66);
 * the pencil enters edit mode with one input per token plus Save and Cancel
 * (R62-R65). Save with no change just leaves edit mode — no history entry. */
export function LegendOverlay(props: LegendOverlayProps): JSX.Element {
  const [open, setOpen] = createSignal(false);
  const [editing, setEditing] = createSignal(false);
  const [draft, setDraft] = createSignal(draftFrom(undefined));

  function toggleOpen() {
    setEditing(false);
    setOpen((prev) => !prev);
  }

  function beginEdit() {
    setDraft(draftFrom(props.legend()));
    setEditing(true);
  }

  function save() {
    const next = legendFrom(draft());
    setEditing(false);
    if (sameLegend(next, props.legend() ?? {})) return;
    props.onSave(next);
  }

  return (
    <>
      <button
        type="button"
        aria-label="Legend"
        title="Legend"
        aria-expanded={open()}
        onClick={toggleOpen}
        class="absolute right-4 top-4 z-10 flex h-7 w-7 items-center justify-center rounded-full border border-border-subtle bg-surface font-serif text-sm italic text-fg-muted shadow-sm hover:text-fg"
      >
        i
      </button>
      <Show when={open()}>
        <div
          data-testid="legend-panel"
          class="absolute right-4 top-14 z-10 flex w-72 flex-col gap-2 rounded-lg border border-border-subtle bg-surface p-3 shadow-lg"
        >
          <div class="flex items-center justify-between">
            <span class="text-sm font-semibold text-fg">Legend</span>
            <div class="flex items-center gap-1">
              <Show when={!editing()}>
                <button
                  type="button"
                  aria-label="Edit Legend"
                  title="Edit Legend"
                  onClick={beginEdit}
                  class="rounded px-1.5 py-0.5 text-sm text-fg-muted hover:bg-surface-alt hover:text-fg"
                >
                  ✎
                </button>
              </Show>
              <button
                type="button"
                aria-label="Close Legend"
                title="Close Legend"
                onClick={toggleOpen}
                class="rounded px-1.5 py-0.5 text-sm text-fg-muted hover:bg-surface-alt hover:text-fg"
              >
                ×
              </button>
            </div>
          </div>
          <For each={ATLAS_COLOR_TOKENS}>
            {(token) => (
              <div class="flex items-center gap-2">
                <span
                  aria-hidden="true"
                  class="h-4 w-4 shrink-0 rounded border border-border-subtle"
                  style={{ 'background-color': `var(--color-atlas-${token})` }}
                />
                <Show
                  when={editing()}
                  fallback={
                    <Show
                      when={props.legend()?.[token]}
                      fallback={<span class="text-sm italic text-fg-subtle">No label</span>}
                    >
                      {(label) => <span class="text-sm text-fg">{label()}</span>}
                    </Show>
                  }
                >
                  <input
                    type="text"
                    aria-label={`Label for ${token}`}
                    value={draft()[token]}
                    onInput={(e) => setDraft((prev) => ({ ...prev, [token]: e.currentTarget.value }))}
                    class="min-w-0 flex-1 rounded border border-border-subtle bg-surface px-1.5 py-0.5 text-sm text-fg"
                  />
                </Show>
              </div>
            )}
          </For>
          <Show when={editing()}>
            <div class="flex justify-end gap-2 pt-1">
              <button
                type="button"
                onClick={() => setEditing(false)}
                class="rounded px-2 py-1 text-sm text-fg-muted hover:bg-surface-alt hover:text-fg"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={save}
                class="rounded bg-accent px-2 py-1 text-sm text-on-accent hover:bg-accent-hover"
              >
                Save
              </button>
            </div>
          </Show>
        </div>
      </Show>
    </>
  );
}
