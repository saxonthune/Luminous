import { createComponent, createSignal } from 'solid-js';
import { render } from 'solid-js/web';
import { describe, expect, it, vi } from 'vitest';
import type { MerinoDocument } from '@luminous/core/merino';
import { MerinoOverview, initialCards, openMerinoOverviewCard, reconcileMerinoOverviewRoots, removeMerinoOverviewCardBranch, toggleMerinoOverviewCardPin, type MerinoOverviewDisclosureState } from '../MerinoOverview.tsx';

function seededDisclosure(source: MerinoDocument, rootIds: string[]) {
  // eslint-disable-next-line solid/reactivity -- returns the signal tuple for the caller to destructure
  return createSignal<MerinoOverviewDisclosureState>({
    cards: initialCards(source, 'requirements', rootIds),
    activeChildByParent: {},
  });
}

const doc: MerinoDocument = {
  v: 1,
  nodeTypes: [],
  edgeTypes: [],
  edges: [],
  nodes: [
    { id: 'root', tab: 'requirements', type: 'container', name: 'Root' },
    { id: 'a', tab: 'requirements', type: 'container', name: 'A', parent: 'root' },
    { id: 'b', tab: 'requirements', type: 'leaf', name: 'B', parent: 'root' },
    { id: 'a-1', tab: 'requirements', type: 'leaf', name: 'A1', parent: 'a' },
    { id: 'a-2', tab: 'requirements', type: 'leaf', name: 'A2', parent: 'a' },
  ],
};

describe('Merino Overview drill-out', () => {
  const rootState = (): MerinoOverviewDisclosureState => ({
    cards: [{ id: 'root', root: true, pinned: true, x: 40, y: 40, h: 420 }],
    activeChildByParent: {},
  });

  it('opens a child card to its parent’s right', () => {
    const next = openMerinoOverviewCard(rootState(), 'root', 'a');

    expect(next.cards.map((card) => card.id)).toEqual(['root', 'a']);
    expect(next.cards[1]).toMatchObject({ parentId: 'root', x: 384, y: 40, pinned: false });
    expect(next.activeChildByParent.root).toBe('a');
  });

  it('replaces an unpinned branch but retains a pinned sibling', () => {
    const withA = openMerinoOverviewCard(rootState(), 'root', 'a');
    const pinnedA = {
      ...withA,
      cards: withA.cards.map((card) => card.id === 'a' ? { ...card, pinned: true } : card),
    };
    const withPinnedAAndB = openMerinoOverviewCard(pinnedA, 'root', 'b');

    expect(withPinnedAAndB.cards.map((card) => card.id)).toEqual(['root', 'a', 'b']);
    expect(withPinnedAAndB.activeChildByParent.root).toBe('b');

    const unpinnedA = {
      ...withA,
      cards: withA.cards.map((card) => card.id === 'a' ? { ...card, pinned: false } : card),
    };
    expect(openMerinoOverviewCard(unpinnedA, 'root', 'b').cards.map((card) => card.id))
      .toEqual(['root', 'b']);

    const afterUnpin = toggleMerinoOverviewCardPin(withPinnedAAndB, 'a');
    expect(afterUnpin.cards.map((card) => card.id)).toEqual(['root', 'b']);
  });

  it('drops a deleted card and every card disclosed beneath it', () => {
    const withA = openMerinoOverviewCard(rootState(), 'root', 'a');
    const withA1 = openMerinoOverviewCard(withA, 'a', 'a-1');

    const next = removeMerinoOverviewCardBranch(withA1, 'a');
    expect(next.cards.map((card) => card.id)).toEqual(['root']);
    expect(next.activeChildByParent).toEqual({});
  });

  it('promotes an already-open child to an Overview root without resetting it', () => {
    const withA = openMerinoOverviewCard(rootState(), 'root', 'a');
    const movedA = {
      ...withA,
      cards: withA.cards.map((card) => card.id === 'a' ? { ...card, x: 700, h: 500 } : card),
    };
    const next = reconcileMerinoOverviewRoots(movedA, doc, 'requirements', ['root', 'a']);

    expect(next.cards.find((card) => card.id === 'a')).toMatchObject({
      root: true,
      pinned: true,
      x: 700,
      h: 500,
    });
    expect(next.cards.find((card) => card.id === 'a')?.parentId).toBeUndefined();
    expect(next.activeChildByParent.root).toBeUndefined();
  });

  it('edits the existing detail field from the description region', async () => {
    const overviewDoc: MerinoDocument = {
      ...doc,
      nodes: doc.nodes.map((node) => node.id === 'root'
        ? { ...node, id: 'ui-transition-graph' }
        : node.parent === 'root'
          ? { ...node, parent: 'ui-transition-graph' }
          : node),
    };
    const onSetText = vi.fn();
    const [disclosure, setDisclosure] = seededDisclosure(overviewDoc, ['ui-transition-graph']);
    const container = document.createElement('div');
    document.body.append(container);
    const dispose = render(() => createComponent(MerinoOverview, {
      doc: overviewDoc,
      zoom: 'in',
      sourceId: 'test',
      disclosure,
      setDisclosure,
      onSetText,
      onRename: vi.fn(),
      onSetType: vi.fn(),
      onAddChild: vi.fn(),
      onClone: vi.fn(),
      onDelete: vi.fn(),
    }), container);

    try {
      const item = [...container.querySelectorAll<HTMLElement>('[data-container-id^="merino-overview-row:"]')]
        .find((row) => row.textContent?.includes('A'));
      item?.click();
      await Promise.resolve();

      const description = container.querySelector<HTMLButtonElement>('button[title^="Click to expand"]');
      expect(description?.textContent).toContain('No description');
      description?.dispatchEvent(new MouseEvent('dblclick', { bubbles: true }));
      await Promise.resolve();

      const editor = container.querySelector<HTMLTextAreaElement>('textarea[aria-label="Description for A"]');
      expect(editor).not.toBeNull();
      editor!.value = 'Updated description';
      editor!.dispatchEvent(new Event('input', { bubbles: true }));
      editor!.blur();

      expect(onSetText).toHaveBeenCalledWith('a', 'Updated description');
    } finally {
      dispose();
      container.remove();
    }
  });

  it('preserves disclosure while the out level removes card interactions', async () => {
    const overviewDoc: MerinoDocument = {
      ...doc,
      nodes: doc.nodes.map((node) => node.id === 'root'
        ? { ...node, id: 'ui-transition-graph' }
        : node.parent === 'root'
          ? { ...node, parent: 'ui-transition-graph' }
          : node),
    };
    const [zoom, setZoom] = createSignal<'in' | 'out'>('in');
    const [disclosure, setDisclosure] = seededDisclosure(overviewDoc, ['ui-transition-graph']);
    const container = document.createElement('div');
    document.body.append(container);
    const dispose = render(() => createComponent(MerinoOverview, {
      doc: overviewDoc,
      get zoom() { return zoom(); },
      sourceId: 'test',
      disclosure,
      setDisclosure,
      onSetText: vi.fn(),
      onRename: vi.fn(),
      onSetType: vi.fn(),
      onAddChild: vi.fn(),
      onClone: vi.fn(),
      onDelete: vi.fn(),
    }), container);

    try {
      [...container.querySelectorAll<HTMLElement>('[data-container-id^="merino-overview-row:"]')]
        .find((row) => row.textContent?.includes('A'))?.click();
      await Promise.resolve();
      expect(container.querySelector('button[title^="Click to expand"]')).not.toBeNull();

      setZoom('out');
      await Promise.resolve();
      expect(container.textContent).toContain('A');
      expect(container.querySelector('button')).toBeNull();

      setZoom('in');
      await Promise.resolve();
      expect(container.querySelector('button[title^="Click to expand"]')).not.toBeNull();
    } finally {
      dispose();
      container.remove();
    }
  });

  it('renames from the header and adds a child to a Container Card', async () => {
    const overviewDoc: MerinoDocument = {
      v: 1,
      nodeTypes: [{ id: 'container', name: 'Container', color: 'accent-1', layout: 'container' }],
      edgeTypes: [],
      edges: [],
      nodes: [{ id: 'ui-transition-graph', tab: 'requirements', type: 'container', name: 'Graph' }],
    };
    const onRename = vi.fn();
    const onAddChild = vi.fn(() => 'n-1');
    const [disclosure, setDisclosure] = seededDisclosure(overviewDoc, ['ui-transition-graph']);
    const container = document.createElement('div');
    document.body.append(container);
    const dispose = render(() => createComponent(MerinoOverview, {
      doc: overviewDoc,
      zoom: 'in',
      sourceId: 'test',
      disclosure,
      setDisclosure,
      onSetText: vi.fn(),
      onRename,
      onSetType: vi.fn(),
      onAddChild,
      onClone: vi.fn(),
      onDelete: vi.fn(),
    }), container);

    try {
      const title = container.querySelector<HTMLDivElement>('div[title="Double-click to rename"]');
      expect(title?.textContent).toBe('Graph');
      title!.dispatchEvent(new MouseEvent('dblclick', { bubbles: true }));
      await Promise.resolve();
      const editor = container.querySelector<HTMLInputElement>('input[aria-label="Rename Graph"]');
      expect(editor).not.toBeNull();
      editor!.value = 'UI Transition Graph';
      editor!.blur();
      expect(onRename).toHaveBeenCalledWith('ui-transition-graph', 'UI Transition Graph');

      const addChild = [...container.querySelectorAll<HTMLButtonElement>('button')]
        .find((button) => button.textContent?.includes('Add child'));
      expect(addChild).not.toBeUndefined();
      addChild!.click();
      expect(onAddChild).toHaveBeenCalledWith('ui-transition-graph');

      const typeBadge = container.querySelector<HTMLButtonElement>('button[aria-label="Node Type for Graph"]');
      expect(typeBadge?.textContent).toContain('Container');
    } finally {
      dispose();
      container.remove();
    }
  });
});
