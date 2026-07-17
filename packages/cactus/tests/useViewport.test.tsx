import { describe, it, expect } from 'vitest';
import { shouldViewportPan } from '../src/interactions/useViewport';

function buildDom() {
  const panSurface = document.createElement('div');
  panSurface.setAttribute('data-pan-surface', '');
  document.body.appendChild(panSurface);

  // Node div is a sibling of the pan surface, not a descendant.
  const node = document.createElement('div');
  node.setAttribute('data-container-id', 'node-1');
  node.setAttribute('data-no-pan', 'true');
  document.body.appendChild(node);

  // Edge label standing in for the SVG <text> — pointer-events: auto, no
  // data-pan-surface ancestor. This is bug 1a: it must not steal the pan.
  const label = document.createElement('div');
  label.style.pointerEvents = 'auto';
  document.body.appendChild(label);

  return { panSurface, node, label };
}

describe('shouldViewportPan', () => {
  const { panSurface, node, label } = buildDom();

  it('mousedown on the pan surface pans when leftDragPan is true', () => {
    expect(
      shouldViewportPan(
        { type: 'mousedown', button: 0, target: panSurface },
        { leftDragPan: true }
      )
    ).toBe(true);
  });

  it('mousedown on the pan surface does not pan when leftDragPan is false', () => {
    expect(
      shouldViewportPan(
        { type: 'mousedown', button: 0, target: panSurface },
        { leftDragPan: false }
      )
    ).toBe(false);
  });

  it('mousedown on a node never pans (drag case)', () => {
    expect(
      shouldViewportPan(
        { type: 'mousedown', button: 0, target: node },
        { leftDragPan: true }
      )
    ).toBe(false);
  });

  it('mousedown on an edge label never pans (bug 1a regression)', () => {
    expect(
      shouldViewportPan(
        { type: 'mousedown', button: 0, target: label },
        { leftDragPan: true }
      )
    ).toBe(false);
  });

  it('middle-drag (button 1) always pans, even off-surface', () => {
    expect(
      shouldViewportPan(
        { type: 'mousedown', button: 1, target: node },
        { leftDragPan: true }
      )
    ).toBe(true);
  });

  it('wheel always pans, regardless of target', () => {
    expect(
      shouldViewportPan({ type: 'wheel', target: node }, { leftDragPan: false })
    ).toBe(true);
  });

  it('touchstart pans only on the pan surface', () => {
    expect(
      shouldViewportPan({ type: 'touchstart', target: node }, { leftDragPan: true })
    ).toBe(false);
    expect(
      shouldViewportPan({ type: 'touchstart', target: panSurface }, { leftDragPan: true })
    ).toBe(true);
  });
});
