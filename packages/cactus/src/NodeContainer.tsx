import { createRenderEffect, createSignal, onCleanup, Show, type JSX } from 'solid-js';
import { useCanvasContext } from './CanvasContext.js';
import { LayoutPicker } from './LayoutPicker.js';
import type { ChildLayoutPolicy } from './layout-types.js';

export interface NodeContainerProps {
  nodeId: string;
  x: () => number;
  y: () => number;
  w: () => number;
  h: () => number;
  softContainer?: () => boolean;
  onPointerDown?: (e: PointerEvent) => void;
  onContextMenu?: (e: MouseEvent) => void;
  children?: JSX.Element;
  /** Whether this node is a container (has children). When true, shows the layout picker. */
  isContainer?: () => boolean;
  /** Effective layout policy for this container, used to highlight the active picker button. */
  layoutPolicy?: () => ChildLayoutPolicy;
}

export function NodeContainer(props: NodeContainerProps): JSX.Element {
  const ctx = useCanvasContext();
  const [hovered, setHovered] = createSignal(false);
  const pickerCurrent = (): ChildLayoutPolicy =>
    ctx.layoutOverride(props.nodeId) ?? props.layoutPolicy?.() ?? 'pack';
  const pickerVisible = () => hovered() || ctx.isSelected(props.nodeId);

  // createRenderEffect runs synchronously during the render pass so that
  // node rects are registered before the EdgeLayer (which comes after in
  // the Canvas JSX) reads them for geometry computation.
  // Sizes come from deep-LOD measurement (deepLodMeasure.tsx), not from live DOM.
  createRenderEffect(() => {
    ctx.registerNodeRect(props.nodeId, {
      x: props.x(),
      y: props.y(),
      w: props.w(),
      h: props.h(),
    });
  });
  // Unregister only when the component is destroyed — NOT on every effect
  // re-run. An onCleanup *inside* the render effect fires before each
  // re-execution, briefly deleting the rect and exposing an inconsistent
  // registry to layout, which turns the layout↔measurement cycle divergent.
  onCleanup(() => ctx.unregisterNodeRect(props.nodeId));

  return (
    <div
      data-node-id={props.nodeId}
      data-drop-target="true"
      data-container-id={props.nodeId}
      data-connection-target="true"
      data-no-pan="true"
      style={{
        position: 'absolute',
        left: `${props.x()}px`,
        top: `${props.y()}px`,
        width: `${props.w()}px`,
        height: `${props.h()}px`,
        overflow: 'hidden',
      }}
      onPointerDown={(e) => props.onPointerDown?.(e)}
      onContextMenu={(e) => props.onContextMenu?.(e)}
      onPointerEnter={() => setHovered(true)}
      onPointerLeave={() => setHovered(false)}
    >
      <Show when={props.softContainer?.()}>
        <div
          data-soft-container="true"
          style={{
            position: 'absolute',
            inset: '0',
            'z-index': '-1',
            background: 'var(--cactus-container-tint, rgba(0,0,0,0.04))',
            border: '1px solid var(--cactus-border-subtle, #f3f4f6)',
            'border-radius': '8px',
            'pointer-events': 'none',
          }}
        />
      </Show>
      {props.children}
      <Show when={props.isContainer?.()}>
        <div
          data-layout-picker
          style={{
            position: 'absolute',
            top: '2px',
            right: '2px',
            'z-index': '10',
            opacity: pickerVisible() ? '1' : '0',
            transition: 'opacity 150ms ease',
            'pointer-events': pickerVisible() ? 'auto' : 'none',
          }}
        >
          <LayoutPicker nodeId={props.nodeId} current={pickerCurrent} />
        </div>
      </Show>
    </div>
  );
}
