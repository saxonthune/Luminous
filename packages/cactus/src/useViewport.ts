import { createSignal, onCleanup } from 'solid-js';
import { zoom as d3Zoom, zoomIdentity, type ZoomBehavior } from 'd3-zoom';
import { select } from 'd3-selection';
import 'd3-transition';

export interface Transform {
  x: number;
  y: number;
  k: number;
}

export interface UseViewportOptions {
  minZoom?: number; // default 0.15
  maxZoom?: number; // default 2
}

export interface UseViewportResult {
  transform: () => Transform;
  setContainerRef: (el: HTMLDivElement) => void;
  containerEl: () => HTMLDivElement | undefined;
  fitView: (
    rects: Array<{ x: number; y: number; width: number; height: number }>,
    padding?: number
  ) => void;
  zoomIn: () => void;
  zoomOut: () => void;
  screenToCanvas: (screenX: number, screenY: number) => { x: number; y: number };
}

export function useViewport(options: UseViewportOptions = {}): UseViewportResult {
  const { minZoom = 0.15, maxZoom = 2 } = options;

  const [transform, setTransform] = createSignal<Transform>({ x: 0, y: 0, k: 1 });
  let container: HTMLDivElement | undefined;
  let zoomBehavior: ZoomBehavior<HTMLDivElement, unknown> | null = null;

  const setContainerRef = (el: HTMLDivElement) => {
    container = el;

    const zb = d3Zoom<HTMLDivElement, unknown>()
      .scaleExtent([minZoom, maxZoom])
      .filter((event) => {
        if (event.type === 'wheel') return true;
        const target = event.target as HTMLElement;
        if (target.closest?.('[data-no-pan]')) return false;
        if (event.type === 'mousedown') return true;
        if (event.type === 'touchstart') return true;
        return false;
      })
      .on('zoom', (event) => {
        setTransform({
          x: event.transform.x,
          y: event.transform.y,
          k: event.transform.k,
        });
      });

    zoomBehavior = zb;
    select(el).call(zb);
  };

  onCleanup(() => {
    if (container) select(container).on('.zoom', null);
  });

  const fitView = (
    rects: Array<{ x: number; y: number; width: number; height: number }>,
    padding = 0.1
  ) => {
    if (!container || !zoomBehavior || rects.length === 0) return;

    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (const rect of rects) {
      minX = Math.min(minX, rect.x);
      minY = Math.min(minY, rect.y);
      maxX = Math.max(maxX, rect.x + rect.width);
      maxY = Math.max(maxY, rect.y + rect.height);
    }

    const bboxWidth = maxX - minX;
    const bboxHeight = maxY - minY;
    const containerRect = container.getBoundingClientRect();
    const availableWidth = containerRect.width * (1 - padding * 2);
    const availableHeight = containerRect.height * (1 - padding * 2);
    const scaleX = availableWidth / bboxWidth;
    const scaleY = availableHeight / bboxHeight;
    const scale = Math.min(scaleX, scaleY, maxZoom);
    const scaledWidth = bboxWidth * scale;
    const scaledHeight = bboxHeight * scale;
    const tx = (containerRect.width - scaledWidth) / 2 - minX * scale;
    const ty = (containerRect.height - scaledHeight) / 2 - minY * scale;

    const newTransform = zoomIdentity.translate(tx, ty).scale(scale);
    select(container).transition().duration(300).call(zoomBehavior.transform, newTransform);
  };

  const zoomBy = (factor: number) => {
    if (!container || !zoomBehavior) return;
    select(container).transition().duration(200).call(zoomBehavior.scaleBy, factor);
  };

  const screenToCanvas = (screenX: number, screenY: number): { x: number; y: number } => {
    if (!container) return { x: screenX, y: screenY };
    const rect = container.getBoundingClientRect();
    const t = transform();
    return {
      x: (screenX - rect.left - t.x) / t.k,
      y: (screenY - rect.top - t.y) / t.k,
    };
  };

  return {
    transform,
    setContainerRef,
    containerEl: () => container,
    fitView,
    zoomIn: () => zoomBy(1.15),
    zoomOut: () => zoomBy(1 / 1.15),
    screenToCanvas,
  };
}
