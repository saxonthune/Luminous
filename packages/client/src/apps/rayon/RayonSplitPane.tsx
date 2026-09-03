import { onCleanup, type JSX } from 'solid-js';

export interface RayonSplitPaneProps {
  leftWidth: () => number;
  onLeftWidthChange: (width: number) => void;
  left: JSX.Element;
  right: JSX.Element;
}

const MIN_LEFT = 280;
const MIN_RIGHT = 480;

export function RayonSplitPane(props: RayonSplitPaneProps): JSX.Element {
  let root!: HTMLDivElement;
  let disposeDrag: (() => void) | undefined;

  function clamp(width: number): number {
    return Math.max(MIN_LEFT, Math.min(width, root.clientWidth - MIN_RIGHT));
  }

  function stopDrag() {
    disposeDrag?.();
    disposeDrag = undefined;
  }

  function beginDrag(event: PointerEvent) {
    if (event.button !== 0) return;
    event.preventDefault();
    const startX = event.clientX;
    const startWidth = props.leftWidth();
    const onMove = (move: PointerEvent) => props.onLeftWidthChange(clamp(startWidth + move.clientX - startX));
    const onUp = () => stopDrag();
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    disposeDrag = () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
    };
  }

  onCleanup(stopDrag);

  return (
    <div ref={root} style={{ display: 'flex', flex: '1 1 auto', 'min-height': 0, 'min-width': 0 }}>
      <section style={{ width: `${props.leftWidth()}px`, 'min-width': 0, overflow: 'hidden' }}>
        {props.left}
      </section>
      <div
        role="separator"
        aria-label="Resize source and runtime panes"
        aria-orientation="vertical"
        aria-valuemin={MIN_LEFT}
        aria-valuemax={Math.max(MIN_LEFT, (root?.clientWidth ?? 1200) - MIN_RIGHT)}
        aria-valuenow={props.leftWidth()}
        tabIndex={0}
        data-no-pan="true"
        style={{
          width: '7px',
          cursor: 'col-resize',
          background: 'var(--border)',
          'border-left': '3px solid var(--surface-alt)',
          'border-right': '3px solid var(--surface-alt)',
          'flex-shrink': 0,
        }}
        onPointerDown={beginDrag}
        onKeyDown={(event) => {
          if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return;
          event.preventDefault();
          props.onLeftWidthChange(clamp(props.leftWidth() + (event.key === 'ArrowLeft' ? -24 : 24)));
        }}
      />
      <section style={{ flex: '1 1 auto', 'min-width': 0, overflow: 'hidden' }}>
        {props.right}
      </section>
    </div>
  );
}
