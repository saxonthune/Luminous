import { describe, it, expect, vi, afterEach } from 'vitest';
import { render } from 'solid-js/web';
import type { JSX } from 'solid-js';
import type { Action } from '../src/chrome/types';
import { useHotkeys } from '../src/chrome/useHotkeys';

afterEach(() => {
  document.body.innerHTML = '';
});

function HotkeyMount(props: {
  actions: Action[];
  onAction: (id: string, payload?: unknown) => void;
}): JSX.Element {
  useHotkeys(() => props.actions, (id, payload) => props.onAction(id, payload));
  return <div />;
}

describe('useHotkeys hook', () => {
  it('dispatches an action for a matching keydown', () => {
    const onAction = vi.fn();
    const actions: Action[] = [{ id: 'TEST.ACT', label: 'Test', hotkey: 'Mod+K' }];

    const container = document.createElement('div');
    document.body.appendChild(container);
    const cleanup = render(() => <HotkeyMount actions={actions} onAction={onAction} />, container);

    document.body.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'K', ctrlKey: true, bubbles: true }),
    );

    expect(onAction).toHaveBeenCalledWith('TEST.ACT', undefined);
    cleanup();
  });

  it('does not dispatch when the event target is an input', () => {
    const onAction = vi.fn();
    const actions: Action[] = [{ id: 'TEST.ACT', label: 'Test', hotkey: 'Mod+K' }];

    const container = document.createElement('div');
    document.body.appendChild(container);
    const cleanup = render(() => <HotkeyMount actions={actions} onAction={onAction} />, container);

    const input = document.createElement('input');
    document.body.appendChild(input);
    input.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'K', ctrlKey: true, bubbles: true }),
    );

    expect(onAction).not.toHaveBeenCalled();
    cleanup();
  });

  it('does not dispatch when the event target is a textarea', () => {
    const onAction = vi.fn();
    const actions: Action[] = [{ id: 'TEST.ACT', label: 'Test', hotkey: 'Mod+K' }];

    const container = document.createElement('div');
    document.body.appendChild(container);
    const cleanup = render(() => <HotkeyMount actions={actions} onAction={onAction} />, container);

    const textarea = document.createElement('textarea');
    document.body.appendChild(textarea);
    textarea.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'K', ctrlKey: true, bubbles: true }),
    );

    expect(onAction).not.toHaveBeenCalled();
    cleanup();
  });

  it('stops dispatching after the component unmounts (listener removed)', () => {
    const onAction = vi.fn();
    const actions: Action[] = [{ id: 'TEST.ACT', label: 'Test', hotkey: 'Mod+K' }];

    const container = document.createElement('div');
    document.body.appendChild(container);
    const cleanup = render(() => <HotkeyMount actions={actions} onAction={onAction} />, container);

    // Unmount — onCleanup should remove the listener.
    cleanup();

    document.body.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'K', ctrlKey: true, bubbles: true }),
    );

    expect(onAction).not.toHaveBeenCalled();
  });
});
