import { For, onCleanup, type JSX } from 'solid-js';
import { MERINO_COLOR_TOKENS, type MerinoColorToken } from '@luminous/core/merino';
import { tokenVar } from './projection.ts';

export interface ColorSwatchGridProps {
  current: () => MerinoColorToken | undefined;
  onPreview: (token: MerinoColorToken | undefined) => void;
  onSelect: (token: MerinoColorToken) => void;
}

/** One swatch per Merino color token. Hover/focus previews without writing;
 * click commits. Mirrors Atlas's ColorSwatchGrid — `onCleanup` clears any live
 * preview when the submenu unmounts (Escape / outside-click dismiss). */
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
      <For each={MERINO_COLOR_TOKENS}>
        {(token) => {
          const selected = () => props.current() === token;
          return (
            <button
              type="button"
              aria-label={token}
              aria-pressed={selected()}
              class={`h-6 w-6 rounded ${
                selected()
                  ? 'outline outline-2 -outline-offset-2 outline-accent-subtle'
                  : 'border-border-subtle'
              }`}
              style={{ 'background-color': tokenVar(token), border: '1px solid' }}
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
