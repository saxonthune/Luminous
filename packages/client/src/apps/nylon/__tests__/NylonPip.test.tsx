import { afterEach, describe, expect, it, vi } from 'vitest';
import { createSignal } from 'solid-js';
import { render } from 'solid-js/web';
import { NylonTabs } from '../NylonTabs.tsx';
import { readNylonTabSession } from '../tabSession.ts';
import type { NylonDocument } from '@luminous/core/nylon';

describe('Nylon PIP workspace', () => {
  let host: HTMLDivElement;
  let dispose: (() => void) | undefined;
  afterEach(() => { dispose?.(); host?.remove(); sessionStorage.clear(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });
  it('creates peer views, preserves source appearances and restores closed groups across reloads', () => {
    vi.stubGlobal('ResizeObserver', class { observe() {} unobserve() {} disconnect() {} });
    vi.spyOn(Element.prototype, 'getBoundingClientRect').mockReturnValue({
      x: 0, y: 0, left: 0, top: 0, right: 1000, bottom: 800, width: 1000, height: 800, toJSON() {},
    });
    const original: NylonDocument = { v: 1, transformations: [
      { id: 'parent', name: 'Parent' }, { id: 'child', name: 'Child', parent: 'parent', x: 42, y: 80 },
      { id: 'leaf', name: 'Leaf', parent: 'child', x: 42, y: 80 },
    ], contracts: [], arcs: [] };
    const [doc, setDoc] = createSignal(original);
    const onAction = vi.fn(() => true);
    function mount() {
      host = document.createElement('div'); document.body.appendChild(host);
      dispose = render(() => <NylonTabs sourceId="pip-test" revision="r1" doc={doc()} blocked={false} onAction={onAction} />, host);
    }
    const click = (label: string) => {
      const button = [...host.querySelectorAll<HTMLButtonElement>('button')].find((b) => b.getAttribute('aria-label') === label || b.textContent === label);
      expect(button, label).toBeTruthy(); button!.click();
    };
    const frames = () => [...host.querySelectorAll<HTMLElement>('[data-nylon-pip]')];
    const saved = () => {
      window.dispatchEvent(new Event('pagehide'));
      return readNylonTabSession('pip-test')!.tabs[1].state!.pips!;
    };
    mount();
    click('Open PIP of Parent');
    click('Open PIP of Child');
    expect(frames()).toHaveLength(2);
    const tethers = host.querySelectorAll('[data-cactus-edge-layer-lines] path[stroke-dasharray]');
    expect(tethers).toHaveLength(2);
    for (const tether of tethers) expect(tether.getAttribute('d')).toContain('C');
    const bounds = (el: HTMLElement) => ({ x: parseFloat(el.style.left), y: parseFloat(el.style.top),
      w: parseFloat(el.style.width), h: parseFloat(el.style.height) });
    const root = host.querySelector<HTMLElement>('[data-node-id="parent"]')!;
    const occupied = [bounds(root), ...frames().map(bounds)];
    for (let i = 0; i < occupied.length; i++) for (let j = i + 1; j < occupied.length; j++) {
      const a = occupied[i], b = occupied[j];
      expect(a.x + a.w + 40 <= b.x || b.x + b.w + 40 <= a.x
        || a.y + a.h + 40 <= b.y || b.y + b.h + 40 <= a.y).toBe(true);
    }
    expect(frames()[0].parentElement).toBe(frames()[1].parentElement);
    expect(host.querySelectorAll('[data-cactus-pan-surface]')).toHaveLength(1);
    const beforeDrag = saved();
    const viewport = host.querySelector('[data-cactus-pan-surface]')!.parentElement as HTMLElement & { __zoom: { k: number } };
    const zoom = viewport.__zoom.k;
    frames()[0].querySelector('[data-pip-handle]')!.dispatchEvent(new MouseEvent('pointerdown', { button: 0, clientX: 100, clientY: 100, bubbles: true }));
    window.dispatchEvent(new MouseEvent('pointermove', { clientX: 140, clientY: 120 }));
    window.dispatchEvent(new MouseEvent('pointerup'));
    const state = saved();
    expect(state.open[0].x).toBeCloseTo(beforeDrag.open[0].x + 40 / zoom);
    expect(state.open[0].y).toBeCloseTo(beforeDrag.open[0].y + 20 / zoom);
    expect(state.open[1]).toEqual(beforeDrag.open[1]);
    expect(state.open[1].sourceView).toBe(state.open[0].id);
    expect(state.open[1].sourceNode).toBe('child');
    click('Open PIP of Parent');
    expect(frames()).toHaveLength(2);
    expect(onAction).not.toHaveBeenCalled();
    dispose?.(); host.remove(); mount();
    expect(saved()).toEqual(state);
    expect(frames()).toHaveLength(2);
    setDoc({ ...original, transformations: [] });
    expect(host.textContent).toContain('This Transformation no longer exists. This PIP is retained.');
    expect(frames()).toHaveLength(2);
    setDoc(original);
    click('Close PIP Parent');
    expect(frames()).toHaveLength(0);
    expect(saved().closed[0]).toHaveLength(2);
    dispose?.(); host.remove(); mount();
    click('Reopen closed PIP');
    expect(frames()).toHaveLength(2);
    expect(saved()).toEqual(state);
    expect(onAction).not.toHaveBeenCalled();
    const childRenderId = JSON.stringify(['pip', state.open[0].id, 'child']);
    const childNode = [...host.querySelectorAll<HTMLElement>('[data-node-id]')].find((n) => n.dataset.nodeId === childRenderId)!;
    childNode.dispatchEvent(new MouseEvent('pointerdown', { button: 0, clientX: 100, clientY: 100, bubbles: true }));
    window.dispatchEvent(new MouseEvent('pointermove', { clientX: 130, clientY: 110 }));
    window.dispatchEvent(new MouseEvent('pointerup'));
    expect(onAction).toHaveBeenCalledWith(expect.objectContaining({ op: 'selection.move', ids: ['child'] }), 'r1');
  });
});
