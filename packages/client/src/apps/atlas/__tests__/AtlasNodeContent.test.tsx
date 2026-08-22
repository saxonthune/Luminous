import { describe, it, expect, vi, afterEach } from 'vitest';
import { render } from 'solid-js/web';
import type { AtlasData, AtlasNode } from '@luminous/core/atlas';
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
  const onFitContent = vi.fn();

  const props: AtlasNodeContentProps = {
    node: () => baseNode(),
    data: () => undefined,
    hasChildren: () => false,
    color: () => undefined,
    selected: () => false,
    editing: () => false,
    onEnterEdit,
    onCommit,
    onCancel,
    onModeChange,
    previewSize: () => undefined,
    frameSize: () => ({ width: 220, height: 72 }),
    zoomScale: () => 1,
    onResizePreview,
    onResizeCommit,
    onFitContent,
    ...overrides,
  };

  container = document.createElement('div');
  document.body.appendChild(container);
  dispose = render(() => <AtlasNodeContent {...props} />, container);

  return { onEnterEdit, onCommit, onCancel, onModeChange, onResizePreview, onResizeCommit, onFitContent };
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

  it('a container\'s corner grip drags both axes, sizing the container box (frameSize) rather than the header', () => {
    const { onResizePreview } = mount({ hasChildren: () => true, frameSize: () => ({ width: 300, height: 150 }) });
    const handles = container.querySelectorAll('[data-no-pan="true"]');
    const corner = handles[handles.length - 1] as HTMLElement;
    corner.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true, clientX: 0, clientY: 0 }));

    window.dispatchEvent(new MouseEvent('pointermove', { clientX: 10, clientY: 20 }));
    expect(onResizePreview).toHaveBeenCalledWith({ width: 310, height: 170 });

    window.dispatchEvent(new MouseEvent('pointerup', {}));
  });

  it('R72: double clicking the corner grip fires the fit command with both axes, without entering edit mode', () => {
    const { onFitContent, onEnterEdit } = mount();
    const handles = container.querySelectorAll('[data-no-pan="true"]');
    const corner = handles[handles.length - 1] as HTMLElement;
    corner.dispatchEvent(new MouseEvent('dblclick', { bubbles: true }));

    expect(onFitContent).toHaveBeenCalledWith({ horizontal: true, vertical: true });
    expect(onEnterEdit).not.toHaveBeenCalled();
  });

  it('R72: double clicking the width grip fires the fit command on the horizontal axis only', () => {
    const { onFitContent } = mount();
    const grip = container.querySelector('.cursor-col-resize') as HTMLElement;
    grip.dispatchEvent(new MouseEvent('dblclick', { bubbles: true }));

    expect(onFitContent).toHaveBeenCalledWith({ horizontal: true, vertical: false });
  });
});

describe('Filled Content (R75-R78)', () => {
  const filledData: AtlasData = {
    v: 1,
    entries: {
      'cli.build': { text: 'Sidecar text', source: { path: 'src/cli.ts', lines: [10, 12] } },
    },
  };

  it('R75/R76: renders the sidecar text and marks it as filled', () => {
    mount({
      node: () => baseNode({ content: { text: 'authored fallback', mode: 'markdown', from: 'cli.build' } }),
      data: () => filledData,
    });
    expect(container.textContent).toContain('Sidecar text');
    expect(container.textContent).not.toContain('authored fallback');
    expect(container.textContent).toContain('filled');
  });

  it('R77: a missing key renders the authored fallback and marks it as such', () => {
    mount({
      node: () => baseNode({ content: { text: 'authored fallback', mode: 'markdown', from: 'cli.missing' } }),
      data: () => filledData,
    });
    expect(container.textContent).toContain('authored fallback');
    expect(container.textContent).toContain('missing key');
  });

  it('R78: a filled Node\'s edit mode drops the content textarea but keeps the name input', () => {
    mount({
      node: () => baseNode({ content: { text: 'authored fallback', mode: 'markdown', from: 'cli.build' } }),
      data: () => filledData,
      editing: () => true,
    });
    expect(container.querySelector('textarea')).toBeNull();
    expect(container.querySelector('input')).not.toBeNull();
    expect(container.textContent).toContain('Sidecar text');
    expect(container.textContent).toContain('cli.build');
    expect(container.textContent).toContain('src/cli.ts');
  });

  it('a Node without a "from" still shows the plain textarea in edit mode', () => {
    mount({ node: () => baseNode(), editing: () => true });
    expect(container.querySelector('textarea')).not.toBeNull();
  });

  it('escapes markup carried in filled text before markdown rendering', () => {
    const markupData: AtlasData = {
      v: 1,
      entries: { 'cli.build': { text: '<img src=x onerror=alert(1)>' } },
    };
    mount({
      node: () => baseNode({ content: { text: 'fallback', mode: 'markdown', from: 'cli.build' } }),
      data: () => markupData,
    });
    expect(container.querySelector('img')).toBeNull();
    expect(container.textContent).toContain('<img src=x onerror=alert(1)>');
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
