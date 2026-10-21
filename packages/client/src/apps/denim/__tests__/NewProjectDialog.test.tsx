import { afterEach, describe, expect, it, vi } from 'vitest';
import { render } from 'solid-js/web';
import { NewProjectDialog } from '../NewProjectDialog';

let host: HTMLDivElement | undefined;
let dispose: (() => void) | undefined;

function mount(existingNames: string[] = []) {
  host = document.createElement('div');
  document.body.append(host);
  const onSubmit = vi.fn();
  const onCancel = vi.fn();
  dispose = render(() => <NewProjectDialog root="/projects" existingNames={existingNames} onSubmit={onSubmit} onCancel={onCancel} />, host);
  return { onSubmit, onCancel };
}

afterEach(() => {
  dispose?.();
  host?.remove();
  dispose = undefined;
  host = undefined;
});

describe('NewProjectDialog', () => {
  it('uses the shared dialog shell, focuses its field, and submits a trimmed project name', async () => {
    const { onSubmit } = mount();
    const input = host!.querySelector<HTMLInputElement>('[aria-label="Project name"]')!;
    await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
    expect(host!.querySelector('[role="dialog"]')?.classList.contains('lui-dialog-panel')).toBe(true);
    expect(document.activeElement).toBe(input);

    input.value = '  sample project  ';
    input.dispatchEvent(new InputEvent('input', { bubbles: true }));
    host!.querySelector('form')!.dispatchEvent(new SubmitEvent('submit', { bubbles: true, cancelable: true }));
    expect(onSubmit).toHaveBeenCalledWith('sample project');
  });

  it('keeps duplicate project names disabled and dismisses on Escape', () => {
    const { onCancel } = mount(['sample.denim.sqlite']);
    const input = host!.querySelector<HTMLInputElement>('[aria-label="Project name"]')!;
    input.value = 'sample';
    input.dispatchEvent(new InputEvent('input', { bubbles: true }));
    expect(host!.querySelector<HTMLButtonElement>('button[type="submit"]')?.disabled).toBe(true);
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }));
    expect(onCancel).toHaveBeenCalledOnce();
  });
});
