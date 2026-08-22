import { describe, it, expect, afterEach } from 'vitest';
import { render } from 'solid-js/web';
import { ATLAS_COLOR_TOKENS, type AtlasColorToken } from '@luminous/core/atlas';
import { ColorSwatchGrid } from '../ColorSwatchGrid';

let container: HTMLDivElement;
let dispose: (() => void) | undefined;

function mount(props: {
  current?: AtlasColorToken;
  onPreview: (token: AtlasColorToken | undefined) => void;
  onSelect: (token: AtlasColorToken) => void;
}): { swatches: HTMLButtonElement[] } {
  container = document.createElement('div');
  document.body.appendChild(container);
  dispose = render(
    () => (
      <ColorSwatchGrid current={() => props.current} onPreview={props.onPreview} onSelect={props.onSelect} />
    ),
    container,
  );
  return { swatches: Array.from(container.querySelectorAll('button')) };
}

afterEach(() => {
  dispose?.();
  container?.parentNode?.removeChild(container);
});

describe('ColorSwatchGrid', () => {
  it('renders one swatch per ATLAS_COLOR_TOKENS entry, laid out two rows tall', () => {
    const { swatches } = mount({ onPreview: () => {}, onSelect: () => {} });
    expect(swatches).toHaveLength(ATLAS_COLOR_TOKENS.length);
    expect(container.querySelector('div')?.style.getPropertyValue('grid-template-rows')).toBe('repeat(2, 1fr)');
  });

  it('previews the hovered token on mouseenter and clears it on mouseleave', () => {
    const previews: Array<AtlasColorToken | undefined> = [];
    const { swatches } = mount({ onPreview: (t) => previews.push(t), onSelect: () => {} });
    const first = swatches[0]!;
    first.dispatchEvent(new MouseEvent('mouseenter'));
    first.dispatchEvent(new MouseEvent('mouseleave'));
    expect(previews).toEqual([ATLAS_COLOR_TOKENS[0], undefined]);
  });

  it('previews on focus and clears on blur, so keyboard use matches mouse use', () => {
    const previews: Array<AtlasColorToken | undefined> = [];
    const { swatches } = mount({ onPreview: (t) => previews.push(t), onSelect: () => {} });
    const first = swatches[0]!;
    first.dispatchEvent(new FocusEvent('focus'));
    first.dispatchEvent(new FocusEvent('blur'));
    expect(previews).toEqual([ATLAS_COLOR_TOKENS[0], undefined]);
  });

  it('clicking a swatch selects it and never dispatches a preview-shaped write', () => {
    const selected: AtlasColorToken[] = [];
    const previews: Array<AtlasColorToken | undefined> = [];
    const { swatches } = mount({ onPreview: (t) => previews.push(t), onSelect: (t) => selected.push(t) });
    swatches[1]!.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    expect(selected).toEqual([ATLAS_COLOR_TOKENS[1]]);
    // A click alone (no prior hover/focus) previews nothing — onSelect is the
    // only handler that fires, confirming click and preview are separate paths.
    expect(previews).toEqual([]);
  });

  it('marks the current token as selected', () => {
    const { swatches } = mount({ current: ATLAS_COLOR_TOKENS[2], onPreview: () => {}, onSelect: () => {} });
    expect(swatches[2]!.getAttribute('aria-pressed')).toBe('true');
    expect(swatches[0]!.getAttribute('aria-pressed')).toBe('false');
  });

  it('previews undefined on unmount, so a dismissed menu never leaves a stale preview', () => {
    const previews: Array<AtlasColorToken | undefined> = [];
    mount({ onPreview: (t) => previews.push(t), onSelect: () => {} });
    dispose?.();
    dispose = undefined;
    expect(previews).toEqual([undefined]);
  });
});
