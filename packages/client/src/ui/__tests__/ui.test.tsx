import { afterEach, describe, expect, it, vi } from 'vitest';
import { createSignal, Show } from 'solid-js';
import type { JSX } from 'solid-js';
import { render } from 'solid-js/web';
import { AnchoredMenu, DialogShell, IconButton, MenuItem } from '../index';

let dispose: (() => void) | undefined;
let host: HTMLDivElement | undefined;

function mount(element: () => JSX.Element): HTMLDivElement {
  host = document.createElement('div');
  document.body.append(host);
  dispose = render(element, host);
  return host;
}

afterEach(() => {
  dispose?.();
  host?.remove();
  document.body.querySelectorAll('.lui-menu-panel, .lui-dialog-backdrop').forEach((element) => element.remove());
  dispose = undefined;
  host = undefined;
  vi.restoreAllMocks();
});

describe('shared UI components', () => {
  it('renders accessible shared buttons with shared state classes', () => {
    const root = mount(() => <div>
      <IconButton aria-label="Close" selected>×</IconButton>
      <MenuItem danger>Delete</MenuItem>
    </div>);

    expect(root.querySelector('[aria-label="Close"]')?.classList.contains('is-selected')).toBe(true);
    expect(root.querySelector('[role="menuitem"]')?.classList.contains('lui-menu-item--danger')).toBe(true);
  });

  it('anchors a portal menu and returns focus to its trigger on Escape', async () => {
    const [open, setOpen] = createSignal(false);
    let anchor: HTMLButtonElement | undefined;
    const root = mount(() => <>
      <button ref={anchor} onClick={() => setOpen(true)}>Open</button>
      <Show when={open()}>
        <AnchoredMenu anchor={anchor} label="Actions" onClose={() => setOpen(false)}>
          <MenuItem>Run action</MenuItem>
        </AnchoredMenu>
      </Show>
    </>);
    const trigger = root.querySelector('button')!;
    trigger.focus();
    trigger.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));

    const menu = document.body.querySelector('[role="menu"][aria-label="Actions"]');
    expect(menu).toBeTruthy();
    expect(menu?.classList.contains('lui-menu-panel')).toBe(true);
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true, cancelable: true }));
    expect(document.activeElement).toBe(menu?.querySelector('[role="menuitem"]'));
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }));

    expect(document.body.querySelector('[role="menu"][aria-label="Actions"]')).toBeNull();
    expect(document.activeElement).toBe(trigger);
  });

  it('dismisses an anchored menu on an outside pointer press', async () => {
    const [open, setOpen] = createSignal(false);
    let anchor: HTMLButtonElement | undefined;
    const root = mount(() => <>
      <button ref={anchor} onClick={() => setOpen(true)}>Open</button>
      <Show when={open()}>
        <AnchoredMenu anchor={anchor} label="Actions" onClose={() => setOpen(false)}>
          <MenuItem>Run action</MenuItem>
        </AnchoredMenu>
      </Show>
    </>);
    root.querySelector('button')!.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
    document.body.dispatchEvent(new Event('pointerdown', { bubbles: true }));

    expect(document.body.querySelector('[role="menu"][aria-label="Actions"]')).toBeNull();
  });

  it('focuses the dialog field and dismisses from the backdrop or Escape', async () => {
    const onDismiss = vi.fn();
    let input: HTMLInputElement | undefined;
    const root = mount(() => <DialogShell label="Project" title="New project" initialFocus={() => input} onDismiss={onDismiss}>
      <input ref={input} aria-label="Project name" />
    </DialogShell>);
    await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));

    expect(root.querySelector('[role="dialog"]')?.getAttribute('aria-modal')).toBe('true');
    expect(document.activeElement).toBe(input);
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Tab', bubbles: true, cancelable: true }));
    expect(document.activeElement).toBe(input);
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }));
    expect(onDismiss).toHaveBeenCalledTimes(1);
    root.querySelector('.lui-dialog-backdrop')!.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    expect(onDismiss).toHaveBeenCalledTimes(2);
  });
});
