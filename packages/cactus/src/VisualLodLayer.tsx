import { For, batch, createEffect, createMemo, createSignal, onCleanup, onMount, untrack, type JSX } from 'solid-js';
import type { Transform } from './interactions/useViewport.js';
import type { RegisteredNodeRect } from './types.js';
import {
  placeVisualLodItems,
  projectVisualLodItemsDuringInteraction,
  visualLodItemIsWithinZoom,
  type PlacedVisualLod,
  type VisualLodDeclaration,
  type VisualLodSize,
  type VisualLodStatus,
} from './visualLod.js';

type VisualLodPhase = 'idle' | 'interacting' | 'settling';

const SETTLE_DELAY_MS = 140;
const ZOOM_HYSTERESIS = 0.03;

export interface VisualLodLayerProps {
  items: VisualLodDeclaration[];
  getNodeRects: () => ReadonlyMap<string, RegisteredNodeRect>;
  transform: () => Transform;
}

function VisualLodItemView(props: {
  item: VisualLodDeclaration;
  zoom: () => number;
  interacting: () => boolean;
  placement: () => PlacedVisualLod | undefined;
  onMeasure: (id: string, size: VisualLodSize, zoom: number, key: string | undefined) => void;
}): JSX.Element {
  let element: HTMLDivElement | undefined;
  let observer: ResizeObserver | undefined;
  const placement = () => props.placement();
  const status = (): VisualLodStatus => placement()?.status ?? 'hidden';

  const measure = () => {
    if (!element || props.interacting()) return;
    const rect = element.getBoundingClientRect();
    if (rect.width > 0 && rect.height > 0) {
      props.onMeasure(props.item.id, { w: rect.width, h: rect.height }, props.zoom(), props.item.size?.key);
    }
  };

  onMount(() => {
    measure();
    queueMicrotask(measure);
    if (typeof ResizeObserver !== 'undefined' && element) {
      observer = new ResizeObserver(measure);
      observer.observe(element);
    }
  });
  createEffect(() => {
    if (!props.interacting()) queueMicrotask(measure);
  });
  onCleanup(() => observer?.disconnect());

  return (
    <div
      ref={element}
      data-cactus-visual-lod-id={props.item.id}
      data-cactus-visual-lod-status={status()}
      style={{
        position: 'absolute',
        left: '0',
        top: '0',
        transform: `translate3d(${placement()?.x ?? 0}px, ${placement()?.y ?? 0}px, 0)`,
        'will-change': 'transform',
        contain: 'layout paint',
        'z-index': `${placement()?.zIndex ?? 0}`,
        visibility: placement() && status() !== 'hidden' ? 'visible' : 'hidden',
        opacity: status() === 'hidden' ? '0' : '1',
        transition: 'opacity 100ms ease',
        'pointer-events': props.item.pointerEvents ?? 'none',
      }}
    >
      {props.item.render({ zoom: props.zoom, status })}
    </div>
  );
}

/** Screen-space host-rendered visuals anchored to registered graph Nodes. */
export function VisualLodLayer(props: VisualLodLayerProps): JSX.Element {
  const [lodTransform, setLodTransform] = createSignal(props.transform());
  // Content geometry is intentionally stable during camera motion. Hosts may
  // derive typography or other layout-affecting presentation from this zoom.
  const [presentationZoom, setPresentationZoom] = createSignal(props.transform().k);
  const [phase, setPhase] = createSignal<VisualLodPhase>('idle');
  const [placements, setPlacements] = createSignal(new Map<string, PlacedVisualLod>());
  let committedPlacements = new Map<string, PlacedVisualLod>();
  let interactionSuppressed = new Set<string>();
  let pendingTransform = props.transform();
  let frame: number | undefined;
  let settleTimer: ReturnType<typeof setTimeout> | undefined;
  let settleFrame: number | undefined;
  let transformInitialized = false;

  // The graph follows d3 synchronously. Visual LOD follows at most once per
  // animation frame and declares the camera settled shortly after its final
  // update, keeping camera input ahead of label work without visible lag.
  createEffect(() => {
    pendingTransform = props.transform();
    if (!transformInitialized) {
      transformInitialized = true;
      return;
    }
    if (untrack(phase) !== 'interacting') {
      interactionSuppressed = new Set();
      setPhase('interacting');
    }
    if (frame === undefined) {
      frame = requestAnimationFrame(() => {
        frame = undefined;
        setLodTransform(pendingTransform);
      });
    }
    if (settleTimer !== undefined) clearTimeout(settleTimer);
    if (settleFrame !== undefined) cancelAnimationFrame(settleFrame);
    settleTimer = setTimeout(() => {
      batch(() => {
        setLodTransform(pendingTransform);
        setPresentationZoom(pendingTransform.k);
        setPhase('settling');
      });
      // Give newly visible DOM one paint to report its exact size. Any size
      // update reconciles while the phase remains `settling`.
      settleFrame = requestAnimationFrame(() => {
        settleFrame = undefined;
        setPhase('idle');
      });
    }, SETTLE_DELAY_MS);
  });
  onCleanup(() => {
    if (frame !== undefined) cancelAnimationFrame(frame);
    if (settleFrame !== undefined) cancelAnimationFrame(settleFrame);
    if (settleTimer !== undefined) clearTimeout(settleTimer);
  });

  interface MeasuredSize {
    size: VisualLodSize;
    zoom: number;
    key: string | undefined;
  }
  const sizes = new Map<string, MeasuredSize>();
  const [sizesVersion, setSizesVersion] = createSignal(0);
  const recordSize = (id: string, size: VisualLodSize, zoom: number, key: string | undefined) => {
    const previous = sizes.get(id);
    if (previous?.size.w === size.w && previous.size.h === size.h && previous.zoom === zoom && previous.key === key) return;
    sizes.set(id, { size, zoom, key });
    setSizesVersion((version) => version + 1);
  };

  const activeItems = createMemo(() => {
    const zoom = lodTransform().k;
    const cameraMoving = phase() === 'interacting';
    return props.items.filter((item) => {
      const prior = committedPlacements.get(item.id);
      const wasVisible = prior !== undefined && prior.status !== 'hidden';
      // The interaction projection cannot admit hidden Items, so do not even
      // build placement inputs for them on the hot camera path.
      if (cameraMoving && !wasVisible) return false;
      return visualLodItemIsWithinZoom(
        item,
        zoom,
        wasVisible,
        ZOOM_HYSTERESIS,
      );
    });
  });

  const placementInputs = createMemo(() => {
    sizesVersion();
    const transform = lodTransform();
    const cameraMoving = phase() === 'interacting';
    const rects = props.getNodeRects();
    const inputs = activeItems().flatMap((declaration) => {
      const rect = rects.get(declaration.anchor.nodeId);
      const measured = sizes.get(declaration.id);
      const committed = committedPlacements.get(declaration.id);
      const measurementIsCurrent = !cameraMoving
        && measured?.zoom === presentationZoom()
        && measured.key === declaration.size?.key;
      const size = cameraMoving && committed
        ? { w: committed.w, h: committed.h }
        : measurementIsCurrent
          ? measured.size
          : declaration.size?.estimate(presentationZoom()) ?? measured?.size;
      if (!rect || !size) return [];
      return [{
        declaration,
        size,
        anchorRect: {
          x: transform.x + rect.x * transform.k,
          y: transform.y + rect.y * transform.k,
          w: rect.w * transform.k,
          h: rect.h * transform.k,
        },
      }];
    });
    return inputs;
  });

  createEffect(() => {
    const currentPhase = phase();
    const inputs = placementInputs();
    if (currentPhase === 'interacting') {
      const projected = projectVisualLodItemsDuringInteraction(
        inputs,
        committedPlacements,
        interactionSuppressed,
      );
      for (const [id, placement] of projected) {
        if (placement.status === 'hidden' && committedPlacements.get(id)?.status !== 'hidden') {
          interactionSuppressed.add(id);
        }
      }
      setPlacements(projected);
      return;
    }

    const settled = placeVisualLodItems(inputs, committedPlacements, {
      retainVisiblePlacements: true,
    });
    committedPlacements = settled;
    setPlacements(settled);
  });

  const itemsById = createMemo(() => new Map(props.items.map((item) => [item.id, item])));
  const visibleItems = createMemo(() => {
    const byId = itemsById();
    const visible: VisualLodDeclaration[] = [];
    for (const [id, placement] of placements()) {
      if (placement.status === 'hidden') continue;
      const item = byId.get(id);
      if (item) visible.push(item);
    }
    return visible;
  });
  const renderedItems = createMemo(() => {
    sizesVersion();
    const visible = visibleItems();
    if (phase() === 'interacting') return visible;
    const renderedIds = new Set(visible.map((item) => item.id));
    const staged = activeItems().filter((item) => {
      if (renderedIds.has(item.id) || item.size?.estimate) return false;
      const measured = sizes.get(item.id);
      return !measured || measured.key !== item.size?.key;
    });
    return [...visible, ...staged];
  });

  return (
    <div
      data-cactus-visual-lod-layer
      style={{ position: 'absolute', inset: '0', 'z-index': '4', 'pointer-events': 'none' }}
    >
      <For each={renderedItems()}>
        {(item) => (
          <VisualLodItemView
            item={item}
            zoom={presentationZoom}
            interacting={() => phase() === 'interacting'}
            placement={() => placements().get(item.id)}
            onMeasure={recordSize}
          />
        )}
      </For>
    </div>
  );
}
