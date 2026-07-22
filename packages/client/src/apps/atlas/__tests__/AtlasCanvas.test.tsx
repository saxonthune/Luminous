import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import { render } from 'solid-js/web';
import type { AtlasDocument } from '@luminous/core/atlas';
import { projectAtlasNodes } from '../projection.ts';
import { addDelta, growAncestors, type LayoutDelta } from '../layoutOverride.ts';
import { AtlasCanvas, type AtlasCanvasProps } from '../AtlasCanvas.tsx';

/**
 * Builds the same delta a live content-resize composes in AtlasNodeLayer
 * (AtlasCanvas.tsx's `layoutDeltas` memo) for a width and/or height preview —
 * kept here as a plain-function mirror so the composition can be asserted
 * without mounting the component. A leaf and a container behave alike: the
 * resized Node's own box grows by the delta and children never shift — a
 * container's frame grip sizes the container box (the shrink-wrap floor),
 * not the header band.
 */
function contentResizeDelta2D(
  doc: AtlasDocument,
  nodeId: string,
  preview: { width?: number; height?: number },
): Map<string, LayoutDelta> {
  const rendered = projectAtlasNodes(doc);
  const rn = rendered.find((n) => n.node.id === nodeId)!;
  const parentOf = new Map<string, string>();
  for (const r of rendered) {
    if (r.node.parent === undefined) continue;
    parentOf.set(r.node.id, r.node.parent);
  }

  const map = new Map<string, LayoutDelta>();
  const ownDelta: Partial<{ dw: number; dh: number }> = {};
  if (preview.width !== undefined) {
    const dw = preview.width - rn.w;
    addDelta(map, nodeId, { dw });
    ownDelta.dw = dw;
  }
  if (preview.height !== undefined) {
    const dh = preview.height - rn.h;
    addDelta(map, nodeId, { dh });
    ownDelta.dh = dh;
  }
  growAncestors(map, nodeId, parentOf, rendered, ownDelta);
  return map;
}

describe('live content-resize composition (2D)', () => {
  // root -> mid -> leaf, all manual so geometry is deterministic.
  const chain: AtlasDocument = {
    v: 1,
    nodes: [
      { id: 'root', name: 'Root', x: 0, y: 0 },
      { id: 'mid', name: 'Mid', parent: 'root', x: 0, y: 0 },
      { id: 'leaf', name: 'Leaf', parent: 'mid', x: 0, y: 0 },
    ],
    edges: [],
  };

  it('a width-only drag grows the Node and its ancestor with no child shift', () => {
    const rendered = projectAtlasNodes(chain);
    const mid = rendered.find((rn) => rn.node.id === 'mid')!;
    const widerMid = mid.w + 60;

    const deltas = contentResizeDelta2D(chain, 'mid', { width: widerMid });

    expect(deltas.get('mid')).toMatchObject({ dw: 60, dh: 0 });
    // Widening never shifts children (see the task's "Do NOT" list).
    expect(deltas.get('leaf')).toBeUndefined();
    expect(deltas.get('root')?.dw).toBeGreaterThan(0);
  });

  it('a diagonal drag on a leaf grows it and its ancestor on both axes and shifts children down', () => {
    // Resize the leaf itself, not mid — a leaf has no children to test the
    // no-shift rule against, so its own diagonal drag still composes with a
    // subtree shift of nothing (it's a no-op here) while ancestors grow.
    const rendered = projectAtlasNodes(chain);
    const leaf = rendered.find((rn) => rn.node.id === 'leaf')!;
    const widerLeaf = leaf.w + 60;
    const tallerLeaf = leaf.h + 40;

    const deltas = contentResizeDelta2D(chain, 'leaf', { width: widerLeaf, height: tallerLeaf });

    expect(deltas.get('leaf')).toMatchObject({ dw: 60, dh: 40 });
    expect(deltas.get('mid')?.dw).toBeGreaterThan(0);
    expect(deltas.get('mid')?.dh).toBeGreaterThan(0);
    expect(deltas.get('root')?.dw).toBeGreaterThan(0);
    expect(deltas.get('root')?.dh).toBeGreaterThan(0);
  });
});

describe('live content-resize composition — container frame (sizes the container box, not the header)', () => {
  // root -> mid -> leaf, all manual so geometry is deterministic. A
  // container's frame grip now sizes the container box itself (the
  // shrink-wrap floor from projection.ts) — a height (or width) delta grows
  // mid's own box and never shifts its children (R37-R39).
  const chain: AtlasDocument = {
    v: 1,
    nodes: [
      { id: 'root', name: 'Root', x: 0, y: 0 },
      { id: 'mid', name: 'Mid', parent: 'root', x: 0, y: 0 },
      { id: 'leaf', name: 'Leaf', parent: 'mid', x: 0, y: 0 },
    ],
    edges: [],
  };

  it('a height delta on a container grows it and its ancestor without shifting children', () => {
    const rendered = projectAtlasNodes(chain);
    const mid = rendered.find((rn) => rn.node.id === 'mid')!;
    const tallerMid = mid.h + 40;

    const deltas = contentResizeDelta2D(chain, 'mid', { height: tallerMid });

    // mid's own box grows by the height delta.
    expect(deltas.get('mid')).toMatchObject({ dh: 40 });
    // leaf (mid's only child) never moves — the container gains empty room
    // below it instead of pushing it down.
    expect(deltas.get('leaf')).toBeUndefined();
    // root, mid's ancestor, grows to contain mid's live extent.
    expect(deltas.get('root')?.dh).toBeGreaterThan(0);
  });

  it('a width delta on a container grows it and its ancestor without shifting children', () => {
    const rendered = projectAtlasNodes(chain);
    const mid = rendered.find((rn) => rn.node.id === 'mid')!;
    const widerMid = mid.w + 60;

    const deltas = contentResizeDelta2D(chain, 'mid', { width: widerMid });

    expect(deltas.get('mid')).toMatchObject({ dw: 60 });
    expect(deltas.get('leaf')).toBeUndefined();
    expect(deltas.get('root')?.dw).toBeGreaterThan(0);
  });
});

describe('Edge Tab (doc01.07.04 R44-R52)', () => {
  let container: HTMLDivElement;
  let dispose: (() => void) | undefined;

  // jsdom does not implement elementsFromPoint (the toast effect's target
  // hit-test); stub an empty hit list, overridden per test where needed.
  beforeEach(() => {
    Object.defineProperty(document, 'elementsFromPoint', {
      value: () => [],
      configurable: true,
    });
  });

  function mountCanvas(doc: AtlasDocument, extra: Partial<AtlasCanvasProps> = {}) {
    const dispatchDoc = vi.fn();
    container = document.createElement('div');
    document.body.appendChild(container);
    dispose = render(() => <AtlasCanvas doc={doc} dispatchDoc={dispatchDoc} {...extra} />, container);
    return { dispatchDoc };
  }

  afterEach(() => {
    dispose?.();
    container?.parentNode?.removeChild(container);
  });

  const twoNodes: AtlasDocument = {
    v: 1,
    nodes: [
      { id: 'a', name: 'A', x: 0, y: 0 },
      { id: 'b', name: 'B', x: 400, y: 0 },
    ],
    edges: [],
  };

  it('R44: renders an Edge Tab for each Node', () => {
    mountCanvas(twoNodes);
    expect(container.querySelector('[data-testid="edge-tab-a"]')).toBeTruthy();
    expect(container.querySelector('[data-testid="edge-tab-b"]')).toBeTruthy();
  });

  it("the tab is marked data-no-pan so a press on it can't start a marquee", () => {
    mountCanvas(twoNodes);
    const tab = container.querySelector('[data-testid="edge-tab-a"]')!;
    expect(tab.getAttribute('data-no-pan')).toBe('true');
  });

  it('R47/R48/R51: a tab press starts Edge creation, surfaced via the preview toast', () => {
    const messages: Array<string | null> = [];
    mountCanvas(twoNodes, { onEdgePreviewChange: (m) => messages.push(m) });

    const tab = container.querySelector('[data-testid="edge-tab-a"]') as HTMLElement;
    tab.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true, button: 0, clientX: 10, clientY: 10 }));

    expect(messages.at(-1)).toBe('Creating new edge from "A" (hint: hold ctrl to add a new node)');
  });

  it('R51: the toast names the destination while the pointer is over a valid target', () => {
    const messages: Array<string | null> = [];
    mountCanvas(twoNodes, { onEdgePreviewChange: (m) => messages.push(m) });
    const nodeB = container.querySelector('[data-node-id="b"]') as HTMLElement;
    Object.defineProperty(document, 'elementsFromPoint', {
      value: () => [nodeB],
      configurable: true,
    });

    const tab = container.querySelector('[data-testid="edge-tab-a"]') as HTMLElement;
    tab.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true, button: 0, clientX: 10, clientY: 10 }));

    expect(messages.at(-1)).toBe('Creating new edge from "A" to "B" (hint: hold ctrl to add a new node)');
  });

  it('R51/R52: holding Ctrl switches the toast to the pending new-node outcome, without the hint', () => {
    const messages: Array<string | null> = [];
    mountCanvas(twoNodes, { onEdgePreviewChange: (m) => messages.push(m) });

    const tab = container.querySelector('[data-testid="edge-tab-a"]') as HTMLElement;
    tab.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true, button: 0, clientX: 10, clientY: 10 }));
    // Dispatched on body, not window — jsdom would otherwise make `window`
    // itself the target, which the hotkey handler can't read a tagName from.
    document.body.dispatchEvent(new KeyboardEvent('keydown', { key: 'Control', ctrlKey: true, bubbles: true }));

    expect(messages.at(-1)).toBe('Creating new node with edge from "A"');
  });

  it('the source Node keeps its tab visible (lit) once a connection is armed', () => {
    mountCanvas(twoNodes);
    const tabA = container.querySelector('[data-testid="edge-tab-a"]') as HTMLElement;
    tabA.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true, button: 0, clientX: 10, clientY: 10 }));

    expect(tabA.style.opacity).toBe('1');
  });
});
