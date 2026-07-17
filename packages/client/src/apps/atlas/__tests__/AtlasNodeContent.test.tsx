import { describe, it, expect, vi, afterEach } from 'vitest';
import { render } from 'solid-js/web';
import type { AtlasNode } from '@luminous/core/atlas';
import { AtlasNodeContent, shouldConsumeWheel, type AtlasNodeContentProps } from '../AtlasNodeContent';

let container: HTMLDivElement;
let dispose: (() => void) | undefined;

function baseNode(overrides: Partial<AtlasNode> = {}): AtlasNode {
  return {
    id: 'n1',
    name: 'Node One',
    content: { text: 'hello', mode: 'markdown' },
    ...overrides,
  };
}

function mount(overrides: Partial<AtlasNodeContentProps> = {}) {
  const onEnterEdit = vi.fn();
  const onCommit = vi.fn();
  const onCancel = vi.fn();
  const onModeChange = vi.fn();
  const onResizePreview = vi.fn();
  const onResizeCommit = vi.fn();

  const props: AtlasNodeContentProps = {
    node: () => baseNode(),
    hasChildren: () => false,
    color: () => undefined,
    selected: () => false,
    editing: () => false,
    onEnterEdit,
    onCommit,
    onCancel,
    onModeChange,
    previewSize: () => undefined,
    zoomScale: () => 1,
    onResizePreview,
    onResizeCommit,
    ...overrides,
  };

  container = document.createElement('div');
  document.body.appendChild(container);
  dispose = render(() => <AtlasNodeContent {...props} />, container);

  return { onEnterEdit, onCommit, onCancel, onModeChange, onResizePreview, onResizeCommit };
}

afterEach(() => {
  dispose?.();
  container?.parentNode?.removeChild(container);
});

describe('AtlasNodeContent interactions', () => {
  it('double-click enters edit mode', () => {
    const { onEnterEdit } = mount();
    const root = container.querySelector('[class*="relative"]') as HTMLElement;
    root.dispatchEvent(new MouseEvent('dblclick', { bubbles: true }));
    expect(onEnterEdit).toHaveBeenCalledTimes(1);
  });

  it('clicking the mode switcher dispatches a mode change', () => {
    const { onModeChange } = mount();
    const codeButton = Array.from(container.querySelectorAll('button')).find((b) => b.textContent === 'Code')!;
    codeButton.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    expect(onModeChange).toHaveBeenCalledWith('code');
  });

  it('a pointerdown on the resize handle does not bubble to a node-drag listener', () => {
    const { onResizePreview } = mount();
    const nodeDragHandler = vi.fn();
    // Simulates NodeContainer's native on:pointerdown ancestor listener.
    container.addEventListener('pointerdown', nodeDragHandler);

    const handle = container.querySelector('[data-no-pan="true"]') as HTMLElement;
    expect(handle).toBeTruthy();
    handle.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true, clientX: 0, clientY: 0 }));

    expect(nodeDragHandler).not.toHaveBeenCalled();

    window.dispatchEvent(new MouseEvent('pointermove', { clientX: 0, clientY: 10 }));
    expect(onResizePreview).toHaveBeenCalled();

    window.dispatchEvent(new MouseEvent('pointerup', {}));
  });
});

describe('shouldConsumeWheel', () => {
  it('does not consume when content fits (no overflow)', () => {
    expect(shouldConsumeWheel({ scrollHeight: 100, clientHeight: 100, scrollTop: 0 }, 10)).toBe(false);
  });

  it('consumes a downward scroll when overflowing with room below', () => {
    expect(shouldConsumeWheel({ scrollHeight: 200, clientHeight: 100, scrollTop: 0 }, 10)).toBe(true);
  });

  it('does not consume a downward scroll already at the bottom boundary', () => {
    expect(shouldConsumeWheel({ scrollHeight: 200, clientHeight: 100, scrollTop: 100 }, 10)).toBe(false);
  });

  it('consumes an upward scroll when overflowing with room above', () => {
    expect(shouldConsumeWheel({ scrollHeight: 200, clientHeight: 100, scrollTop: 50 }, -10)).toBe(true);
  });

  it('does not consume an upward scroll already at the top boundary', () => {
    expect(shouldConsumeWheel({ scrollHeight: 200, clientHeight: 100, scrollTop: 0 }, -10)).toBe(false);
  });
});
