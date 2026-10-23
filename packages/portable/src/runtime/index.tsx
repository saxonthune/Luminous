import { ExtendedInfo } from './ExtendedInfo.js';
import { Legend } from './Legend.js';
import { CanvasSettings } from './CanvasSettings.js';
import { Card } from './Card.js';
import { batch, createSignal, createMemo, For, onMount, onCleanup } from 'solid-js';
import { render } from 'solid-js/web';
import { createStore, unwrap } from 'solid-js/store';
import { Canvas, NodeContainer, DotGrid, useCanvasContext, useGesture, type CanvasRef, type EdgeDeclaration, ResizeHandle, stopWheelIfScrollable } from '@luminous/cactus/runtime';
import type { PortableArtifact, PortableDiagram, PortableLayout, PortableNode } from '../graph.js';
import '@luminous/cactus/cactus.css';
import '@luminous/cactus/cactus-themes.css';
import './style.css';
import { createPerformanceDiagnostics } from './performance.js';

const artifact: PortableArtifact = JSON.parse(document.getElementById('portable-data')!.textContent!);
if (artifact.debugPerformance && artifact.bundleSize) {
  const report = artifact.bundleSize;
  console.groupCollapsed('[portable bundle size]');
  console.info('Exact UTF-8 payload bytes (content excludes this report)', { javascript: report.javascriptBytes, css: report.cssBytes, content: report.contentBytes });
  console.info('Package attribution: rendered characters before final minification, not final byte totals or runtime memory.');
  console.table(report.packages);
  console.groupEnd();
}
type Theme = 'ground' | 'light' | 'dark';
function PortableCanvas(props: { diagram: PortableDiagram; theme: Theme; onThemeChange: () => void }) {
  const diagram = props.diagram;
  const title = diagram.settings?.title ?? diagram.id;
  const diagnostics = createPerformanceDiagnostics(artifact.debugPerformance);
  if (artifact.debugPerformance) {
    const registry = (window as unknown as { portablePerformance: Record<string, typeof diagnostics> });
    registry.portablePerformance ??= {};
    registry.portablePerformance[diagram.id] = diagnostics;
    onCleanup(() => { delete registry.portablePerformance[diagram.id]; });
  }
  onCleanup(() => diagnostics.dispose());
  const [layout, setLayout] = createStore<PortableLayout>(structuredClone(diagram.defaultLayout));

  const [scrollZoom, setScrollZoom] = createSignal(diagram.settings?.scrollZoom ?? true);
  const [fullscreen, setFullscreen] = createSignal(false);
  const [placeholderHeight, setPlaceholderHeight] = createSignal<number>();
  let home!: HTMLDivElement;
  let dialog!: HTMLDialogElement;
  let restoreFocus: HTMLElement | null = null;
  let previousOverflow = "";
  const [expanded, setExpanded] = createSignal(false);
  const [pageWidth, setPageWidth] = createSignal(0);
  const [canvasInset, setCanvasInset] = createSignal(0);
  const [selected, setSelected] = createSignal<readonly string[]>([]);
  let canvas: CanvasRef;
  let viewport!: HTMLDivElement;
  const [infoPanels, setInfoPanels] = createSignal<{ id: string; opener: HTMLAnchorElement }[]>([]);
  const [activeInfo, setActiveInfo] = createSignal<string>();
  const infoHandles = new Map<string, () => void>();
  function openInfo(id: string, opener: HTMLAnchorElement) {
    if (!artifact.info?.[id]) return;
    const existing = infoPanels().find(panel => panel.id === id);
    if (existing) { existing.opener = opener; infoHandles.get(id)?.(); return; }
    setActiveInfo(id);
    setInfoPanels(panels => [...panels, { id, opener }]);
  }
  function closeInfo(id: string) {
    const closed = infoPanels().find(panel => panel.id === id);
    setInfoPanels(panels => panels.filter(panel => panel.id !== id));
    if (closed?.opener.isConnected) closed.opener.focus({ preventScroll: true });
  }
  let widthFrame = 0;
  let widthAnchor: { left: number; top: number; camera: ReturnType<CanvasRef['getTransform']> } | undefined;
  function preserveAnchor(change: () => void) {
    // Retain the original anchor if several toggles happen before a paint.
    if (!widthAnchor) {
      const bounds = viewport.getBoundingClientRect();
      widthAnchor = { left: bounds.left, top: bounds.top, camera: { ...canvas.getTransform() } };
    }
    canvas.setView(widthAnchor.camera, false);
    change();
    cancelAnimationFrame(widthFrame);
    widthFrame = requestAnimationFrame(() => {
      const anchor = widthAnchor!;
      const bounds = viewport.getBoundingClientRect();
      canvas.setView({
        x: anchor.camera.x + anchor.left - bounds.left,
        y: anchor.camera.y + anchor.top - bounds.top,
        k: anchor.camera.k,
      }, false);
      widthAnchor = undefined;
      widthFrame = 0;
    });
  }
  const toggleWidth = () => preserveAnchor(() => setExpanded(value => !value));
  function enterFullscreen() {
    restoreFocus = document.activeElement as HTMLElement | null;
    previousOverflow = document.documentElement.style.overflow;
    setPlaceholderHeight(home.getBoundingClientRect().height);
    preserveAnchor(() => {
      dialog.append(section);
      setFullscreen(true);
      document.documentElement.style.overflow = 'hidden';
      dialog.showModal();
      section.focus({ preventScroll: true });
    });
  }
  function exitFullscreen() {
    if (!fullscreen()) return;
    preserveAnchor(() => {
      dialog.close();
      home.insertBefore(section, dialog);
      setFullscreen(false);
      setPlaceholderHeight(undefined);
      document.documentElement.style.overflow = previousOverflow;
      restoreFocus?.focus({ preventScroll: true });
    });
  }
  onCleanup(() => {
    cancelAnimationFrame(widthFrame);
    if (fullscreen()) {
      dialog.close();
      document.documentElement.style.overflow = previousOverflow;
    }
  });
  const byId = new Map(diagram.graph.nodes.map(node => [node.id, node]));
  const depth = (node: PortableNode): number => node.parentId ? 1 + depth(byId.get(node.parentId)!) : 0;
  const ancestors = (id: string): string[] => { const parent = byId.get(id)?.parentId; return parent ? [parent, ...ancestors(parent)] : []; };
  const nodes = [...diagram.graph.nodes].sort((a, b) => depth(a) - depth(b));
  // Graph topology is immutable. Solid's For preserves these object identities.
  const groupOverlays = new Map(nodes.filter(node => node.group).map(node => [node.id, createMemo(() => {
    const rect = layout[node.id];
    return { band: depth(node) * 2 + 1, clipRect: { ...rect, y: rect.y + 48, h: Math.max(0, rect.h - 48) } };
  })]));
  const edges: EdgeDeclaration[] = diagram.graph.edges.filter(edge => !edge.invisible).map(edge => {
    const containers = [...new Set([...ancestors(edge.source), ...ancestors(edge.target)])];
    const overlays = createMemo(() => containers.map(id => groupOverlays.get(id)!()));
    return { id: edge.id, sourceId: edge.source, targetId: edge.target, labelText: edge.label,
      styling: { arrowHead: edge.arrow, dash: edge.dashed ? 'dashed' : 'solid' },
      get contentOverlays() { return overlays(); },
    };
  });
  function fit(ids?: readonly string[]) {
    const rects = Object.entries(layout).filter(([id]) => !ids || ids.includes(id)).map(([, rect]) => ({ ...rect, width: rect.w, height: rect.h }));
    canvas?.fitView(rects, 48);
  }
  const reset = () => { batch(() => { setLayout(structuredClone(diagram.defaultLayout)); }); fit(); };
  const keydown = (event: KeyboardEvent) => {
    if ((event.target as HTMLElement)?.closest?.('input, textarea, select, [contenteditable="true"], [role="textbox"]')) return;
    if ((event.ctrlKey || event.metaKey) && event.key === 'a') { event.preventDefault(); canvas.setSelectedIds(nodes.map(node => node.id)); }
    if (event.key === 'Escape') {
      if (fullscreen()) { event.preventDefault(); exitFullscreen(); }
      else canvas.clearSelection();
    }
    if (event.key === '0') fit();
    if (event.key === 'f') fit(selected().length ? selected() : undefined);
    if (event.key === '+' || event.key === '=') canvas.zoomIn();
    if (event.key === '-') canvas.zoomOut();
  };
  let section!: HTMLElement;
  const focusCanvas = (event: PointerEvent) => {
    if (!(event.target as HTMLElement).closest('a, button, input, textarea, select, [contenteditable="true"], .portable-extended-info')) section.focus({ preventScroll: true });
  };
  onMount(() => {
    const measure = () => {
      setPageWidth(document.documentElement.clientWidth);
      setCanvasInset(home.getBoundingClientRect().left);
    };
    const observer = new ResizeObserver(measure);
    observer.observe(document.documentElement);
    observer.observe(home);
    measure();
    onCleanup(() => observer.disconnect());
    section.addEventListener('pointerdown', focusCanvas, true);
    onCleanup(() => section.removeEventListener('pointerdown', focusCanvas, true));
  });
  let fitFrame = 0;
  onMount(() => { fitFrame = requestAnimationFrame(() => fit()); });
  onCleanup(() => cancelAnimationFrame(fitFrame));
  function Cards() {
    const ctx = useCanvasContext();
    let start: PortableLayout = {};
    let moving = new Set<string>();
    let pending: { dx: number; dy: number } | undefined;
    let frame = 0;
    let resizeStart = { w: 0, h: 0 };
    const flush = () => {
      frame = 0;
      const delta = pending; pending = undefined;
      if (!delta) return;
      diagnostics.update(() => batch(() => {
        for (const id of moving) setLayout(id, { x: start[id].x + delta.dx, y: start[id].y + delta.dy });
      }));
    };
    onCleanup(() => cancelAnimationFrame(frame));
    const drag = useGesture({ zoomScale: () => ctx.transform().k, dragGroup: () => ctx.selectedIds(), callbacks: {
      onResizeStart: id => { resizeStart = { ...layout[id] }; },
      onResize: (id, dw, dh) => setLayout(id, { w: Math.max(120, resizeStart.w + dw), h: Math.max(72, resizeStart.h + dh) }),
      onDragStart: () => {
        diagnostics.start('drag');
        start = structuredClone(unwrap(layout));
        moving = new Set(ctx.selectedIds());
        for (const node of nodes) if (node.parentId && moving.has(node.parentId)) moving.add(node.id);
      },
      onDrag: (_id, dx, dy) => {
        pending = { dx, dy };
        if (!frame) frame = requestAnimationFrame(flush);
      },
      onDragEnd: (_id, dx, dy) => {
        const released = performance.now();
        pending = { dx, dy };
        cancelAnimationFrame(frame); flush();
        diagnostics.end(released);
      },
    } });
    return <For each={nodes}>{node => {
      const rect = () => layout[node.id];
      const palette = () => node.classes.map(name => artifact.theme?.styles[name]?.[props.theme === 'dark' ? 'dark' : 'light']).find(Boolean);
      return <><NodeContainer allowOverflow selectionOutlineScreenWidth={2} nodeId={node.id} x={() => rect().x} y={() => rect().y} w={() => rect().w} h={() => rect().h} visualBand={() => node.group ? depth(node) * 2 : 100} onPointerDown={event => {
        const target = event.target as HTMLElement;
        if (target.closest('a, button, input, textarea, select, [contenteditable="true"], [role="toolbar"], [data-cactus-resize-handle]')) return;
        if (node.group && target.closest('[data-box-select-surface]')) return;
        ctx.onNodePointerDown(node.id, event);
        if (ctx.isSelected(node.id)) drag.beginPress(node.id, event);
      }}>
        <div class={node.group ? 'portable-group' : node.card ? 'portable-node portable-card-node' : 'portable-node'} style={{ background: palette()?.fill, '--portable-card-color': palette()?.fill ?? 'var(--cactus-surface-alt)', '--portable-border-color': palette()?.stroke ?? 'var(--cactus-border)', '--portable-border-width': `${1 / ctx.transform().k}px` }}>
          {node.card ? <Card content={node.card} zoom={ctx.transform().k} onMore={openInfo} /> : <div class="portable-label" title={node.label} onWheel={stopWheelIfScrollable}>{node.label}</div>}
          {node.group && <div class="portable-container-body" data-box-select-surface />}

        </div>
      </NodeContainer>
        <ResizeHandle nodeId={node.id} rect={rect} visible={() => ctx.isSelected(node.id)} onResizePointerDown={(id, direction, event) => {
          event.stopPropagation(); drag.beginResize(id, direction, event);
        }} />
      </>;
    }}</For>;
  }
  return <div ref={home} style={{ 'min-height': placeholderHeight() === undefined ? undefined : `${placeholderHeight()}px` }}>
  <section class="portable-canvas" classList={{ 'portable-canvas-expanded': expanded(), 'portable-canvas-fullscreen': fullscreen() }}
    style={expanded() && !fullscreen() ? { width: `${pageWidth()}px`, 'margin-left': `${-canvasInset()}px` } : {}} tabIndex={0} aria-label={`Diagram ${title}`} onKeyDown={keydown} ref={section}>
    <header aria-label={fullscreen() ? "Fullscreen Canvas Header" : "Canvas Header"}><strong>{fullscreen() ? `${artifact.sourceFilename} · ${title}` : title}</strong><button onClick={() => fit()}>Fit all</button><button disabled={!selected().length} onClick={() => fit(selected())}>Fit selection</button><button onClick={() => canvas.zoomOut()} aria-label="Zoom out">−</button><button onClick={() => canvas.zoomIn()} aria-label="Zoom in">+</button><button onClick={reset}>Reset layout</button><button disabled={fullscreen()} aria-pressed={expanded()} onClick={toggleWidth}>{expanded() ? 'Restore width' : 'Expand width'}</button><button aria-pressed={fullscreen()} onClick={() => fullscreen() ? exitFullscreen() : enterFullscreen()}>{fullscreen() ? 'Exit fullscreen' : 'Fullscreen'}</button>{fullscreen() && <button onClick={props.onThemeChange}>Theme: {props.theme}</button>}<CanvasSettings scrollZoom={scrollZoom()} onScrollZoomChange={setScrollZoom} /></header>
    <div class="portable-canvas-viewport" ref={viewport}><Canvas onPerformanceEvent={artifact.debugPerformance ? diagnostics.event : undefined} ref={handle => canvas = handle} viewportOptions={{ minZoom: 0.015, maxZoom: 3, scrollZoom }} boxSelect={{ trigger: 'drag' }} onSelectionChange={setSelected}
      edgeLod={(_edge, state) => ({
        labelVisible: state.zoom > 0.3 || state.emphasis === 'incident',
        labelOpacity: state.emphasis === 'incident' ? 1 : Math.min(1, Math.max(0, (state.zoom - 0.3) / 0.2)),
      })}
      renderBackground={transform => <DotGrid patternId={`portable-grid-${diagram.id}`} transform={{ ...transform, k: 1 }} spacing={22} dotRadius={0.8} />}
      edgeEmphasis={{ dimUnselected: false, selectedWidthMultiplier: 2 }}
      edges={edges}>
      <Cards />
    </Canvas>
    <For each={infoPanels()}>{panel => <ExtendedInfo content={artifact.info![panel.id]} viewport={() => viewport}
      active={activeInfo() === panel.id} onRaise={() => setActiveInfo(panel.id)} onClose={() => closeInfo(panel.id)}
      onReady={handle => { if (handle) infoHandles.set(panel.id, handle); else infoHandles.delete(panel.id); }} />}</For>
    <Legend definition={diagram.settings?.legend} palette={artifact.theme} theme={props.theme} />
    </div>
    <footer>Drag nodes · Drag background to select · Shift-click to add/remove · Right/middle-drag to pan · {scrollZoom() ? 'Wheel to zoom' : 'Wheel to pan'} · Ctrl+wheel to zoom · F to fit selection · Esc to clear · {selected().length} selected</footer>
  </section>
  <dialog ref={dialog} class="portable-fullscreen-dialog" aria-label={`Fullscreen canvas ${title}`}
    onCancel={event => { event.preventDefault(); exitFullscreen(); }} />
  </div>;
}
function App() {
  const [theme, setTheme] = createSignal<Theme>('ground');
  const cycleTheme = () => setTheme(theme() === 'ground' ? 'light' : theme() === 'light' ? 'dark' : 'ground');
  let article!: HTMLElement;
  onMount(() => {
    const disposers = Array.from(article.querySelectorAll<HTMLElement>('[data-portable-canvas]')).map(slot => {
      const diagram = artifact.diagrams[Number(slot.dataset.portableCanvas)];
      return render(() => <PortableCanvas diagram={diagram} theme={theme()} onThemeChange={cycleTheme} />, slot);
    });
    onCleanup(() => disposers.forEach(dispose => dispose()));
  });
  return <div class={`portable cactus-theme-${theme()}`}>
    <header class="portable-page-header"><strong>{artifact.title}</strong>
      <button onClick={cycleTheme}>Theme: {theme()}</button>
    </header>
    <article ref={article} class="portable-document" innerHTML={artifact.html} />
  </div>;
}
render(() => <App />, document.getElementById('app')!);
