import { describe, it, expect, vi } from 'vitest';
import { render } from 'solid-js/web';
import { useGesture, type Gesture } from '../src/interactions/useGesture';
import type { NodeRect } from '../src/interactions/useBoxSelect';

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

  it('a press without movement does not capture the pointer, and a click on a child fires', () => {
    const { el, cleanup } = mount();
    el.setPointerCapture = vi.fn();
    el.releasePointerCapture = vi.fn();
    const child = document.createElement('button');
    el.appendChild(child);
    const onChildClick = vi.fn();
    child.addEventListener('click', onChildClick);

    down(el, { button: 0, clientX: 0, clientY: 0 });
    expect(el.setPointerCapture).not.toHaveBeenCalled();
    up();
    expect(el.releasePointerCapture).not.toHaveBeenCalled();

    // Never captured, so the click dispatches to the child normally instead
    // of being redirected to the capturing ancestor.
    child.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    expect(onChildClick).toHaveBeenCalledTimes(1);
    cleanup();
  });

  it('crossing the drag threshold captures the pointer, and release frees it', () => {
    const { el, cleanup } = mount();
    el.setPointerCapture = vi.fn();
    el.releasePointerCapture = vi.fn();

    down(el, { button: 0, clientX: 0, clientY: 0 });
    move({ clientX: 10, clientY: 0 });
    expect(el.setPointerCapture).toHaveBeenCalledTimes(1);
    up();
    expect(el.releasePointerCapture).toHaveBeenCalledTimes(1);
    cleanup();
  });
});

function MarqueeHarness(props: {
  trigger?: 'shift-drag' | 'drag';
  nodeRects: NodeRect[];
  onHits: (ids: string[]) => void;
  exposeEl: (el: HTMLDivElement) => void;
}) {
  let el: HTMLDivElement | undefined;
  useGesture({
    zoomScale: () => 1,
    callbacks: {},
    boxSelect: {
      transform: () => ({ x: 0, y: 0, k: 1 }),
      containerEl: () => el,
      getNodeRects: () => props.nodeRects,
      // eslint-disable-next-line solid/reactivity -- test harness; props are static
      trigger: props.trigger,
      // eslint-disable-next-line solid/reactivity -- test harness; props are static
      onBoxSelectHits: props.onHits,
    },
  });
  return <div ref={(e) => { el = e; props.exposeEl(e); }} />;
}

function mountMarquee(trigger: 'shift-drag' | 'drag' | undefined, nodeRects: NodeRect[]) {
  const hits: string[][] = [];
  let el!: HTMLDivElement;
  const host = document.createElement('div');
  document.body.appendChild(host);
  const cleanup = render(
    () => (
      <MarqueeHarness
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

const MARQUEE_NODE: NodeRect = { id: 'a', x: 10, y: 10, width: 50, height: 50 };

type ConnectDropInfo = { source: string; sourceHandle: string | null; clientX: number; clientY: number; ctrlKey: boolean };

function ConnectHarness(props: {
  onConnect: (connection: { source: string; sourceHandle: string | null; target: string; targetHandle: string | null }) => void;
  onConnectDrop?: (info: ConnectDropInfo) => void;
  isValidConnection?: (connection: { source: string; sourceHandle: string | null; target: string; targetHandle: string | null }) => boolean;
  exposeGesture: (g: () => Gesture) => void;
  exposeBeginConnect: (fn: (sourceId: string, sourceHandle: string | null, clientX: number, clientY: number) => void) => void;
}) {
  const gesture = useGesture({
    zoomScale: () => 1,
    callbacks: {},
    connection: {
      screenToCanvas: (x, y) => ({ x, y }),
      // eslint-disable-next-line solid/reactivity -- test harness; props are static
      onConnect: (c) => props.onConnect(c),
      // eslint-disable-next-line solid/reactivity -- test harness; props are static
      isValidConnection: props.isValidConnection,
      // eslint-disable-next-line solid/reactivity -- test harness; props are static
      onConnectDrop: props.onConnectDrop ? (info) => props.onConnectDrop!(info) : undefined,
    },
  });
  props.exposeGesture(gesture.gesture);
  props.exposeBeginConnect(gesture.beginConnect);
  return <div />;
}

function mountConnect(
  isValidConnection?: (connection: { source: string; sourceHandle: string | null; target: string; targetHandle: string | null }) => boolean,
  onConnectDrop?: (info: ConnectDropInfo) => void,
) {
  const connected: Array<{ source: string; sourceHandle: string | null; target: string; targetHandle: string | null }> = [];
  const dropped: ConnectDropInfo[] = [];
  let gesture!: () => Gesture;
  let beginConnect!: (sourceId: string, sourceHandle: string | null, clientX: number, clientY: number) => void;
  const host = document.createElement('div');
  document.body.appendChild(host);
  const cleanup = render(
    () => (
      <ConnectHarness
        onConnect={(c) => connected.push(c)}
        onConnectDrop={onConnectDrop ? (info) => { dropped.push(info); onConnectDrop(info); } : (info) => dropped.push(info)}
        isValidConnection={isValidConnection}
        exposeGesture={(g) => { gesture = g; }}
        exposeBeginConnect={(fn) => { beginConnect = fn; }}
      />
    ),
    host
  );
  return { connected, dropped, gesture: () => gesture(), beginConnect: (...args: Parameters<typeof beginConnect>) => beginConnect(...args), cleanup };
}

describe('useGesture connecting', () => {
  it('beginConnect enters connecting with the source and start coords', () => {
    const { gesture, beginConnect, cleanup } = mountConnect();
    beginConnect('node-a', 'out', 10, 20);
    expect(gesture()).toEqual({
      kind: 'connecting',
      sourceId: 'node-a',
      sourceHandle: 'out',
      startCanvasX: 10,
      startCanvasY: 20,
      currentScreenX: 10,
      currentScreenY: 20,
    });
    cleanup();
  });

  it('pointermove updates the preview coords', async () => {
    const { gesture, beginConnect, cleanup } = mountConnect();
    beginConnect('node-a', null, 10, 20);
    move({ clientX: 30, clientY: 40 });
    await new Promise((resolve) => requestAnimationFrame(resolve));
    expect(gesture()).toMatchObject({ kind: 'connecting', currentScreenX: 30, currentScreenY: 40 });
    cleanup();
  });

  it('R47: drag past the threshold then release over a data-connection-target fires onConnect', () => {
    const target = document.createElement('div');
    target.setAttribute('data-connection-target', 'true');
    target.setAttribute('data-node-id', 'node-b');
    target.setAttribute('data-handle-id', 'in');
    document.body.appendChild(target);
    Object.defineProperty(document, 'elementsFromPoint', {
      value: () => [target],
      configurable: true,
    });

    const { gesture, connected, beginConnect, cleanup } = mountConnect();
    beginConnect('node-a', 'out', 10, 20);
    move({ clientX: 40, clientY: 20 });
    up();
    expect(connected).toEqual([{ source: 'node-a', sourceHandle: 'out', target: 'node-b', targetHandle: 'in' }]);
    expect(gesture()).toEqual({ kind: 'idle' });
    cleanup();
    target.remove();
  });

  it('R47: drag past the threshold then release over empty space does not fire onConnect', () => {
    Object.defineProperty(document, 'elementsFromPoint', {
      value: () => [],
      configurable: true,
    });

    const { connected, gesture, beginConnect, cleanup } = mountConnect();
    beginConnect('node-a', 'out', 10, 20);
    move({ clientX: 40, clientY: 20 });
    up();
    expect(connected).toEqual([]);
    expect(gesture()).toEqual({ kind: 'idle' });
    cleanup();
  });

  it('isValidConnection returning false suppresses onConnect on a drag-release', () => {
    const target = document.createElement('div');
    target.setAttribute('data-connection-target', 'true');
    target.setAttribute('data-node-id', 'node-b');
    document.body.appendChild(target);
    Object.defineProperty(document, 'elementsFromPoint', {
      value: () => [target],
      configurable: true,
    });

    const { connected, beginConnect, cleanup } = mountConnect(() => false);
    beginConnect('node-a', 'out', 10, 20);
    move({ clientX: 40, clientY: 20 });
    up();
    expect(connected).toEqual([]);
    cleanup();
    target.remove();
  });

  it('R48: a release within the drag threshold arms instead of completing, then a click on a target fires onConnect', () => {
    const target = document.createElement('div');
    target.setAttribute('data-connection-target', 'true');
    target.setAttribute('data-node-id', 'node-b');
    document.body.appendChild(target);
    Object.defineProperty(document, 'elementsFromPoint', {
      value: () => [target],
      configurable: true,
    });

    const { gesture, connected, beginConnect, cleanup } = mountConnect();
    beginConnect('node-a', 'out', 10, 20);
    up();
    expect(gesture().kind).toBe('connecting');
    expect(connected).toEqual([]);

    down(target, { button: 0, clientX: 15, clientY: 22 });
    expect(connected).toEqual([{ source: 'node-a', sourceHandle: 'out', target: 'node-b', targetHandle: null }]);
    expect(gesture()).toEqual({ kind: 'idle' });
    cleanup();
    target.remove();
  });

  it('R48: the armed completion swallows the pointerdown so it never reaches the target', () => {
    const target = document.createElement('div');
    target.setAttribute('data-connection-target', 'true');
    target.setAttribute('data-node-id', 'node-b');
    document.body.appendChild(target);
    Object.defineProperty(document, 'elementsFromPoint', {
      value: () => [target],
      configurable: true,
    });
    const onTargetPointerDown = vi.fn();
    target.addEventListener('pointerdown', onTargetPointerDown);

    const { beginConnect, cleanup } = mountConnect();
    beginConnect('node-a', 'out', 10, 20);
    up();
    down(target, { button: 0, clientX: 15, clientY: 22 });
    expect(onTargetPointerDown).not.toHaveBeenCalled();
    cleanup();
    target.remove();
  });

  it('R48: a right-button press while armed is ignored, leaving the gesture connecting', () => {
    const { gesture, connected, beginConnect, cleanup } = mountConnect();
    beginConnect('node-a', 'out', 10, 20);
    up();
    window.dispatchEvent(new MouseEvent('pointerdown', { button: 2, clientX: 15, clientY: 22 }));
    expect(gesture().kind).toBe('connecting');
    expect(connected).toEqual([]);

    // Clean up the still-armed gesture so its window listener doesn't leak
    // into later tests.
    window.dispatchEvent(new MouseEvent('pointerdown', { button: 0, clientX: 15, clientY: 22 }));
    cleanup();
  });

  it('R52: Ctrl + release reports onConnectDrop instead of completing onConnect, even over a valid target', () => {
    const target = document.createElement('div');
    target.setAttribute('data-connection-target', 'true');
    target.setAttribute('data-node-id', 'node-b');
    document.body.appendChild(target);
    Object.defineProperty(document, 'elementsFromPoint', {
      value: () => [target],
      configurable: true,
    });

    const { gesture, connected, dropped, beginConnect, cleanup } = mountConnect();
    beginConnect('node-a', 'out', 10, 20);
    move({ clientX: 40, clientY: 20 });
    window.dispatchEvent(new MouseEvent('pointerup', { ctrlKey: true, clientX: 40, clientY: 20 }));
    expect(connected).toEqual([]);
    expect(dropped).toEqual([{ source: 'node-a', sourceHandle: 'out', clientX: 40, clientY: 20, ctrlKey: true }]);
    expect(gesture()).toEqual({ kind: 'idle' });
    cleanup();
    target.remove();
  });

  it('R52: Ctrl + click while armed reports onConnectDrop', () => {
    const { dropped, beginConnect, cleanup } = mountConnect();
    beginConnect('node-a', 'out', 10, 20);
    up();
    window.dispatchEvent(new MouseEvent('pointerdown', { button: 0, ctrlKey: true, clientX: 15, clientY: 22 }));
    expect(dropped).toEqual([{ source: 'node-a', sourceHandle: 'out', clientX: 15, clientY: 22, ctrlKey: true }]);
    cleanup();
  });
});

function ResizeHarness(props: {
  zoomScale: number;
  onResizeStart: (nodeId: string, dir: { horizontal: string; vertical: string }) => void;
  onResize: (nodeId: string, deltaWidth: number, deltaHeight: number, dir: { horizontal: string; vertical: string }) => void;
  onResizeEnd: (nodeId: string) => void;
  exposeGesture: (g: () => Gesture) => void;
  exposeBeginResize: (
    fn: (nodeId: string, direction: { horizontal: 'left' | 'right' | 'none'; vertical: 'top' | 'bottom' | 'none' }, event: PointerEvent) => void
  ) => void;
}) {
  const gesture = useGesture({
    // eslint-disable-next-line solid/reactivity -- test harness; props are static
    zoomScale: () => props.zoomScale,
    callbacks: {
      // eslint-disable-next-line solid/reactivity -- test harness; props are static
      onResizeStart: (nodeId, dir) => props.onResizeStart(nodeId, dir),
      // eslint-disable-next-line solid/reactivity -- test harness; props are static
      onResize: (nodeId, dw, dh, dir) => props.onResize(nodeId, dw, dh, dir),
      // eslint-disable-next-line solid/reactivity -- test harness; props are static
      onResizeEnd: (nodeId) => props.onResizeEnd(nodeId),
    },
  });
  props.exposeGesture(gesture.gesture);
  props.exposeBeginResize(gesture.beginResize);
  return <div />;
}

function mountResize(zoomScale = 1) {
  const started: Array<[string, { horizontal: string; vertical: string }]> = [];
  const resized: Array<[string, number, number, { horizontal: string; vertical: string }]> = [];
  const ended: string[] = [];
  let gesture!: () => Gesture;
  let beginResize!: (
    nodeId: string,
    direction: { horizontal: 'left' | 'right' | 'none'; vertical: 'top' | 'bottom' | 'none' },
    event: PointerEvent
  ) => void;
  const host = document.createElement('div');
  document.body.appendChild(host);
  const cleanup = render(
    () => (
      <ResizeHarness
        zoomScale={zoomScale}
        onResizeStart={(nodeId, dir) => started.push([nodeId, dir])}
        onResize={(nodeId, dw, dh, dir) => resized.push([nodeId, dw, dh, dir])}
        onResizeEnd={(nodeId) => ended.push(nodeId)}
        exposeGesture={(g) => { gesture = g; }}
        exposeBeginResize={(fn) => { beginResize = fn; }}
      />
    ),
    host
  );
  return {
    started,
    resized,
    ended,
    gesture: () => gesture(),
    beginResize: (...args: Parameters<typeof beginResize>) => beginResize(...args),
    cleanup,
  };
}

const resizeDown = (init: MouseEventInit) => new MouseEvent('pointerdown', { bubbles: true, ...init }) as unknown as PointerEvent;

describe('useGesture resizing', () => {
  it('beginResize enters resizing with the node, direction, and start coords', () => {
    const { gesture, beginResize, cleanup } = mountResize();
    beginResize('a', { horizontal: 'right', vertical: 'none' }, resizeDown({ clientX: 10, clientY: 20 }));
    expect(gesture()).toEqual({ kind: 'resizing', nodeId: 'a', dir: { horizontal: 'right', vertical: 'none' }, startX: 10, startY: 20 });
    cleanup();
  });

  it('right/bottom direction produces positive signed deltas on move', () => {
    const { resized, beginResize, cleanup } = mountResize();
    beginResize('a', { horizontal: 'right', vertical: 'bottom' }, resizeDown({ clientX: 0, clientY: 0 }));
    move({ clientX: 15, clientY: 8 });
    expect(resized).toEqual([['a', 15, 8, { horizontal: 'right', vertical: 'bottom' }]]);
    cleanup();
  });

  it('left/top direction inverts the sign', () => {
    const { resized, beginResize, cleanup } = mountResize();
    beginResize('a', { horizontal: 'left', vertical: 'top' }, resizeDown({ clientX: 0, clientY: 0 }));
    move({ clientX: 15, clientY: 8 });
    expect(resized).toEqual([['a', -15, -8, { horizontal: 'left', vertical: 'top' }]]);
    cleanup();
  });

  it('zoom scale divides the delta', () => {
    const { resized, beginResize, cleanup } = mountResize(2);
    beginResize('a', { horizontal: 'right', vertical: 'bottom' }, resizeDown({ clientX: 0, clientY: 0 }));
    move({ clientX: 10, clientY: 4 });
    expect(resized).toEqual([['a', 5, 2, { horizontal: 'right', vertical: 'bottom' }]]);
    cleanup();
  });

  it('pointerup fires onResizeEnd and returns to idle', () => {
    const { started, ended, gesture, beginResize, cleanup } = mountResize();
    beginResize('a', { horizontal: 'right', vertical: 'none' }, resizeDown({ clientX: 0, clientY: 0 }));
    expect(started).toEqual([['a', { horizontal: 'right', vertical: 'none' }]]);
    move({ clientX: 5, clientY: 0 });
    up();
    expect(ended).toEqual(['a']);
    expect(gesture()).toEqual({ kind: 'idle' });
    cleanup();
  });
});

describe('useGesture marquee', () => {
  it("'drag': plain left-drag marquees without Shift", () => {
    const { hits, el, cleanup } = mountMarquee('drag', [MARQUEE_NODE]);
    down(el, { button: 0, clientX: 0, clientY: 0 });
    move({ clientX: 30, clientY: 30 });
    up();
    expect(hits).toEqual([['a']]);
    cleanup();
  });

  it("'drag': a plain background click (no movement) clears the selection", () => {
    const { hits, el, cleanup } = mountMarquee('drag', [MARQUEE_NODE]);
    down(el, { button: 0, clientX: 0, clientY: 0 });
    up();
    expect(hits).toEqual([[]]);
    cleanup();
  });

  it("'drag': ignores non-left buttons", () => {
    const { hits, el, cleanup } = mountMarquee('drag', [MARQUEE_NODE]);
    down(el, { button: 1, clientX: 0, clientY: 0 });
    move({ clientX: 30, clientY: 30 });
    up();
    expect(hits).toEqual([]);
    cleanup();
  });

  it("default 'shift-drag': plain drag does nothing, Shift+drag marquees", () => {
    const { hits, el, cleanup } = mountMarquee(undefined, [MARQUEE_NODE]);
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

  function stubRect(target: Element, rect: { left: number; top: number; width: number; height: number }): void {
    vi.spyOn(target, 'getBoundingClientRect').mockReturnValue({
      ...rect,
      right: rect.left + rect.width,
      bottom: rect.top + rect.height,
      x: rect.left,
      y: rect.top,
      toJSON: () => ({}),
    });
  }

  /** A node div shaped like NodeContainer.tsx's output: an outer
   * data-container-id div wrapping a data-soft-container interior. */
  function appendContainerNode(
    parent: HTMLElement,
    interiorRect: { left: number; top: number; width: number; height: number },
  ): HTMLElement {
    const node = document.createElement('div');
    node.setAttribute('data-container-id', 'container-a');
    const interior = document.createElement('div');
    interior.setAttribute('data-soft-container', 'true');
    node.appendChild(interior);
    parent.appendChild(node);
    stubRect(interior, interiorRect);
    return node;
  }

  it("'drag': a press on a container's soft-container interior starts a marquee", () => {
    const { hits, el, cleanup } = mountMarquee('drag', [MARQUEE_NODE]);
    const node = appendContainerNode(el, { left: 0, top: 0, width: 100, height: 100 });
    // The interior press target is the outer node div itself — the interior
    // element is pointer-events:none in NodeContainer.tsx, so it never
    // receives the native hit-test (see NodeContainer.tsx).
    down(node, { button: 0, clientX: 40, clientY: 40 });
    move({ clientX: 30, clientY: 30 });
    up();
    expect(hits).toEqual([['a']]);
    cleanup();
  });

  it("'drag': a press outside a container's soft-container interior (its header/frame) does not marquee", () => {
    const { hits, el, cleanup } = mountMarquee('drag', [MARQUEE_NODE]);
    // Interior inset starting at y:20 leaves a 20px header band above it.
    const node = appendContainerNode(el, { left: 0, top: 20, width: 100, height: 100 });
    down(node, { button: 0, clientX: 40, clientY: 5 });
    move({ clientX: 30, clientY: 30 });
    up();
    expect(hits).toEqual([]);
    cleanup();
  });

  it("'drag': a press on a leaf node (no soft-container interior) does not marquee", () => {
    const { hits, el, cleanup } = mountMarquee('drag', [MARQUEE_NODE]);
    const leaf = document.createElement('div');
    leaf.setAttribute('data-container-id', 'leaf-a');
    el.appendChild(leaf);
    down(leaf, { button: 0, clientX: 40, clientY: 40 });
    move({ clientX: 30, clientY: 30 });
    up();
    expect(hits).toEqual([]);
    cleanup();
  });
});
