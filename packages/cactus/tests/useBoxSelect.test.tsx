import { describe, it, expect } from 'vitest';
import { render } from 'solid-js/web';
import { useBoxSelect, type NodeRect } from '../src/interactions/useBoxSelect';

function Harness(props: {
  trigger?: 'shift-drag' | 'drag';
  nodeRects: NodeRect[];
  onHits: (ids: string[]) => void;
  exposeEl: (el: HTMLDivElement) => void;
}) {
  let el: HTMLDivElement | undefined;
  useBoxSelect({
    transform: () => ({ x: 0, y: 0, k: 1 }),
    containerEl: () => el,
    getNodeRects: () => props.nodeRects,
    // eslint-disable-next-line solid/reactivity -- test harness; props are static
    trigger: props.trigger,
    // eslint-disable-next-line solid/reactivity -- test harness; props are static
    onBoxSelectHits: props.onHits,
  });
  return <div ref={(e) => { el = e; props.exposeEl(e); }} />;
}

function mount(trigger: 'shift-drag' | 'drag' | undefined, nodeRects: NodeRect[]) {
  const hits: string[][] = [];
  let el!: HTMLDivElement;
  const host = document.createElement('div');
  document.body.appendChild(host);
  const cleanup = render(
    () => (
      <Harness
        trigger={trigger}
        nodeRects={nodeRects}
        onHits={(ids) => hits.push(ids)}
        exposeEl={(e) => { el = e; }}
      />
    ),
    host
  );
  return { hits, el, cleanup };
}

// jsdom has no PointerEvent; MouseEvent with the pointer event type works
// since the hook only reads button/shiftKey/clientX/clientY.
const down = (el: HTMLElement, init: MouseEventInit) =>
  el.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true, ...init }));
const move = (init: MouseEventInit) => window.dispatchEvent(new MouseEvent('pointermove', init));
const up = () => window.dispatchEvent(new MouseEvent('pointerup', {}));

const NODE: NodeRect = { id: 'a', x: 10, y: 10, width: 50, height: 50 };

describe('useBoxSelect triggers', () => {
  it("'drag': plain left-drag marquees without Shift", () => {
    const { hits, el, cleanup } = mount('drag', [NODE]);
    down(el, { button: 0, clientX: 0, clientY: 0 });
    move({ clientX: 30, clientY: 30 });
    up();
    expect(hits).toEqual([['a']]);
    cleanup();
  });

  it("'drag': a plain background click (no movement) clears the selection", () => {
    const { hits, el, cleanup } = mount('drag', [NODE]);
    down(el, { button: 0, clientX: 0, clientY: 0 });
    up();
    expect(hits).toEqual([[]]);
    cleanup();
  });

  it("'drag': ignores non-left buttons", () => {
    const { hits, el, cleanup } = mount('drag', [NODE]);
    down(el, { button: 1, clientX: 0, clientY: 0 });
    move({ clientX: 30, clientY: 30 });
    up();
    expect(hits).toEqual([]);
    cleanup();
  });

  it("default 'shift-drag': plain drag does nothing, Shift+drag marquees", () => {
    const { hits, el, cleanup } = mount(undefined, [NODE]);
    down(el, { button: 0, clientX: 0, clientY: 0 });
    move({ clientX: 30, clientY: 30 });
    up();
    expect(hits).toEqual([]);

    down(el, { button: 0, shiftKey: true, clientX: 0, clientY: 0 });
    move({ clientX: 30, clientY: 30 });
    up();
    expect(hits).toEqual([['a']]);
    cleanup();
  });
});
