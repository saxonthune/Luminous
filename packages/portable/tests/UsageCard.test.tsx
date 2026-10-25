import { afterEach, expect, test, vi } from 'vitest';
import { render } from 'solid-js/web';
import { UsageCard } from '../src/runtime/UsageCard.js';

// Isolate Card's runtime helpers from unrelated Kobalte JSX modules.
vi.mock('@luminous/cactus/runtime', () => ({ stopWheelIfScrollable: vi.fn() }));

let dispose: (() => void) | undefined;
afterEach(() => { dispose?.(); document.body.replaceChildren(); vi.unstubAllGlobals(); });

test('pressing an endpoint toggles its explanation without starting a node drag', async () => {
  let resize: (() => void) | undefined;
  vi.stubGlobal('ResizeObserver', class {
    constructor(callback: () => void) { resize = callback; }
    observe() {}
    disconnect() {}
  });
  const host = document.createElement('div');
  document.body.append(host);
  const parentPress = vi.fn();
  dispose = render(() => <div onPointerDown={parentPress}><UsageCard zoom={1} content={{ component: 'usage-card', title: 'Library', usage: {
    uiRoute: { paths: ['/reading-buddy'], context: 'Library; no Book selected.' },
    startup: [{ method: 'GET', endpoint: '/books', description: 'Loads the documents shown in the Library.' }], capabilities: [],
  } }} /></div>, host);
  await Promise.resolve();
  const route = host.querySelector('[aria-label="UI route"]')!;
  expect(route.querySelector('code')?.textContent).toBe('/reading-buddy');
  expect(route.querySelector('p')?.textContent).toContain('no Book selected');
  const button = host.querySelector<HTMLButtonElement>('button')!;
  expect(button.getAttribute('aria-expanded')).toBe('false');
  button.dispatchEvent(new Event('pointerdown', { bubbles: true }));
  expect(parentPress).not.toHaveBeenCalled();
  button.click();
  expect(button.getAttribute('aria-expanded')).toBe('true');
  expect(host.querySelector('.portable-usage-description')?.textContent).toContain('Loads the documents');
  button.click();
  expect(host.querySelector('.portable-usage-description')).toBeNull();

  const scroller = host.querySelector<HTMLElement>('.portable-usage')!;
  Object.defineProperties(scroller, { scrollHeight: { value: 400, configurable: true }, clientHeight: { value: 100, configurable: true } });
  const canvasWheel = vi.fn();
  host.addEventListener('wheel', canvasWheel);
  // Wheel gestures stay in the body at both limits, including modified wheel.
  for (const scrollTop of [0, 150, 300]) {
    scroller.scrollTop = scrollTop;
    for (const deltaY of [-100, 100]) {
      for (const ctrlKey of [false, true]) {
        const wheel = new WheelEvent('wheel', { bubbles: true, cancelable: true, deltaY, ctrlKey });
        button.dispatchEvent(wheel);
        expect(wheel.defaultPrevented).toBe(false); // Preserve native body scrolling.
      }
    }
  }
  expect(canvasWheel).not.toHaveBeenCalled();
  host.dispatchEvent(new WheelEvent('wheel', { bubbles: true, deltaY: 100 }));
  expect(canvasWheel).toHaveBeenCalledOnce(); // Outside the body, the canvas still receives wheel.
  scroller.scrollTop = 0;
  resize!();
  const arrows = host.querySelectorAll<HTMLElement>('.portable-usage-scroll-arrow');
  expect(arrows[0].style.visibility).toBe('hidden');
  expect(arrows[1].style.visibility).toBe('visible');
  scroller.scrollTop = 150;
  scroller.dispatchEvent(new Event('scroll'));
  expect(arrows[0].style.visibility).toBe('visible');
  expect(arrows[1].style.visibility).toBe('visible');
  scroller.scrollTop = 300;
  scroller.dispatchEvent(new Event('scroll'));
  expect(arrows[0].style.visibility).toBe('visible');
  expect(arrows[1].style.visibility).toBe('hidden');
});
