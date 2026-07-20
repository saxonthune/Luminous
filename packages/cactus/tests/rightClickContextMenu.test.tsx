/**
 * Test: right-button click/drag disambiguation.
 *
 * The right button both pans (drag) and opens the context menu (click). The menu
 * is driven from pointer events — never from the `contextmenu` event, whose timing
 * is not portable. We assert the menu opens on a clean right-click (movement within
 * slop) and is suppressed on a right-drag, under both platform event orderings:
 * Chromium/Linux and macOS fire `contextmenu` on press; Firefox fires it on release.
 */
import { describe, it, expect, vi, beforeAll, afterEach } from 'vitest';
import { render } from 'solid-js/web';
import { Canvas } from '../src/Canvas';
import type { MenuSchema } from '../src/chrome/types';

beforeAll(() => {
  if (typeof PointerEvent === 'undefined') {
    class PointerEventPolyfill extends MouseEvent {
      constructor(type: string, params: PointerEventInit = {}) {
        super(type, params);
      }
    }
    (globalThis as Record<string, unknown>).PointerEvent = PointerEventPolyfill;
  }
});

const schema: MenuSchema = {
  id: 'bg',
  items: [{ type: 'action', action: { id: 'a', label: 'A' } }],
};

let cleanup: (() => void) | undefined;
afterEach(() => {
  cleanup?.();
  cleanup = undefined;
});

function mount() {
  const backgroundContextMenu = vi.fn(() => schema);
  const host = document.createElement('div');
  document.body.appendChild(host);
  cleanup = render(
    () => (
      <Canvas backgroundContextMenu={backgroundContextMenu}>
        <div />
      </Canvas>
    ),
    host
  );
  const surface = host.querySelector('[data-pan-surface]') as HTMLElement;
  return { backgroundContextMenu, surface };
}

function fire(el: EventTarget, type: string, button: number, x: number, y: number) {
  el.dispatchEvent(
    new MouseEvent(type, { bubbles: true, cancelable: true, button, clientX: x, clientY: y })
  );
}

const RIGHT = 2;

describe('right-button context menu vs. pan', () => {
  it('opens the menu on a clean right-click — Firefox order (contextmenu on release)', () => {
    const { backgroundContextMenu, surface } = mount();
    fire(surface, 'pointerdown', RIGHT, 100, 100);
    fire(surface, 'pointerup', RIGHT, 101, 100); // within slop
    fire(surface, 'contextmenu', RIGHT, 101, 100);
    expect(backgroundContextMenu).toHaveBeenCalledTimes(1);
  });

  it('opens the menu on a clean right-click — Chromium order (contextmenu on press)', () => {
    const { backgroundContextMenu, surface } = mount();
    fire(surface, 'pointerdown', RIGHT, 100, 100);
    fire(surface, 'contextmenu', RIGHT, 100, 100);
    fire(surface, 'pointerup', RIGHT, 101, 100); // within slop
    expect(backgroundContextMenu).toHaveBeenCalledTimes(1);
  });

  it('suppresses the menu on a right-drag — Firefox order', () => {
    const { backgroundContextMenu, surface } = mount();
    fire(surface, 'pointerdown', RIGHT, 100, 100);
    fire(surface, 'pointermove', RIGHT, 140, 100); // past slop
    fire(surface, 'pointerup', RIGHT, 140, 100);
    fire(surface, 'contextmenu', RIGHT, 140, 100);
    expect(backgroundContextMenu).not.toHaveBeenCalled();
  });

  it('suppresses the menu on a right-drag — Chromium order (contextmenu on press, before the drag is visible)', () => {
    const { backgroundContextMenu, surface } = mount();
    fire(surface, 'pointerdown', RIGHT, 100, 100);
    fire(surface, 'contextmenu', RIGHT, 100, 100); // fires before any movement
    fire(surface, 'pointermove', RIGHT, 140, 100); // past slop
    fire(surface, 'pointerup', RIGHT, 140, 100);
    expect(backgroundContextMenu).not.toHaveBeenCalled();
  });

  it('opens the menu on a bare contextmenu with no pointer gesture (keyboard menu key)', () => {
    const { backgroundContextMenu, surface } = mount();
    fire(surface, 'contextmenu', RIGHT, 100, 100);
    expect(backgroundContextMenu).toHaveBeenCalledTimes(1);
  });
});
