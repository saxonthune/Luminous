import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { findContainerAt, isOverContainerInterior } from '../src/geometry/containment';

// jsdom does not implement elementsFromPoint; stub it before each test.
beforeEach(() => {
  if (!document.elementsFromPoint) {
    document.elementsFromPoint = () => [];
  }
});

afterEach(() => {
  vi.restoreAllMocks();
});

function makeDropTarget(containerId: string): HTMLElement {
  const el = document.createElement('div');
  el.setAttribute('data-drop-target', 'true');
  el.setAttribute('data-container-id', containerId);
  return el;
}

function mockElementsFromPoint(elements: Element[]): void {
  vi.spyOn(document, 'elementsFromPoint').mockReturnValue(elements);
}

describe('findContainerAt', () => {
  it('returns innermost container when nested elements match (first in DOM order wins)', () => {
    const innerEl = makeDropTarget('inner');
    const outerEl = makeDropTarget('outer');
    // elementsFromPoint returns topmost-first; innermost child is topmost in DOM z-order
    mockElementsFromPoint([innerEl, outerEl]);

    expect(findContainerAt(100, 100)).toBe('inner');
  });

  it('returns null when no element has data-drop-target', () => {
    const el = document.createElement('div');
    mockElementsFromPoint([el]);

    expect(findContainerAt(50, 50)).toBeNull();
  });

  it('returns null for empty element list', () => {
    mockElementsFromPoint([]);

    expect(findContainerAt(0, 0)).toBeNull();
  });

  it('returns the single drop target when only one element matches', () => {
    const el = makeDropTarget('only');
    mockElementsFromPoint([el]);

    expect(findContainerAt(10, 10)).toBe('only');
  });

  it('skips elements without data-drop-target before finding one that has it', () => {
    const plain = document.createElement('div');
    const target = makeDropTarget('found');
    mockElementsFromPoint([plain, target]);

    expect(findContainerAt(10, 10)).toBe('found');
  });

  it('skips excluded container IDs, e.g. the node being dragged', () => {
    const dragged = makeDropTarget('dragged');
    const underneath = makeDropTarget('container');
    mockElementsFromPoint([dragged, underneath]);

    expect(findContainerAt(10, 10, new Set(['dragged']))).toBe('container');
  });

  it('returns null when every match is excluded', () => {
    const dragged = makeDropTarget('dragged');
    mockElementsFromPoint([dragged]);

    expect(findContainerAt(10, 10, new Set(['dragged']))).toBeNull();
  });
});

function stubRect(el: Element, rect: { left: number; top: number; width: number; height: number }): void {
  vi.spyOn(el, 'getBoundingClientRect').mockReturnValue({
    ...rect,
    right: rect.left + rect.width,
    bottom: rect.top + rect.height,
    x: rect.left,
    y: rect.top,
    toJSON: () => ({}),
  });
}

describe('isOverContainerInterior', () => {
  it('returns false for a leaf node with no [data-soft-container] descendant', () => {
    const node = document.createElement('div');
    expect(isOverContainerInterior(node, 5, 5)).toBe(false);
  });

  it('returns true for a point inside the soft-container interior rect', () => {
    const node = document.createElement('div');
    const interior = document.createElement('div');
    interior.setAttribute('data-soft-container', 'true');
    node.appendChild(interior);
    stubRect(interior, { left: 10, top: 10, width: 100, height: 100 });

    expect(isOverContainerInterior(node, 50, 50)).toBe(true);
  });

  it('returns false for a point outside the soft-container interior rect (e.g. the header band)', () => {
    const node = document.createElement('div');
    const interior = document.createElement('div');
    interior.setAttribute('data-soft-container', 'true');
    node.appendChild(interior);
    // Header occupies y:[0,10) above the interior's inset top.
    stubRect(interior, { left: 10, top: 10, width: 100, height: 100 });

    expect(isOverContainerInterior(node, 50, 5)).toBe(false);
  });
});
