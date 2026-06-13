import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render } from 'solid-js/web';
import { buildGraph } from '../../src/graph.ts';
import type { RenderContext } from '../../src/types.ts';
import type { RenderNode } from '../../src/render/types.ts';
import { interpretRender } from '../../src/render/interpret.ts';
import { resetPrimitives, registerPrimitive } from '../../src/render/registry.ts';
import '../../src/render/builtins.ts';

const mockCtx: RenderContext = {
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
  graph: buildGraph([], []),
  hasChildren: () => false,
  inspect: vi.fn(),
  sectionColorOf: () => undefined,
};

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

function mount(render_: RenderNode, content: Record<string, unknown> = {}): void {
  cleanup = render(() => interpretRender(render_, mockCtx, content), container);
}

describe('interpretRender', () => {
  it('renders a text primitive', () => {
    mount({ type: 'text', value: 'Hello' });
    expect(container.textContent).toBe('Hello');
  });

  it('renders a nested vstack with text children', () => {
    mount({
      type: 'vstack',
      children: [
        { type: 'text', value: 'line 1' },
        { type: 'text', value: 'line 2' },
      ],
    });
    expect(container.textContent).toContain('line 1');
    expect(container.textContent).toContain('line 2');
  });

  it('renders hstack with children', () => {
    mount({
      type: 'hstack',
      children: [{ type: 'text', value: 'left' }, { type: 'text', value: 'right' }],
    });
    expect(container.textContent).toContain('left');
    expect(container.textContent).toContain('right');
  });

  it('renders a card wrapping text', () => {
    mount({ type: 'card', children: [{ type: 'text', value: 'inside card' }] });
    expect(container.textContent).toBe('inside card');
  });

  it('interpolates {content.*} in string props', () => {
    mount({ type: 'text', value: 'Hello, {content.name}!' }, { name: 'World' });
    expect(container.textContent).toBe('Hello, World!');
  });

  describe('if control node', () => {
    it('renders then branch when condition is truthy', () => {
      mount({
        type: 'if',
        when: 'content.show',
        then: { type: 'text', value: 'visible' },
        else: { type: 'text', value: 'hidden' },
      }, { show: true });
      expect(container.textContent).toBe('visible');
    });

    it('renders else branch when condition is falsy', () => {
      mount({
        type: 'if',
        when: 'content.show',
        then: { type: 'text', value: 'visible' },
        else: { type: 'text', value: 'hidden' },
      }, { show: false });
      expect(container.textContent).toBe('hidden');
    });

    it('renders nothing when condition is false and no else branch', () => {
      mount({
        type: 'if',
        when: 'content.show',
        then: { type: 'text', value: 'visible' },
      }, { show: false });
      expect(container.textContent).toBe('');
    });
  });

  describe('for-each control node', () => {
    it('renders one child per item', () => {
      mount({
        type: 'for-each',
        items: 'content.tags',
        as: 'tag',
        template: { type: 'text', value: '{content.tag}' },
      }, { tags: ['alpha', 'beta', 'gamma'] });
      expect(container.textContent).toContain('alpha');
      expect(container.textContent).toContain('beta');
      expect(container.textContent).toContain('gamma');
    });

    it('renders nothing for empty array', () => {
      mount({
        type: 'for-each',
        items: 'content.tags',
        as: 'tag',
        template: { type: 'text', value: '{content.tag}' },
      }, { tags: [] });
      expect(container.textContent).toBe('');
    });
  });

  it('warns once and renders nothing for unknown primitive type', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    mount({ type: '__nonexistent_type__' });
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('__nonexistent_type__'));
    expect(container.textContent).toBe('');
    warn.mockRestore();
  });

  it('throws on duplicate primitive registration', () => {
    expect(() => registerPrimitive('text', () => null)).toThrow('already registered');
  });

  it('resetPrimitives clears the registry', () => {
    resetPrimitives();
    expect(() => registerPrimitive('text', () => null)).not.toThrow();
    // Re-register builtins so other tests still work
    resetPrimitives();
    // Re-import builtins side-effect does not run again (module cached),
    // so manually re-register the minimal set needed
    import('../../src/render/builtins.ts');
  });
});
