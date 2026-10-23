import { createSignal, createUniqueId, onCleanup, onMount, Show } from 'solid-js';
import type { ExtendedInfo as InfoContent } from '../import/extended-info.js';

/** Reusable canvas-owned floating information panel; coordinates are viewport pixels. */
export function ExtendedInfo(props: {
  content: InfoContent;
  viewport: () => HTMLElement;
  active: boolean;
  onRaise: () => void;
  onClose: () => void;
  onReady: (reopen: (() => void) | undefined) => void;
}) {
  const [rect, setRect] = createSignal({ x: 16, y: 16, w: 480, h: 360 });
  const [minimized, setMinimized] = createSignal(false);
  const titleId = createUniqueId(), bodyId = createUniqueId();
  let panel!: HTMLDivElement;
  let header!: HTMLDivElement;
  let gesture: { pointerId: number; x: number; y: number; start: ReturnType<typeof rect>; resize: boolean; target: HTMLElement } | undefined;
  const clamp = (next: ReturnType<typeof rect>) => {
    const viewport = props.viewport();
    const width = viewport.clientWidth, height = viewport.clientHeight;
    const w = Math.max(Math.min(280, width), Math.min(next.w, width));
    const h = Math.max(Math.min(120, height), Math.min(next.h, height));
    return { w, h, x: Math.max(0, Math.min(next.x, width - w)), y: Math.max(0, Math.min(next.y, height - (minimized() ? header?.offsetHeight || 44 : h))) };
  };
  function begin(event: PointerEvent, resize: boolean) {
    if (event.button !== 0 || (!resize && (event.target as HTMLElement).closest('button, a'))) return;
    event.preventDefault(); event.stopPropagation(); props.onRaise();
    const target = event.currentTarget as HTMLElement;
    gesture = { pointerId: event.pointerId, x: event.clientX, y: event.clientY, start: rect(), resize, target };
    target.setPointerCapture(event.pointerId);
  }
  function move(event: PointerEvent) {
    if (!gesture || gesture.pointerId !== event.pointerId) return;
    const { start, x, y, resize } = gesture;
    const dx = event.clientX - x, dy = event.clientY - y;
    setRect(clamp(resize ? { ...start, w: start.w + dx, h: start.h + dy } : { ...start, x: start.x + dx, y: start.y + dy }));
  }
  function end(event?: PointerEvent) {
    if (!gesture || event && event.pointerId !== gesture.pointerId) return;
    const current = gesture; gesture = undefined;
    if (current.target.hasPointerCapture(current.pointerId)) current.target.releasePointerCapture(current.pointerId);
  }
  function toggle() {
    setMinimized(value => !value);
    setRect(value => clamp(value));
  }
  function keyboard(event: KeyboardEvent, resize: boolean) {
    if (event.target !== event.currentTarget) return;
    const dx = event.key === 'ArrowRight' ? 16 : event.key === 'ArrowLeft' ? -16 : 0;
    const dy = event.key === 'ArrowDown' ? 16 : event.key === 'ArrowUp' ? -16 : 0;
    if (!dx && !dy) return;
    event.preventDefault();
    const start = rect();
    setRect(clamp(resize ? { ...start, w: start.w + dx, h: start.h + dy } : { ...start, x: start.x + dx, y: start.y + dy }));
  }
  onMount(() => {
    setRect(value => clamp(value));
    panel.focus({ preventScroll: true });
    props.onReady(() => { props.onRaise(); setMinimized(false); setRect(value => clamp(value)); panel.focus({ preventScroll: true }); });
    const observer = new ResizeObserver(() => setRect(value => clamp(value)));
    observer.observe(props.viewport());
    onCleanup(() => observer.disconnect());
  });
  onCleanup(() => { end(); props.onReady(undefined); });
  return <div ref={panel} class="portable-extended-info" role="dialog" aria-modal="false" aria-labelledby={titleId} tabIndex={-1}
    style={{ left: `${rect().x}px`, top: `${rect().y}px`, width: `${rect().w}px`, height: minimized() ? 'auto' : `${rect().h}px`, 'z-index': props.active ? 1402 : 1401 }}
    onPointerDown={event => { event.stopPropagation(); props.onRaise(); }} onWheel={event => event.stopPropagation()}
    onKeyDown={event => { event.stopPropagation(); if (event.key === 'Escape') { event.preventDefault(); props.onClose(); } }}>
    <div ref={header} class="portable-extended-info-header" role="group" aria-label="Extended Info Component Header" tabIndex={0}
      onKeyDown={event => keyboard(event, false)} onPointerDown={event => begin(event, false)} onPointerMove={move} onPointerUp={end} onPointerCancel={end} onLostPointerCapture={() => { gesture = undefined; }}>
      <strong id={titleId}>{props.content.title}</strong>
      <button type="button" aria-label={minimized() ? 'Restore extended info' : 'Minimize extended info'} aria-expanded={!minimized()} aria-controls={bodyId} onClick={toggle}>{minimized() ? '+' : '−'}</button>
      <button type="button" aria-label="Close extended info" onClick={props.onClose}>×</button>
    </div>
    <div id={bodyId} class="portable-extended-info-body" hidden={minimized()} innerHTML={props.content.html} />
    <Show when={!minimized()}><button type="button" class="portable-extended-info-resize" aria-label="Resize extended info" title="Drag to resize; arrow keys when focused"
      onKeyDown={event => keyboard(event, true)} onPointerDown={event => begin(event, true)} onPointerMove={move} onPointerUp={end} onPointerCancel={end} onLostPointerCapture={() => { gesture = undefined; }}>◢</button></Show>
  </div>;
}
