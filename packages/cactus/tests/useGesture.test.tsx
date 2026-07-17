import { describe, it, expect } from 'vitest';
import { render } from 'solid-js/web';
import { useGesture, type Gesture } from '../src/interactions/useGesture';

function Harness(props: {
  zoomScale: number;
  onDragStart: (nodeId: string) => void;
  onDrag: (nodeId: string, dx: number, dy: number) => void;
  onDragEnd: (nodeId: string, dx: number, dy: number) => void;
  exposeEl: (el: HTMLDivElement) => void;
  exposeGesture: (g: () => Gesture) => void;
  exposeIsDraggingNode: (fn: (id: string) => boolean) => void;
}) {
  const gesture = useGesture({
    // eslint-disable-next-line solid/reactivity -- test harness; props are static
    zoomScale: () => props.zoomScale,
    callbacks: {
      // eslint-disable-next-line solid/reactivity -- test harness; props are static
      onDragStart: (nodeId) => props.onDragStart(nodeId),
      // eslint-disable-next-line solid/reactivity -- test harness; props are static
      onDrag: (nodeId, dx, dy) => props.onDrag(nodeId, dx, dy),
      // eslint-disable-next-line solid/reactivity -- test harness; props are static
      onDragEnd: (nodeId, dx, dy) => props.onDragEnd(nodeId, dx, dy),
    },
  });
  props.exposeGesture(gesture.gesture);
  props.exposeIsDraggingNode(gesture.isDraggingNode);
  return (
    <div
      ref={(e) => props.exposeEl(e)}
      onPointerDown={(e) => gesture.beginPress('a', e)}
    />
  );
}

function mount(zoomScale = 1) {
  const started: string[] = [];
  const dragged: Array<[string, number, number]> = [];
  const ended: Array<[string, number, number]> = [];
  let el!: HTMLDivElement;
  let gesture!: () => Gesture;
  let isDraggingNode!: (id: string) => boolean;
  const host = document.createElement('div');
  document.body.appendChild(host);
  const cleanup = render(
    () => (
      <Harness
        zoomScale={zoomScale}
        onDragStart={(id) => started.push(id)}
        onDrag={(id, dx, dy) => dragged.push([id, dx, dy])}
        onDragEnd={(id, dx, dy) => ended.push([id, dx, dy])}
        exposeEl={(e) => { el = e; }}
        exposeGesture={(g) => { gesture = g; }}
        exposeIsDraggingNode={(fn) => { isDraggingNode = fn; }}
      />
    ),
    host
  );
  return { started, dragged, ended, el, gesture: () => gesture(), isDraggingNode: (id: string) => isDraggingNode(id), cleanup };
}

// jsdom has no PointerEvent; MouseEvent with the pointer event type works
// since the hook only reads button/clientX/clientY/pointerId.
const down = (el: HTMLElement, init: MouseEventInit) =>
  el.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true, ...init }));
const move = (init: MouseEventInit) => window.dispatchEvent(new MouseEvent('pointermove', init));
const up = () => window.dispatchEvent(new MouseEvent('pointerup', {}));

describe('useGesture', () => {
  it('pointerdown on a node enters pressing without firing onDragStart', () => {
    const { started, el, gesture, cleanup } = mount();
    down(el, { button: 0, clientX: 0, clientY: 0 });
    expect(gesture()).toEqual({ kind: 'pressing', nodeId: 'a', startX: 0, startY: 0 });
    expect(started).toEqual([]);
    cleanup();
  });

  it('move below threshold stays pressing, no onDrag', () => {
    const { started, dragged, el, gesture, cleanup } = mount();
    down(el, { button: 0, clientX: 0, clientY: 0 });
    move({ clientX: 2, clientY: 0 });
    expect(gesture().kind).toBe('pressing');
    expect(started).toEqual([]);
    expect(dragged).toEqual([]);
    cleanup();
  });

  it('move past threshold transitions to draggingNode and fires onDragStart once', () => {
    const { started, el, gesture, cleanup } = mount(2);
    down(el, { button: 0, clientX: 0, clientY: 0 });
    move({ clientX: 5, clientY: 0 });
    expect(gesture().kind).toBe('draggingNode');
    expect(started).toEqual(['a']);
    // canvas-space delta divides screen delta by zoomScale (k=2 halves it)
    expect(gesture()).toMatchObject({ kind: 'draggingNode', dx: 2.5, dy: 0 });
    move({ clientX: 5, clientY: 0 });
    expect(started).toEqual(['a']);
    cleanup();
  });

  it('further move fires onDrag with cumulative canvas-space delta', () => {
    const { dragged, el, cleanup } = mount(2);
    down(el, { button: 0, clientX: 0, clientY: 0 });
    move({ clientX: 5, clientY: 0 });
    move({ clientX: 11, clientY: 4 });
    expect(dragged).toEqual([['a', 5.5, 2]]);
    cleanup();
  });

  it('pointerup after dragging fires onDragEnd and returns to idle', () => {
    const { ended, el, gesture, cleanup } = mount(1);
    down(el, { button: 0, clientX: 0, clientY: 0 });
    move({ clientX: 10, clientY: 0 });
    up();
    expect(ended).toEqual([['a', 10, 0]]);
    expect(gesture()).toEqual({ kind: 'idle' });
    cleanup();
  });

  it('press-release below threshold never fires onDragStart or onDragEnd', () => {
    const { started, ended, el, gesture, cleanup } = mount();
    down(el, { button: 0, clientX: 0, clientY: 0 });
    move({ clientX: 1, clientY: 1 });
    up();
    expect(started).toEqual([]);
    expect(ended).toEqual([]);
    expect(gesture()).toEqual({ kind: 'idle' });
    cleanup();
  });

  it('isDraggingNode is true only for the active node', () => {
    const { el, isDraggingNode, cleanup } = mount();
    expect(isDraggingNode('a')).toBe(false);
    expect(isDraggingNode('b')).toBe(false);
    down(el, { button: 0, clientX: 0, clientY: 0 });
    move({ clientX: 10, clientY: 0 });
    expect(isDraggingNode('a')).toBe(true);
    expect(isDraggingNode('b')).toBe(false);
    up();
    expect(isDraggingNode('a')).toBe(false);
    cleanup();
  });

  it('ignores right-button and middle-button pointerdown', () => {
    const { started, gesture, el, cleanup } = mount();
    down(el, { button: 2, clientX: 0, clientY: 0 });
    expect(gesture()).toEqual({ kind: 'idle' });
    down(el, { button: 1, clientX: 0, clientY: 0 });
    expect(gesture()).toEqual({ kind: 'idle' });
    move({ clientX: 10, clientY: 0 });
    expect(started).toEqual([]);
    cleanup();
  });
});
