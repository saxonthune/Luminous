import { afterEach, describe, expect, it, vi } from 'vitest';
import { createSignal, createEffect, untrack } from 'solid-js';
import { render } from 'solid-js/web';
import type { NylonDocument } from '@luminous/core/nylon';
import type { NylonCanvasProps } from '../NylonCanvas.tsx';
import { NylonTabs } from '../NylonTabs.tsx';

// Exercise tab persistence with live camera/selection updates independently
// of browser layout. NylonCamera.test.tsx also mounts the real cactus canvas.
vi.mock('../NylonCanvas.tsx', () => ({
  NylonCanvas: (props: NylonCanvasProps) => {
    const initial = untrack(() => props.initialState);
    const [x, setX] = createSignal(initial?.camera.x ?? 0);
    const [selection, setSelection] = createSignal(initial?.selection ?? []);
    createEffect(() => props.onState?.({
      camera: { x: x(), y: 20, k: 2 }, selection: selection(),
      containerStates: new Map([['child', 'covered']]),
    }));
    return <div>
      <output data-camera>{x()}</output>
      <output data-selection>{selection().join(',')}</output>
      <output data-document>{props.doc.transformations.map((node) => node.x).join(',')}</output>
      <button onClick={() => { setX(123); setSelection(['child']); }}>Change camera and selection</button>
      <button onClick={() => props.onOpenView?.('child')}>Open child</button>
      <button onClick={() => props.onOpenView?.(null)}>Open root</button>
    </div>;
  },
}));

describe('Nylon Tabs', () => {
  let host: HTMLDivElement;
  let dispose: (() => void) | undefined;
  afterEach(() => { dispose?.(); host?.remove(); sessionStorage.clear(); });

  const doc: NylonDocument = {
    v: 1, transformations: [{ id: 'child', name: 'Child', x: 10 }], contracts: [], arcs: [],
  };
  function mount(sourceId = 'test-document') {
    host = document.createElement('div');
    document.body.appendChild(host);
    const [currentDoc, setDocument] = createSignal(doc);
    const onAction = vi.fn(() => true);
    dispose = render(() => <NylonTabs sourceId={sourceId} doc={currentDoc()} revision="revision" blocked={false} onAction={onAction} />, host);
    return { onAction, setDocument };
  }
  const tabs = () => [...host.querySelectorAll<HTMLButtonElement>('[role="tab"]')];
  const active = () => host.querySelector('[role="tab"][aria-selected="true"]')?.textContent;
  function click(text: string) {
    const button = [...host.querySelectorAll('button')].find((item) => item.textContent === text);
    expect(button, text).toBeTruthy();
    button!.click();
  }

  it('deduplicates Views and restores closed contexts while sharing Document changes', () => {
    const { onAction, setDocument } = mount();
    expect(tabs().map((tab) => tab.textContent)).toEqual(['Continuous View (deprecated)', 'Document root']);
    expect(active()).toBe('Document root');
    click('Change camera and selection');
    click('Open child');
    expect(active()).toBe('Child');
    expect(host.querySelector('[data-camera]')?.textContent).toBe('0');
    click('Open child');
    expect(tabs()).toHaveLength(3);
    click('Open root');
    expect(host.querySelector('[data-camera]')?.textContent).toBe('123');
    expect(host.querySelector('[data-selection]')?.textContent).toBe('child');
    host.querySelector<HTMLButtonElement>('[aria-label="Close Document root"]')!.click();
    expect(active()).toBe('Continuous View (deprecated)');
    setDocument({ ...doc, transformations: [{ ...doc.transformations[0], x: 200 }] });
    click('Reopen closed tab');
    expect(active()).toBe('Document root');
    expect(host.querySelector('[data-camera]')?.textContent).toBe('123');
    expect(host.querySelector('[data-document]')?.textContent).toBe('200');
    expect(onAction).not.toHaveBeenCalled();
  });

  it('keeps a missing focus recoverable and supports keyboard tab activation', () => {
    const { setDocument } = mount();
    click('Open child');
    setDocument({ ...doc, transformations: [] });
    expect(host.textContent).toContain('This Transformation no longer exists');
    expect(active()).toBe('Missing: child');
    setDocument(doc);
    expect(active()).toBe('Child');
    expect(host.textContent).not.toContain('This Transformation no longer exists');
    tabs()[2].dispatchEvent(new KeyboardEvent('keydown', { key: 'Home', bubbles: true }));
    expect(active()).toBe('Continuous View (deprecated)');
    expect(document.activeElement).toBe(tabs()[0]);
  });

  it('persists the active camera before switching and restores sessions by source', () => {
    mount();
    click('Open child');
    click('Change camera and selection');
    window.dispatchEvent(new Event('pagehide'));
    expect(sessionStorage.getItem('nylon-tabs:test-document')).toContain('123');
    dispose?.(); host.remove();
    mount('other-document');
    expect(active()).toBe('Document root');
    expect(host.querySelector('[data-camera]')?.textContent).toBe('0');
    dispose?.(); host.remove();
    mount();
    expect(active()).toBe('Child');
    expect(host.querySelector('[data-camera]')?.textContent).toBe('123');
    expect(host.querySelector('[data-selection]')?.textContent).toBe('child');
    host.querySelector<HTMLButtonElement>('[aria-label="Close Child"]')!.click();
    dispose?.(); host.remove();
    mount();
    click('Reopen closed tab');
    expect(active()).toBe('Child');
    expect(host.querySelector('[data-camera]')?.textContent).toBe('123');
  });

  it('ignores malformed retained sessions', () => {
    sessionStorage.setItem('nylon-tabs:test-document', '{broken');
    mount();
    expect(active()).toBe('Document root');
  });
});
