import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render } from 'solid-js/web';
import type { RenderContext } from '../../src/types.ts';
import { interpretRender } from '../../src/render/interpret.ts';
import '../../src/render/builtins.ts';

const makeCtx = (overrides: Partial<RenderContext> = {}): RenderContext => ({
  level: () => 'card',
  zoom: () => 1,
  view: {
    id: 'test',
    name: 'Test',
    nodeRoles: {},
    edgeRoles: {},
    layers: {},
    layout: { algorithm: 'manual' },
  },
  graph: { nodes: new Map(), edges: new Map() } as never,
  hasChildren: () => false,
  inspect: vi.fn(),
  sectionColorOf: () => undefined,
  ...overrides,
});

let container: HTMLDivElement;
let cleanup: (() => void) | undefined;

beforeEach(() => {
  container = document.createElement('div');
  document.body.appendChild(container);
  cleanup = undefined;
});

afterEach(() => {
  cleanup?.();
  document.body.removeChild(container);
});

describe('text body auto-clamp', () => {
  it('wraps body text in a div with -webkit-line-clamp: 4', () => {
    cleanup = render(
      () => interpretRender({ type: 'text', value: 'long text', style: 'body' }, makeCtx(), {}),
      container,
    );
    const div = container.querySelector('div');
    expect(div).not.toBeNull();
    expect(div!.style.getPropertyValue('-webkit-line-clamp')).toBe('4');
  });

  it('wraps caption text in a div with -webkit-line-clamp: 4', () => {
    cleanup = render(
      () => interpretRender({ type: 'text', value: 'caption text', style: 'caption' }, makeCtx(), {}),
      container,
    );
    const div = container.querySelector('div');
    expect(div).not.toBeNull();
    expect(div!.style.getPropertyValue('-webkit-line-clamp')).toBe('4');
  });

  it('does NOT wrap mono text in a clamp div', () => {
    cleanup = render(
      () => interpretRender({ type: 'text', value: 'code', style: 'mono' }, makeCtx(), {}),
      container,
    );
    // mono renders directly as a span, not wrapped in a div with -webkit-line-clamp
    const span = container.querySelector('span');
    expect(span).not.toBeNull();
    expect(span!.style.getPropertyValue('-webkit-line-clamp')).toBe('');
  });

  it('does NOT apply clamp to heading', () => {
    cleanup = render(
      () => interpretRender({ type: 'text', value: 'Title', style: 'heading' }, makeCtx(), {}),
      container,
    );
    const span = container.querySelector('span');
    expect(span).not.toBeNull();
    expect(span!.style.getPropertyValue('-webkit-line-clamp')).toBe('');
  });

  it('suppresses clamp on body when ctx.expanded is true', () => {
    const ctx = makeCtx({ expanded: () => true });
    cleanup = render(
      () => interpretRender({ type: 'text', value: 'body text', style: 'body' }, ctx, {}),
      container,
    );
    // When expanded, no clamp div — renders as plain span
    const span = container.querySelector('span');
    expect(span).not.toBeNull();
    expect(span!.style.getPropertyValue('-webkit-line-clamp')).toBe('');
  });

  it('suppresses clamp on caption when ctx.expanded is true', () => {
    const ctx = makeCtx({ expanded: () => true });
    cleanup = render(
      () => interpretRender({ type: 'text', value: 'caption text', style: 'caption' }, ctx, {}),
      container,
    );
    const span = container.querySelector('span');
    expect(span).not.toBeNull();
    expect(span!.style.getPropertyValue('-webkit-line-clamp')).toBe('');
  });

  it('body text still culled below legibility floor', () => {
    const ctx = makeCtx({ zoom: () => 0.5 });
    cleanup = render(
      () => interpretRender({ type: 'text', value: 'body', style: 'body' }, ctx, {}),
      container,
    );
    // 12px * 0.5 = 6 < 7 → culled
    expect(container.textContent).toBe('');
  });

  it('does not show pointer cursor when not overflowed', () => {
    cleanup = render(
      () => interpretRender({ type: 'text', value: 'short', style: 'body' }, makeCtx(), {}),
      container,
    );
    const div = container.querySelector('div');
    expect(div).not.toBeNull();
    expect(div!.style.cursor).not.toBe('pointer');
  });

  it('has overflow:hidden on clamp wrapper', () => {
    cleanup = render(
      () => interpretRender({ type: 'text', value: 'body text', style: 'body' }, makeCtx(), {}),
      container,
    );
    const div = container.querySelector('div');
    expect(div!.style.overflow).toBe('hidden');
  });
});
