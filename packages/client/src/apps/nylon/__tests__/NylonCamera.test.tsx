import { afterEach, describe, expect, it, vi } from 'vitest';
import { render } from 'solid-js/web';
import { NylonTabs } from '../NylonTabs.tsx';
import { nylonTabKey, readNylonTabSession, writeNylonTabSession } from '../tabSession.ts';
import type { NylonViewDefinition } from '@luminous/core/nylon/projection';

describe('Nylon camera restoration with cactus', () => {
  let dispose: (() => void) | undefined;
  let host: HTMLDivElement;
  afterEach(() => {
    dispose?.(); host?.remove(); sessionStorage.clear(); vi.restoreAllMocks(); vi.unstubAllGlobals();
  });

  it('restores independent d3 cameras and persists an active wheel gesture across remount', () => {
    vi.stubGlobal('ResizeObserver', class { observe() {} unobserve() {} disconnect() {} });
    vi.spyOn(Element.prototype, 'getBoundingClientRect').mockReturnValue({
      x: 0, y: 0, left: 0, top: 0, right: 1000, bottom: 800, width: 1000, height: 800, toJSON() {},
    });
    const root: NylonViewDefinition = { kind: 'standard', focusId: null };
    const child: NylonViewDefinition = { kind: 'standard', focusId: 'child' };
    const rootCamera = { x: 120, y: 70, k: 1.2 };
    const childCamera = { x: -400, y: 85, k: 0.9 };
    writeNylonTabSession('camera-test', {
      activeKey: nylonTabKey(root), closed: [], tabs: [
        { key: 'continuous', view: { kind: 'continuous' } },
        { key: nylonTabKey(root), view: root, state: { camera: rootCamera, selection: [], containerStates: new Map() } },
        { key: nylonTabKey(child), view: child, state: { camera: childCamera, selection: [], containerStates: new Map() } },
      ],
    });
    const mount = () => {
      host = document.createElement('div'); document.body.appendChild(host);
      dispose = render(() => <NylonTabs sourceId="camera-test" revision="r1" blocked={false} onAction={() => true}
        doc={{ v: 1, transformations: [
          { id: 'child', name: 'Child', x: 500, y: 500 },
          { id: 'leaf', name: 'Leaf', parent: 'child', x: 42, y: 80 },
        ], contracts: [], arcs: [] }} />, host);
    };
    const viewport = () => host.querySelector('[data-cactus-pan-surface]')!.parentElement!;
    const camera = () => ({ ...(viewport() as HTMLElement & { __zoom: { x: number; y: number; k: number } }).__zoom });
    const activate = (name: string) => [...host.querySelectorAll<HTMLButtonElement>('[role="tab"]')]
      .find((button) => button.textContent === name)!.click();
    mount();
    expect(camera()).toEqual(rootCamera);
    activate('Child');
    expect(camera()).toEqual(childCamera);
    const boundary = host.querySelector('[data-nylon-focus-container]');
    expect(boundary?.textContent).toContain('Child');
    expect(boundary?.querySelector('button')).toBeNull();
    expect(host.querySelector('[aria-label="Expand Child"]')).toBeNull();
    expect(host.querySelector('[aria-label="Collapse Child"]')).toBeNull();
    viewport().dispatchEvent(new WheelEvent('wheel', { deltaY: -120, clientX: 300, clientY: 200, bubbles: true, cancelable: true }));
    const changed = camera();
    expect(changed.k).not.toBe(childCamera.k);
    window.dispatchEvent(new Event('pagehide'));
    expect(readNylonTabSession('camera-test')?.tabs[2].state?.camera).toEqual(changed);
    activate('Document root');
    expect(camera()).toEqual(rootCamera);
    activate('Child');
    expect(camera()).toEqual(changed);
    dispose?.(); host.remove();
    mount();
    expect(camera()).toEqual(changed);
    dispose?.(); host.remove(); sessionStorage.clear();
    mount();
    const freshRoot = camera();
    host.querySelector<HTMLButtonElement>('[aria-label="Open contents of Child"]')!.click();
    expect(camera()).not.toEqual(freshRoot);
    activate('Document root');
    expect(camera()).toEqual(freshRoot);
  });
});
