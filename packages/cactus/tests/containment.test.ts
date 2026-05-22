import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { findContainerAt } from '../src/geometry/containment';

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
});
