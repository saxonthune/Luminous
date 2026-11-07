import { createSignal, onCleanup, Show } from 'solid-js';
import { resizedCanvas, type CanvasSize } from '../canvas-resize.js';

/** Preview only during the gesture; the owner applies dimensions once on release. */
export function CanvasResizeHandle(props: {
  section: () => HTMLElement;
  minimum: () => CanvasSize;
  onCommit: (size: CanvasSize) => void;
}) {
  const [preview, setPreview] = createSignal<CanvasSize & { left: number }>();
  let button!: HTMLButtonElement;
  let gesture: { pointer: number; start: CanvasSize; minimum: CanvasSize; x: number; y: number; clientX: number; clientY: number } | undefined;
  function update() {
    if (!gesture) return;
    const size = resizedCanvas(gesture.start, gesture.minimum,
      gesture.clientX + window.scrollX - gesture.x,
      gesture.clientY + window.scrollY - gesture.y);
    setPreview({ ...size, left: (gesture.start.width - size.width) / 2 });
  }
  function stop(commit: boolean) {
    if (!gesture) return;
    const pointer = gesture.pointer;
    const size = preview();
    gesture = undefined;
    setPreview(undefined);
    window.removeEventListener('scroll', update, true);
    window.removeEventListener('resize', cancel);
    window.removeEventListener('keydown', escape, true);
    if (button.hasPointerCapture(pointer)) button.releasePointerCapture(pointer);
    if (commit && size) props.onCommit(size);
  }
  const cancel = () => stop(false);
  function escape(event: KeyboardEvent) {
    if (event.key !== 'Escape') return;
    event.preventDefault(); event.stopImmediatePropagation(); stop(false);
  }
  onCleanup(cancel);
  return <>
    <button ref={button} type="button" class="portable-canvas-resize" aria-label="Resize canvas" title="Drag to enlarge canvas; Escape cancels"
      onPointerDown={event => {
        if (event.button !== 0 || gesture) return;
        event.preventDefault(); event.stopPropagation();
        const rect = props.section().getBoundingClientRect();
        gesture = { pointer: event.pointerId, start: { width: rect.width, height: rect.height }, minimum: props.minimum(), x: event.pageX, y: event.pageY, clientX: event.clientX, clientY: event.clientY };
        button.setPointerCapture(event.pointerId);
        setPreview({ ...gesture.start, left: 0 });
        window.addEventListener('scroll', update, true);
        window.addEventListener('resize', cancel);
        window.addEventListener('keydown', escape, true);
      }}
      onPointerMove={event => {
        if (!gesture || gesture.pointer !== event.pointerId) return;
        event.preventDefault(); gesture.clientX = event.clientX; gesture.clientY = event.clientY; update();
      }}
      onPointerUp={event => {
        if (!gesture || gesture.pointer !== event.pointerId) return;
        event.preventDefault(); event.stopPropagation();
        gesture.clientX = event.clientX; gesture.clientY = event.clientY; update(); stop(true);
      }}
      onPointerCancel={cancel} onLostPointerCapture={cancel}
      onKeyDown={event => {
        if (!['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(event.key)) return;
        event.preventDefault(); event.stopPropagation();
        const rect = props.section().getBoundingClientRect();
        const delta = event.shiftKey ? 40 : 10;
        props.onCommit(resizedCanvas(rect, props.minimum(), event.key === 'ArrowLeft' ? -delta : event.key === 'ArrowRight' ? delta : 0, event.key === 'ArrowDown' ? delta : event.key === 'ArrowUp' ? -delta : 0));
      }}><svg viewBox="0 0 20 20" width="18" height="18" aria-hidden="true"><path d="M3 5v12h12M3 17L16 4" fill="none" stroke="currentColor" stroke-width="2" /></svg></button>
    <Show when={preview()}>{size => <div class="portable-canvas-resize-preview" aria-hidden="true" style={{ left: `${size().left}px`, width: `${size().width}px`, height: `${size().height}px` }} />}</Show>
  </>;
}
