import { For, onCleanup, type JSX } from 'solid-js';
import { ATLAS_COLOR_TOKENS, type AtlasColorToken } from '@luminous/core/atlas';

export interface ColorSwatchGridProps {
  current: () => AtlasColorToken | undefined;
  onPreview: (token: AtlasColorToken | undefined) => void;
  onSelect: (token: AtlasColorToken) => void;
}

/**
 * The Color submenu's body: one swatch button per `ATLAS_COLOR_TOKENS` entry,
 * laid out two rows tall (R17) with the column count following the token
 * count. Hover/focus previews a token without writing the Document (R18);
 * click commits it. `onCleanup` previews `undefined` on unmount, which is the
 * safety net for the Escape/outside-click dismiss paths — Kobalte's dropdown
 * content unmounts on close, so this fires whenever this grid stops being on
 * screen for any reason other than a swatch pick (which already clears the
 * signal itself before dispatching).
 */
export function ColorSwatchGrid(props: ColorSwatchGridProps): JSX.Element {
  onCleanup(() => props.onPreview(undefined));

  return (
    <div
      style={{
        display: 'grid',
        'grid-template-rows': 'repeat(2, 1fr)',
        'grid-auto-flow': 'column',
        gap: '4px',
        padding: '4px',
      }}
    >
      <For each={ATLAS_COLOR_TOKENS}>
        {(token) => {
          const selected = () => props.current() === token;
          return (
            <button
              type="button"
              aria-label={token}
              aria-pressed={selected()}
              class={`h-6 w-6 rounded ${
                selected()
                  ? 'border-accent-subtle outline outline-2 -outline-offset-2 outline-accent-subtle'
                  : 'border-border-subtle'
              }`}
              style={{ 'background-color': `var(--color-atlas-${token})`, border: '1px solid' }}
              onMouseEnter={() => props.onPreview(token)}
              onMouseLeave={() => props.onPreview(undefined)}
              onFocus={() => props.onPreview(token)}
              onBlur={() => props.onPreview(undefined)}
              onClick={() => props.onSelect(token)}
            />
          );
        }}
      </For>
    </div>
  );
}
