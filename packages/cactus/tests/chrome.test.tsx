import { describe, it, expect, vi, afterEach } from 'vitest';
import { render } from 'solid-js/web';
import type { ChromeSchema, ToolbarSchema } from '../src/chrome/types';
import { ChromeSlots } from '../src/chrome/ChromeSlots';
import { Toolbar } from '../src/chrome/ChromePrimitives';

function renderInto(ui: () => unknown): { container: HTMLElement; cleanup: () => void } {
  const container = document.createElement('div');
  document.body.appendChild(container);
  const cleanup = render(ui as () => import('solid-js').JSX.Element, container);
  return { container, cleanup };
}

afterEach(() => {
  document.body.innerHTML = '';
});

describe('Toolbar — button control', () => {
  it('renders a button with the action label', () => {
    const schema: ToolbarSchema = {
      id: 'test',
      controls: [
        { type: 'button', action: { id: 'TEST.ACT', label: 'Do it' } },
      ],
    };
    const { container, cleanup } = renderInto(() => <Toolbar schema={schema} />);
    const btn = container.querySelector('.cactus-chrome-btn') as HTMLButtonElement;
    expect(btn).not.toBeNull();
    expect(btn.textContent).toBe('Do it');
    cleanup();
  });

  it('fires onAction with correct id and payload on click', () => {
    const onAction = vi.fn();
    const schema: ToolbarSchema = {
      id: 'test',
      controls: [
        { type: 'button', action: { id: 'LAYOUT.FIT', label: 'Fit', payload: { extra: 1 } } },
      ],
    };
    const { container, cleanup } = renderInto(() => <Toolbar schema={schema} onAction={onAction} />);
    const btn = container.querySelector('.cactus-chrome-btn') as HTMLButtonElement;
    btn.click();
    expect(onAction).toHaveBeenCalledWith('LAYOUT.FIT', { extra: 1 });
    cleanup();
  });

  it('does not fire onAction when disabled', () => {
    const onAction = vi.fn();
    const schema: ToolbarSchema = {
      id: 'test',
      controls: [
        { type: 'button', action: { id: 'TEST.ACT', label: 'Nope', enabled: false } },
      ],
    };
    const { container, cleanup } = renderInto(() => <Toolbar schema={schema} onAction={onAction} />);
    const btn = container.querySelector('.cactus-chrome-btn') as HTMLButtonElement;
    expect(btn.disabled).toBe(true);
    cleanup();
  });
});

describe('Toolbar — separator and spacer controls', () => {
  it('renders a separator', () => {
    const schema: ToolbarSchema = {
      id: 'test',
      controls: [{ type: 'separator' }],
    };
    const { container, cleanup } = renderInto(() => <Toolbar schema={schema} />);
    const sep = container.querySelector('.cactus-chrome-sep');
    expect(sep).not.toBeNull();
    cleanup();
  });

  it('renders a spacer', () => {
    const schema: ToolbarSchema = {
      id: 'test',
      controls: [{ type: 'spacer' }],
    };
    const { container, cleanup } = renderInto(() => <Toolbar schema={schema} />);
    const spacer = container.querySelector('.cactus-chrome-spacer');
    expect(spacer).not.toBeNull();
    cleanup();
  });
});

describe('Toolbar — toggle-group control', () => {
  it('renders items for each action', () => {
    const schema: ToolbarSchema = {
      id: 'test',
      controls: [
        {
          type: 'toggle-group',
          actions: [
            { id: 'VIEW.SET', label: 'Concepts', selected: true, payload: { viewId: 'v1' } },
            { id: 'VIEW.SET', label: 'Relations', selected: false, payload: { viewId: 'v2' } },
          ],
        },
      ],
    };
    const { container, cleanup } = renderInto(() => <Toolbar schema={schema} />);
    const group = container.querySelector('.cactus-chrome-toggle-group');
    expect(group).not.toBeNull();
    const items = container.querySelectorAll('.cactus-chrome-toggle-item');
    expect(items.length).toBe(2);
    cleanup();
  });
});

describe('Toolbar — toggle-set control', () => {
  it('renders a toggle-set with items for each action', () => {
    const schema: ToolbarSchema = {
      id: 'test',
      controls: [
        {
          type: 'toggle-set',
          actions: [
            { id: 'LAYER.TOGGLE', label: 'Layer A', selected: true, payload: { layerId: 'l1' } },
            { id: 'LAYER.TOGGLE', label: 'Layer B', selected: false, payload: { layerId: 'l2' } },
          ],
        },
      ],
    };
    const { container, cleanup } = renderInto(() => <Toolbar schema={schema} />);
    const set = container.querySelector('.cactus-chrome-toggle-set');
    expect(set).not.toBeNull();
    const items = container.querySelectorAll('.cactus-chrome-toggle-item');
    expect(items.length).toBe(2);
    cleanup();
  });
});

describe('ChromeSlots', () => {
  it('renders toolbars in top/left/right/bottom slots', () => {
    const tb = (id: string): ToolbarSchema => ({
      id,
      controls: [{ type: 'button', action: { id: 'X', label: id } }],
    });
    const schema: ChromeSchema = {
      top: [tb('top-tb')],
      left: [tb('left-tb')],
      right: [tb('right-tb')],
      bottom: [tb('bottom-tb')],
    };
    const { container, cleanup } = renderInto(() => <ChromeSlots schema={schema} />);
    const toolbars = container.querySelectorAll('.cactus-chrome-toolbar');
    expect(toolbars.length).toBe(4);
    cleanup();
  });

  it('renders nothing when schema is undefined', () => {
    const { container, cleanup } = renderInto(() => <ChromeSlots />);
    expect(container.children.length).toBe(0);
    cleanup();
  });
});
