import { afterEach, expect, it, vi } from 'vitest';
import { render } from 'solid-js/web';
import { NylonTabs } from '../NylonTabs.tsx';
import { readNylonTabSession } from '../tabSession.ts';
let dispose: (() => void) | undefined;
let host: HTMLDivElement;
afterEach(() => { dispose?.(); host?.remove(); sessionStorage.clear(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });
it.each(['modifier', 'box'])('retains a %s multi-selection while dragging in a focused Standard View', (method) => {
  vi.stubGlobal('ResizeObserver', class { observe() {} unobserve() {} disconnect() {} });
  vi.spyOn(Element.prototype, 'getBoundingClientRect').mockReturnValue({
    x: 0, y: 0, left: 0, top: 0, right: 1000, bottom: 800, width: 1000, height: 800, toJSON() {},
  });
  const onAction = vi.fn(() => true);
  host = document.createElement('div'); document.body.appendChild(host);
  dispose = render(() => <NylonTabs sourceId="multi" revision="r1" blocked={false} onAction={onAction}
    doc={{ v: 1, transformations: [{ id: 'parent', name: 'Parent' },
      { id: 'a', name: 'A', parent: 'parent', x: 42, y: 80 },
      { id: 'b', name: 'B', parent: 'parent', x: 400, y: 80 }], contracts: [], arcs: [] }} />, host);
  host.querySelector<HTMLButtonElement>('[aria-label="Open contents of Parent"]')!.click();
  const node = (id: string) => host.querySelector<HTMLElement>(`[data-node-id="${id}"]`)!;
  const press = (id: string, shiftKey = false) => node(id).dispatchEvent(new MouseEvent('pointerdown', {
    button: 0, clientX: 100, clientY: 100, shiftKey, bubbles: true,
  }));
  if (method === 'modifier') {
    press('a'); window.dispatchEvent(new MouseEvent('pointerup'));
    press('b', true); window.dispatchEvent(new MouseEvent('pointerup'));
  } else {
    const viewport = host.querySelector('[data-cactus-pan-surface]')!.parentElement as HTMLElement & { __zoom: { x: number; y: number; k: number } };
    const t = viewport.__zoom;
    const a = node('a'), b = node('b');
    node('parent').dispatchEvent(new MouseEvent('pointerdown', { button: 0, bubbles: true,
      clientX: t.x + (parseFloat(a.style.left) - 5) * t.k,
      clientY: t.y + (parseFloat(a.style.top) - 5) * t.k }));
    window.dispatchEvent(new MouseEvent('pointermove', {
      clientX: t.x + (parseFloat(b.style.left) + parseFloat(b.style.width) + 5) * t.k,
      clientY: t.y + (parseFloat(b.style.top) + parseFloat(b.style.height) + 5) * t.k }));
    window.dispatchEvent(new MouseEvent('pointerup'));
  }
  window.dispatchEvent(new Event('pagehide'));
  expect(readNylonTabSession('multi')?.tabs[2].state?.selection).toEqual(['a', 'b']);
  press('a');
  window.dispatchEvent(new MouseEvent('pointermove', { clientX: 140, clientY: 120 }));
  window.dispatchEvent(new MouseEvent('pointerup'));
  expect(onAction).toHaveBeenCalledWith(expect.objectContaining({ op: 'selection.move', ids: ['a', 'b'] }), 'r1');
});

it('box-selects two root Control Contract frames and drags both from either frame', () => {
  vi.stubGlobal('ResizeObserver', class { observe() {} unobserve() {} disconnect() {} });
  vi.spyOn(Element.prototype, 'getBoundingClientRect').mockReturnValue({
    x: 0, y: 0, left: 0, top: 0, right: 1000, bottom: 800, width: 1000, height: 800, toJSON() {},
  });
  const onAction = vi.fn(() => true);
  host = document.createElement('div'); document.body.appendChild(host);
  const contracts = ['in1', 'out1', 'in2', 'out2'].map((id, i) => ({ id, name: id, x: 100, y: 100 + 180 * i }));
  dispose = render(() => <NylonTabs sourceId="pairs" revision="r1" blocked={false} onAction={onAction}
    doc={{ v: 1, transformations: [{ id: 'caller', name: 'Caller', x: 2000 }, { id: 'callee', name: 'Callee', x: 3000 }],
      contracts, arcs: [1, 2].map((i) => ({ id: `invoke${i}`, kind: 'control', control: 'invoke', from: 'caller', to: 'callee',
        controlContract: { input: `in${i}`, output: `out${i}` } })) }} />, host);
  const pan = host.querySelector<HTMLElement>('[data-cactus-pan-surface]')!;
  const t = (pan.parentElement as HTMLElement & { __zoom: { x: number; y: number; k: number } }).__zoom;
  pan.dispatchEvent(new MouseEvent('pointerdown', { button: 0, bubbles: true, clientX: t.x, clientY: t.y }));
  window.dispatchEvent(new MouseEvent('pointermove', { clientX: t.x + 500 * t.k, clientY: t.y + 850 * t.k }));
  window.dispatchEvent(new MouseEvent('pointerup'));
  window.dispatchEvent(new Event('pagehide'));
  expect(readNylonTabSession('pairs')?.tabs[1].state?.selection.slice().sort()).toEqual(['in1', 'in2', 'out1', 'out2']);
  for (const index of [0, 1]) {
    const frames = [...host.querySelectorAll<HTMLElement>('[data-contract-frame]')];
    frames[index].dispatchEvent(new MouseEvent('pointerdown', { button: 0, bubbles: true, clientX: 100, clientY: 100 }));
    window.dispatchEvent(new MouseEvent('pointermove', { clientX: 140, clientY: 120 }));
    expect(frames[0].style.transform).toBe(frames[1].style.transform);
    expect(frames[0].style.transform).not.toBe('translate(0px, 0px)');
    window.dispatchEvent(new MouseEvent('pointerup'));
    expect(onAction).toHaveBeenLastCalledWith(expect.objectContaining({
      op: 'selection.move', ids: ['in1', 'out1', 'in2', 'out2'],
    }), 'r1');
  }
});
