import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render } from 'solid-js/web';
import { buildGraph } from '../../src/graph.ts';
import type { RenderContext } from '../../src/types.ts';
import type { RenderNode } from '../../src/render/types.ts';
import { interpretRender } from '../../src/render/interpret.ts';
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

function mount(node: RenderNode, content: Record<string, unknown> = {}): void {
  cleanup = render(() => interpretRender(node, mockCtx, content), container);
}

describe('badge primitive', () => {
  it('renders the value text', () => {
    mount({ type: 'badge', value: 'active' });
    expect(container.textContent).toBe('active');
  });

  it('renders with accent tone', () => {
    mount({ type: 'badge', value: 'new', tone: 'accent' });
    const el = container.querySelector('span');
    expect(el).not.toBeNull();
    expect(el!.textContent).toBe('new');
  });

  it('renders with danger tone', () => {
    mount({ type: 'badge', value: 'error', tone: 'danger' });
    expect(container.textContent).toBe('error');
  });

  it('renders with muted tone', () => {
    mount({ type: 'badge', value: 'archived', tone: 'muted' });
    expect(container.textContent).toBe('archived');
  });

  it('defaults to default tone when unspecified', () => {
    mount({ type: 'badge', value: 'ok' });
    const el = container.querySelector('span');
    expect(el).not.toBeNull();
  });
});

describe('chip primitive', () => {
  it('renders the value text', () => {
    mount({ type: 'chip', value: 'tag-a' });
    expect(container.textContent).toBe('tag-a');
  });

  it('renders as a span (pill shape is CSS)', () => {
    mount({ type: 'chip', value: 'beta', tone: 'accent' });
    const el = container.querySelector('span');
    expect(el).not.toBeNull();
    expect(el!.textContent).toBe('beta');
  });

  it('supports all tone values', () => {
    for (const tone of ['default', 'muted', 'accent', 'danger']) {
      container.innerHTML = '';
      mount({ type: 'chip', value: tone, tone });
      expect(container.textContent).toBe(tone);
    }
  });
});

describe('badge color prop', () => {
  it('sets background to hex color when color is provided', () => {
    mount({ type: 'badge', value: 'ok', color: '#ff0000' });
    const el = container.querySelector('span');
    expect(el).not.toBeNull();
    expect(el!.style.background).toBe('rgb(255, 0, 0)');
  });

  it('leaves tone background intact when color is absent', () => {
    mount({ type: 'badge', value: 'ok', tone: 'accent' });
    const el = container.querySelector('span');
    expect(el).not.toBeNull();
    expect(el!.style.background).not.toBe('');
  });

  it('does not override background when color is empty string', () => {
    mount({ type: 'badge', value: 'ok', tone: 'accent', color: '' });
    const el = container.querySelector('span');
    expect(el).not.toBeNull();
    expect(el!.style.background).not.toBe('');
  });
});

describe('chip color prop', () => {
  it('sets background to hex color when color is provided', () => {
    mount({ type: 'chip', value: 'tag', color: '#00ff00' });
    const el = container.querySelector('span');
    expect(el).not.toBeNull();
    expect(el!.style.background).toBe('rgb(0, 255, 0)');
  });

  it('leaves tone background intact when color is absent', () => {
    mount({ type: 'chip', value: 'tag', tone: 'accent' });
    const el = container.querySelector('span');
    expect(el).not.toBeNull();
    expect(el!.style.background).not.toBe('');
  });
});

describe('text color prop', () => {
  it('sets text color to hex value when color is provided', () => {
    mount({ type: 'text', value: 'hello', color: '#0000ff' });
    const el = container.querySelector('span');
    expect(el).not.toBeNull();
    expect(el!.style.color).toBe('rgb(0, 0, 255)');
  });

  it('leaves tone text color intact when color is absent', () => {
    mount({ type: 'text', value: 'hello', tone: 'accent' });
    const el = container.querySelector('span');
    expect(el).not.toBeNull();
    expect(el!.style.color).toBe('rgb(59, 130, 246)');
  });

  it('does not set color when color is empty string', () => {
    mount({ type: 'text', value: 'hello', color: '' });
    const el = container.querySelector('span');
    expect(el).not.toBeNull();
    expect(el!.style.color).toBe('');
  });
});

describe('card color prop', () => {
  it('sets border to hex color when color is provided', () => {
    mount({ type: 'card', color: '#ff00ff' });
    const el = container.querySelector('div');
    expect(el).not.toBeNull();
    expect(el!.style.border).toBe('1px solid rgb(255, 0, 255)');
  });

  it('leaves tone border intact when color is absent', () => {
    mount({ type: 'card', tone: 'accent' });
    const el = container.querySelector('div');
    expect(el).not.toBeNull();
    expect(el!.style.border).not.toBe('');
  });

  it('does not override border when color is empty string', () => {
    mount({ type: 'card', tone: 'accent', color: '' });
    const el = container.querySelector('div');
    expect(el).not.toBeNull();
    expect(el!.style.border).toBe('1px solid rgb(147, 197, 253)');
  });
});

describe('icon primitive', () => {
  it('renders an SVG for known icon names', () => {
    mount({ type: 'icon', name: 'check', size: 16 });
    expect(container.querySelector('svg')).not.toBeNull();
  });

  it('renders a placeholder span for unknown icon names', () => {
    mount({ type: 'icon', name: '__unknown__', size: 16 });
    expect(container.querySelector('span')).not.toBeNull();
    expect(container.querySelector('svg')).toBeNull();
  });

  it('renders with default size when unspecified', () => {
    mount({ type: 'icon', name: 'code' });
    expect(container.querySelector('svg')).not.toBeNull();
  });

  it('renders all built-in icon names', () => {
    const names = ['check', 'warning', 'info', 'close', 'arrow-right', 'arrow-left', 'external-link', 'code'];
    for (const name of names) {
      container.innerHTML = '';
      mount({ type: 'icon', name, size: 16 });
      expect(container.querySelector('svg')).not.toBeNull();
    }
  });
});

describe('divider primitive', () => {
  it('renders an hr element', () => {
    mount({ type: 'divider' });
    expect(container.querySelector('hr')).not.toBeNull();
  });
});

describe('link primitive', () => {
  it('renders the value text', () => {
    mount({ type: 'link', value: 'Click me', target: 'https://example.com' });
    expect(container.textContent).toBe('Click me');
  });

  it('renders an anchor element', () => {
    mount({ type: 'link', value: 'Go', target: 'https://example.com' });
    expect(container.querySelector('a')).not.toBeNull();
  });

  it('sets href to the target', () => {
    mount({ type: 'link', value: 'Go', target: 'https://example.com' });
    const a = container.querySelector('a');
    expect(a?.getAttribute('href')).toBe('https://example.com');
  });
});

describe('markdown primitive', () => {
  it('renders plain paragraph text', () => {
    mount({ type: 'markdown', value: 'Hello world' });
    expect(container.textContent).toContain('Hello world');
  });

  it('renders heading lines', () => {
    mount({ type: 'markdown', value: '# Title' });
    expect(container.querySelector('h1')).not.toBeNull();
    expect(container.textContent).toContain('Title');
  });

  it('renders h2 and h3', () => {
    mount({ type: 'markdown', value: '## Section\n### Sub' });
    expect(container.querySelector('h2')).not.toBeNull();
    expect(container.querySelector('h3')).not.toBeNull();
  });

  it('renders bold inline markup', () => {
    mount({ type: 'markdown', value: '**bold text**' });
    expect(container.querySelector('strong')).not.toBeNull();
    expect(container.textContent).toContain('bold text');
  });

  it('renders italic inline markup', () => {
    mount({ type: 'markdown', value: '*italic*' });
    expect(container.querySelector('em')).not.toBeNull();
    expect(container.textContent).toContain('italic');
  });

  it('renders inline code', () => {
    mount({ type: 'markdown', value: 'use `npm install`' });
    expect(container.querySelector('code')).not.toBeNull();
    expect(container.textContent).toContain('npm install');
  });

  it('renders unordered list items', () => {
    mount({ type: 'markdown', value: '- item one\n- item two' });
    const items = container.querySelectorAll('li');
    expect(items.length).toBe(2);
    expect(container.textContent).toContain('item one');
    expect(container.textContent).toContain('item two');
  });
});

describe('code-block primitive', () => {
  it('renders the value in a pre/code block', () => {
    mount({ type: 'code-block', value: 'const x = 1;', language: 'typescript' });
    expect(container.querySelector('pre')).not.toBeNull();
    expect(container.querySelector('code')).not.toBeNull();
    expect(container.textContent).toContain('const x = 1;');
  });

  it('renders without language prop', () => {
    mount({ type: 'code-block', value: 'hello()' });
    expect(container.textContent).toContain('hello()');
  });
});

describe('image primitive', () => {
  it('renders an img element', () => {
    mount({ type: 'image', src: 'https://example.com/img.png', alt: 'test image' });
    const img = container.querySelector('img');
    expect(img).not.toBeNull();
  });

  it('sets src and alt attributes', () => {
    mount({ type: 'image', src: 'https://example.com/img.png', alt: 'my image' });
    const img = container.querySelector('img');
    expect(img?.getAttribute('src')).toBe('https://example.com/img.png');
    expect(img?.getAttribute('alt')).toBe('my image');
  });
});

describe('kv-list primitive', () => {
  it('renders key/value rows', () => {
    mount({
      type: 'kv-list',
      items: [
        { key: 'status', value: 'active' },
        { key: 'owner', value: 'alice' },
      ],
    });
    expect(container.textContent).toContain('status');
    expect(container.textContent).toContain('active');
    expect(container.textContent).toContain('owner');
    expect(container.textContent).toContain('alice');
  });

  it('renders nothing for empty items array', () => {
    mount({ type: 'kv-list', items: [] });
    expect(container.textContent).toBe('');
  });

  it('renders nothing when items is missing', () => {
    mount({ type: 'kv-list' });
    expect(container.textContent).toBe('');
  });

  it('coerces non-string values to strings', () => {
    mount({
      type: 'kv-list',
      items: [{ key: 'count', value: 42 }],
    });
    expect(container.textContent).toContain('42');
  });
});
