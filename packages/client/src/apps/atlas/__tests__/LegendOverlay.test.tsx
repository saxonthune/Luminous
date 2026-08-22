import { describe, it, expect, vi, afterEach } from 'vitest';
import { render } from 'solid-js/web';
import { ATLAS_COLOR_TOKENS, type AtlasLegend } from '@luminous/core/atlas';
import { LegendOverlay } from '../LegendOverlay.tsx';

describe('LegendOverlay (doc01.07.04 R57-R66)', () => {
  let container: HTMLDivElement;
  let dispose: (() => void) | undefined;

  function mount(legend: AtlasLegend | undefined) {
    const onSave = vi.fn();
    container = document.createElement('div');
    document.body.appendChild(container);
    dispose = render(() => <LegendOverlay legend={() => legend} onSave={onSave} />, container);
    return { onSave };
  }

  afterEach(() => {
    dispose?.();
    container?.parentNode?.removeChild(container);
  });

  function click(selector: string) {
    const el = container.querySelector(selector) as HTMLElement;
    el.dispatchEvent(new MouseEvent('click', { bubbles: true }));
  }

  const panel = () => container.querySelector('[data-testid="legend-panel"]');

  it('R57/R58: the info control opens the panel, and again closes it', () => {
    mount(undefined);
    expect(panel()).toBeNull();
    click('[aria-label="Legend"]');
    expect(panel()).toBeTruthy();
    click('[aria-label="Legend"]');
    expect(panel()).toBeNull();
  });

  it('R58: the close control closes the panel', () => {
    mount(undefined);
    click('[aria-label="Legend"]');
    click('[aria-label="Close Legend"]');
    expect(panel()).toBeNull();
  });

  it('R60/R66: shows every Color Token, labeled ones by Label and the rest as "No label"', () => {
    mount({ 'accent-1': 'user-facing interface' });
    click('[aria-label="Legend"]');
    const text = panel()!.textContent!;
    expect(text).toContain('user-facing interface');
    const noLabelRows = [...panel()!.querySelectorAll('span')].filter((s) => s.textContent === 'No label');
    expect(noLabelRows).toHaveLength(ATLAS_COLOR_TOKENS.length - 1);
  });

  it('R62/R63: the edit control turns the Labels into one input per Color Token, seeded from the Legend', () => {
    mount({ 'accent-2': 'data store' });
    click('[aria-label="Legend"]');
    click('[aria-label="Edit Legend"]');
    const inputs = panel()!.querySelectorAll('input');
    expect(inputs).toHaveLength(ATLAS_COLOR_TOKENS.length);
    const input = panel()!.querySelector('[aria-label="Label for accent-2"]') as HTMLInputElement;
    expect(input.value).toBe('data store');
  });

  it('R64: Save passes the edited Labels, dropping blank ones, and leaves edit mode', () => {
    const { onSave } = mount({ 'accent-1': 'old', 'accent-2': 'data store' });
    click('[aria-label="Legend"]');
    click('[aria-label="Edit Legend"]');
    const first = panel()!.querySelector('[aria-label="Label for accent-1"]') as HTMLInputElement;
    first.value = '  ';
    first.dispatchEvent(new InputEvent('input', { bubbles: true }));
    const third = panel()!.querySelector('[aria-label="Label for accent-3"]') as HTMLInputElement;
    third.value = 'external service';
    third.dispatchEvent(new InputEvent('input', { bubbles: true }));

    const save = [...panel()!.querySelectorAll('button')].find((b) => b.textContent === 'Save')!;
    save.dispatchEvent(new MouseEvent('click', { bubbles: true }));

    expect(onSave).toHaveBeenCalledWith({ 'accent-2': 'data store', 'accent-3': 'external service' });
    expect(panel()!.querySelectorAll('input')).toHaveLength(0);
  });

  it('R64: Save with nothing changed leaves edit mode without saving', () => {
    const { onSave } = mount({ 'accent-1': 'kept' });
    click('[aria-label="Legend"]');
    click('[aria-label="Edit Legend"]');
    const save = [...panel()!.querySelectorAll('button')].find((b) => b.textContent === 'Save')!;
    save.dispatchEvent(new MouseEvent('click', { bubbles: true }));

    expect(onSave).not.toHaveBeenCalled();
    expect(panel()!.querySelectorAll('input')).toHaveLength(0);
  });

  it('R65: Cancel discards the edits and leaves edit mode', () => {
    const { onSave } = mount({ 'accent-1': 'kept' });
    click('[aria-label="Legend"]');
    click('[aria-label="Edit Legend"]');
    const input = panel()!.querySelector('[aria-label="Label for accent-1"]') as HTMLInputElement;
    input.value = 'discarded';
    input.dispatchEvent(new InputEvent('input', { bubbles: true }));

    const cancel = [...panel()!.querySelectorAll('button')].find((b) => b.textContent === 'Cancel')!;
    cancel.dispatchEvent(new MouseEvent('click', { bubbles: true }));

    expect(onSave).not.toHaveBeenCalled();
    expect(panel()!.textContent).toContain('kept');
    expect(panel()!.querySelectorAll('input')).toHaveLength(0);
  });
});
