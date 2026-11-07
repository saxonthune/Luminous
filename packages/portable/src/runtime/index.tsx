import { CanvasResizeHandle } from './CanvasResizeHandle.js';
import type { CanvasSize } from '../canvas-resize.js';
import { selectedVersion, urlWithVersion, type VersionedArtifact } from '../versions.js';
import { PageFooter } from './PageFooter.js';
import { ExtendedInfo } from './ExtendedInfo.js';
import { Legend } from './Legend.js';
import { CanvasSettings } from './CanvasSettings.js';
import { NodeView } from './NodeView.js';
import { restRole, restStyles } from '../rest.js';
import { buildRestTree, hiddenRestNodes, revealRestChildren } from '../rest-tree.js';
import { themeFromUrl, urlWithTheme, type Theme } from '../theme-url.js';
import { visibleTreeLayout } from '@luminous/cactus/tree-layout';
import { batch, createSignal, createMemo, For, Show, onMount, onCleanup } from 'solid-js';
import { render } from 'solid-js/web';
import { createStore, unwrap } from 'solid-js/store';
import { Canvas, NodeContainer, DotGrid, useCanvasContext, useGesture, type CanvasRef, type EdgeDeclaration, ResizeHandle } from '@luminous/cactus/runtime';
import type { PortableArtifact, PortableDiagram, PortableLayout, PortableNode } from '../graph.js';
import '@luminous/cactus/cactus.css';
import '@luminous/cactus/cactus-themes.css';
import './style.css';
import { createPerformanceDiagnostics } from './performance.js';

const payload: PortableArtifact | VersionedArtifact = JSON.parse(document.getElementById('portable-data')!.textContent!);
function PortableCanvas(props: { artifact: PortableArtifact; diagram: PortableDiagram; theme: Theme; onThemeChange: () => void }) {
  const artifact = props.artifact;
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
  const [customSize, setCustomSize] = createSignal<CanvasSize>();
  const [minimumSize, setMinimumSize] = createSignal<CanvasSize>({ width: 0, height: 0 });
  let sizeProbe!: HTMLDivElement;
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
  const toggleWidth = () => preserveAnchor(() => {
    if (expanded() || customSize()) { setExpanded(false); setCustomSize(undefined); }
    else setExpanded(true);
  });
  const commitSize = (size: CanvasSize) => preserveAnchor(() => {
    setExpanded(false);
    setCustomSize(size);
  });
  const sectionStyle = () => {
    if (fullscreen()) return {};
    const size = customSize();
    if (size) {
      const minimum = minimumSize();
      const width = Math.max(minimum.width, size.width);
      return { width: `${width}px`, height: `${Math.max(minimum.height, size.height)}px`, 'margin-left': `${(minimum.width - width) / 2}px` };
    }
    return expanded() ? { width: `${pageWidth()}px`, 'margin-left': `${-canvasInset()}px` } : {};
  };
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
  const fixedSchemaLinks = nodes.flatMap(node => (node.card?.fields ?? []).flatMap(field => {
    const key = field.schema?.schemaKey;
    const target = key && nodes.find(candidate => candidate.id !== node.id && candidate.card?.schemaKey === key);
    return target ? [{ parent: node.id, field: field.name, target: target.id }] : [];
  }));
  const [schemaNodes, setSchemaNodes] = createSignal<{ node: PortableNode; parent: string; field: string; side: 'left' | 'right' }[]>([]);
  const [schemaLinks, setSchemaLinks] = createSignal<{ parent: string; field: string; target: string }[]>([]);
  function toggleSchema(parent: string, fieldName: string) {
    const id = `${parent}::${fieldName}`;
    if (schemaLinks().some(link => link.parent === parent && link.field === fieldName)) {
      let links = schemaLinks().filter(link => !(link.parent === parent && link.field === fieldName));
      const reachable = new Set(nodes.map(node => node.id));
      let changed = true;
      while (changed) { changed = false; for (const link of links) if (reachable.has(link.parent) && !reachable.has(link.target)) { reachable.add(link.target); changed = true; } }
      const removed = new Set(schemaNodes().filter(item => !reachable.has(item.node.id)).map(item => item.node.id));
      links = links.filter(link => reachable.has(link.parent) && reachable.has(link.target));
      batch(() => { setSchemaLinks(links); setSchemaNodes(items => items.filter(item => !removed.has(item.node.id))); });
      canvas.setSelectedIds(selected().filter(id => !removed.has(id)));
      return;
    }
    const parentNode = nodes.find(node => node.id === parent) ?? schemaNodes().find(item => item.node.id === parent)?.node;
    const field = parentNode?.card?.fields?.find(field => field.name === fieldName);
    if (!field?.schema) return;
    const key = field.schema.schemaKey;
    const existing = key ? [...nodes, ...schemaNodes().map(item => item.node)].find(node => node.id !== parent && node.card?.schemaKey === key) : undefined;
    if (existing) { setSchemaLinks(items => [...items, { parent, field: fieldName, target: existing.id }]); return; }
    const side = schemaNodes().find(item => item.node.id === parent)?.side ?? diagram.settings?.layout?.attachments?.find(item => item.node === parent)?.side ?? 'right';
    const rect = layout[parent];
    if (!field.schema.measuredSize) throw new Error('Nested schema has no measured geometry; regenerate this artifact.');
    const { w, h } = field.schema.measuredSize;
    const x = side === 'left' ? rect.x - w - 100 : rect.x + rect.w + 100;
    let y = rect.y;
    const occupied = [...nodes.map(node => layout[node.id]), ...schemaNodes().map(item => layout[item.node.id])].filter(Boolean);
    while (occupied.some(other => x < other.x + other.w + 24 && x + w + 24 > other.x && y < other.y + other.h + 24 && y + h + 24 > other.y)) y += 80;
    setLayout(id, { x, y, w, h });
    setSchemaNodes(items => [...items, { node: { id, label: field.schema!.title, card: field.schema, group: false, classes: parentNode?.classes ?? [] }, parent, field: fieldName, side }]);
    setSchemaLinks(items => [...items, { parent, field: fieldName, target: id }]);
  }
  const tree = diagram.mode === 'rest-api-tree' ? buildRestTree(diagram.graph) : undefined;
  const [collapsed, setCollapsed] = createSignal<ReadonlySet<string>>(new Set());
  const [activeVisibilityNode, setActiveVisibilityNode] = createSignal<string>();
  const hidden = createMemo(() => tree ? hiddenRestNodes(tree.descendants, collapsed()) : new Set<string>());
  const visibleNodes = createMemo(() => [...nodes.filter(node => !hidden().has(node.id)), ...schemaNodes().map(item => item.node)]);
  function changeVisibility(id: string, action: 'toggle' | 'children-only') {
    if (!tree) return;
    const next = action === 'children-only' ? revealRestChildren(tree.children, collapsed(), id) : new Set(collapsed());
    if (action === 'toggle') { if (next.has(id)) next.delete(id); else next.add(id); }
    const sizes = new Map(nodes.map(node => [node.id, { w: layout[node.id].w, h: layout[node.id].h }]));
    const positions = visibleTreeLayout(tree.roots, tree.children, sizes, next);
    // Keep the clicked header in place and retain the user's camera and node sizes.
    const anchor = positions.get(id)!;
    const offset = { x: layout[id].x - anchor.x, y: layout[id].y - anchor.y };
    batch(() => {
      setCollapsed(next);
      for (const [nodeId, position] of positions) {
        const x = position.x + offset.x, y = position.y + offset.y;
        if (layout[nodeId].x !== x || layout[nodeId].y !== y) setLayout(nodeId, { x, y });
      }
    });
    canvas.setSelectedIds(selected().filter(selectedId => !hidden().has(selectedId)));
  }
  // Graph topology is immutable. Solid's For preserves these object identities.
  const groupOverlays = new Map(nodes.filter(node => node.group).map(node => [node.id, createMemo(() => {
    const rect = layout[node.id];
    const headerHeight = diagram.measurements?.[node.id]?.headerHeight ?? 48;
    return { band: depth(node) * 2 + 1, clipRect: { ...rect, y: rect.y + headerHeight, h: Math.max(0, rect.h - headerHeight) } };
  })]));
  const edges: EdgeDeclaration[] = diagram.graph.edges.filter(edge => !edge.invisible).map(edge => {
    const containers = [...new Set([...ancestors(edge.source), ...ancestors(edge.target)])];
    const overlays = createMemo(() => containers.map(id => groupOverlays.get(id)!()));
    return { id: edge.id, sourceId: edge.source, targetId: edge.target, labelText: edge.label,
      styling: { arrowHead: edge.arrow, dash: edge.dashed ? 'dashed' : 'solid' },
      get contentOverlays() { return overlays(); },
    };
  });
  const visibleEdges = createMemo(() => [...edges.filter(edge => !hidden().has(edge.sourceId) && !hidden().has(edge.targetId)), ...[...fixedSchemaLinks, ...schemaLinks()].filter(item => !hidden().has(item.parent) && !hidden().has(item.target)).map(item => ({ id: `schema-edge:${item.parent}::${item.field}`, sourceId: item.parent, targetId: item.target, styling: { arrowHead: true, dash: 'dashed' as const } }))]);
  function fit(ids?: readonly string[]) {
    const visible = new Set(visibleNodes().map(node => node.id));
    const rects = Object.entries(layout).filter(([id]) => visible.has(id) && (!ids || ids.includes(id))).map(([, rect]) => ({ ...rect, width: rect.w, height: rect.h }));
    canvas?.fitView(rects, 48);
  }
  const reset = () => { batch(() => { setSchemaLinks([]); setSchemaNodes([]); setCollapsed(new Set<string>()); setLayout(structuredClone(diagram.defaultLayout)); }); canvas.clearSelection(); fit(); };
  const keydown = (event: KeyboardEvent) => {
    if ((event.target as HTMLElement)?.closest?.('input, textarea, select, [contenteditable="true"], [role="textbox"]')) return;
    if ((event.ctrlKey || event.metaKey) && event.key === 'a') { event.preventDefault(); canvas.setSelectedIds(visibleNodes().map(node => node.id)); }
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
      const baseline = sizeProbe.getBoundingClientRect();
      setMinimumSize({ width: baseline.width, height: baseline.height });
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
    return <For each={visibleNodes()}>{node => {
      const rect = () => layout[node.id];
      const palette = () => node.classes.map(name => artifact.theme?.styles[name]?.[props.theme === 'dark' ? 'dark' : 'light']).find(Boolean)
        ?? (node.card?.component === 'rest-card' ? restStyles[restRole(node.card.title, node.card.methods ?? [])][props.theme === 'dark' ? 'dark' : 'light'] : undefined);
      return <><NodeContainer allowOverflow selectionOutlineScreenWidth={2} nodeId={node.id} x={() => rect().x} y={() => rect().y} w={() => rect().w} h={() => rect().h} visualBand={() => activeVisibilityNode() === node.id ? 200 : node.group ? depth(node) * 2 : 100} onPointerDown={event => {
        const target = event.target as HTMLElement;
        if (target.closest('a, button, input, textarea, select, [contenteditable="true"], [role="toolbar"], [data-cactus-resize-handle]')) return;
        if (node.group && target.closest('[data-box-select-surface]')) return;
        ctx.onNodePointerDown(node.id, event);
        if (ctx.isSelected(node.id)) drag.beginPress(node.id, event);
      }}>
        <NodeView node={node} zoom={ctx.transform().k} palette={palette()} headerHeight={diagram.measurements?.[node.id]?.headerHeight}
          onMore={openInfo} onField={field => toggleSchema(node.id, field)}
          isOpen={field => schemaLinks().some(item => item.parent === node.id && item.field === field)}
          isFixed={field => fixedSchemaLinks.some(item => item.parent === node.id && item.field === field)}
          descendantCount={tree?.descendants.get(node.id)?.length} collapsed={collapsed().has(node.id)}
          onToggle={() => changeVisibility(node.id, 'toggle')} onChildrenOnly={() => changeVisibility(node.id, 'children-only')}
          onToolbarActiveChange={active => setActiveVisibilityNode(current => active ? node.id : current === node.id ? undefined : current)} />
      </NodeContainer>
        <ResizeHandle nodeId={node.id} rect={rect} visible={() => ctx.isSelected(node.id)} onResizePointerDown={(id, direction, event) => {
          event.stopPropagation(); drag.beginResize(id, direction, event);
        }} />
      </>;
    }}</For>;
  }
  return <div ref={home} style={{ position: 'relative', 'min-height': placeholderHeight() === undefined ? undefined : `${placeholderHeight()}px` }}>
  <div ref={sizeProbe} class="portable-canvas-size-probe" aria-hidden="true" />
  <section class="portable-canvas" classList={{ 'portable-canvas-expanded': expanded(), 'portable-canvas-fullscreen': fullscreen() }}
    style={sectionStyle()} tabIndex={0} aria-label={`Diagram ${title}`} onKeyDown={keydown} ref={section}>
    <header aria-label={fullscreen() ? "Fullscreen Canvas Header" : "Canvas Header"}><strong>{fullscreen() ? `${artifact.sourceFilename} · ${title}` : title}</strong><button onClick={() => fit()}>Fit all</button><button disabled={!selected().length} onClick={() => fit(selected())}>Fit selection</button><button onClick={() => canvas.zoomOut()} aria-label="Zoom out">−</button><button onClick={() => canvas.zoomIn()} aria-label="Zoom in">+</button><button onClick={reset}>Reset layout</button><button disabled={fullscreen()} aria-pressed={expanded() || Boolean(customSize())} onClick={toggleWidth}>{customSize() ? 'Restore size' : expanded() ? 'Restore width' : 'Expand width'}</button><button aria-pressed={fullscreen()} onClick={() => fullscreen() ? exitFullscreen() : enterFullscreen()}>{fullscreen() ? 'Exit fullscreen' : 'Fullscreen'}</button>{fullscreen() && <button onClick={props.onThemeChange}>Theme: {props.theme}</button>}<CanvasSettings scrollZoom={scrollZoom()} onScrollZoomChange={setScrollZoom} /></header>
    <div class="portable-canvas-viewport" ref={viewport}><Canvas onPerformanceEvent={artifact.debugPerformance ? diagnostics.event : undefined} ref={handle => canvas = handle} viewportOptions={{ minZoom: 0.015, maxZoom: 3, scrollZoom }} boxSelect={{ trigger: 'drag' }} onSelectionChange={setSelected}
      edgeLod={(_edge, state) => ({
        labelVisible: state.zoom > 0.3 || state.emphasis === 'incident',
        labelOpacity: state.emphasis === 'incident' ? 1 : Math.min(1, Math.max(0, (state.zoom - 0.3) / 0.2)),
      })}
      renderBackground={transform => <DotGrid patternId={`portable-grid-${diagram.id}`} transform={{ ...transform, k: 1 }} spacing={22} dotRadius={0.8} />}
      edgeEmphasis={{ dimUnselected: false, selectedWidthMultiplier: 2 }}
      edges={visibleEdges()}>
      <Cards />
    </Canvas>
    <For each={infoPanels()}>{panel => <ExtendedInfo content={artifact.info![panel.id]} viewport={() => viewport}
      active={activeInfo() === panel.id} onRaise={() => setActiveInfo(panel.id)} onClose={() => closeInfo(panel.id)}
      onReady={handle => { if (handle) infoHandles.set(panel.id, handle); else infoHandles.delete(panel.id); }} />}</For>
    <Legend definition={diagram.settings?.legend} palette={artifact.theme} theme={props.theme} />
    </div>
    <footer>Drag nodes · Drag background to select · Shift-click to add/remove · Right/middle-drag to pan · {scrollZoom() ? 'Wheel to zoom' : 'Wheel to pan'} · Ctrl+wheel to zoom · F to fit selection · Esc to clear · {selected().length} selected</footer>
    <Show when={!fullscreen()}><CanvasResizeHandle section={() => section} minimum={() => minimumSize()} onCommit={commitSize} /></Show>
  </section>
  <dialog ref={dialog} class="portable-fullscreen-dialog" aria-label={`Fullscreen canvas ${title}`}
    onCancel={event => { event.preventDefault(); exitFullscreen(); }} />
  </div>;
}
function App(props: { artifact: PortableArtifact; versions?: VersionedArtifact; selection?: string; onVersion?: (value: string) => void }) {
  const artifact = props.artifact;
  if (artifact.debugPerformance && artifact.bundleSize) {
    console.groupCollapsed('[portable bundle size]');
    console.info('Exact UTF-8 payload bytes', artifact.bundleSize);
    console.groupEnd();
  }
  const sourceView = new URL(window.location.href).searchParams.get('view') === 'source';
  const viewHref = () => {
    const url = new URL(window.location.href);
    if (sourceView) url.searchParams.delete('view');
    else url.searchParams.set('view', 'source');
    url.searchParams.set('theme', theme());
    return url.href;
  };
  const [theme, setTheme] = createSignal<Theme>(themeFromUrl(window.location.href));
  const cycleTheme = () => {
    const next = theme() === 'ground' ? 'light' : theme() === 'light' ? 'dark' : 'ground';
    window.history.replaceState(window.history.state, '', urlWithTheme(window.location.href, next));
    setTheme(next);
  };
  let article: HTMLElement | undefined;
  onMount(() => {
    if (!article) return;
    const disposers = Array.from(article.querySelectorAll<HTMLElement>('[data-portable-canvas]')).map(slot => {
      const diagram = artifact.diagrams[Number(slot.dataset.portableCanvas)];
      return render(() => <PortableCanvas artifact={artifact} diagram={diagram} theme={theme()} onThemeChange={cycleTheme} />, slot);
    });
    onCleanup(() => disposers.forEach(dispose => dispose()));
  });
  return <div class={`portable cactus-theme-${theme()}`}>
    <header class="portable-page-header"><strong>{artifact.title}</strong>
      <Show when={props.versions}><label>Version <select aria-label="Artifact version" value={props.selection ?? 'latest'} onChange={event => props.onVersion?.(event.currentTarget.value)}>
        <option value="latest">Latest (v{props.versions?.versions.at(-1)?.version})</option>
        <For each={props.versions?.versions}>{version => <option value={String(version.version)}>v{version.version} · {version.label}</option>}</For>
      </select></label></Show>
      <button onClick={cycleTheme}>Theme: {theme()}</button>
    </header>
    <Show when={sourceView} fallback={<article ref={element => article = element} class="portable-document" innerHTML={artifact.html} />}>
      <article class="portable-document portable-source-view">
        <h1>{artifact.sourceFilename}</h1>
        <a href={viewHref()}>Back to document</a>
        <pre aria-label="Markdown source"><code>{artifact.sourceMarkdown}</code></pre>
      </article>
    </Show>
    <PageFooter sourceHref={viewHref()} sourceView={sourceView} />
  </div>;
}
function VersionedApp(props: { collection: VersionedArtifact }) {
  const [href, setHref] = createSignal(window.location.href);
  const selected = createMemo(() => {
    try { return { version: selectedVersion(props.collection.versions, href()), error: '' }; }
    catch (error) { return { version: undefined, error: String(error) }; }
  });
  const selection = () => new URL(href()).searchParams.get('v') ?? 'latest';
  const change = (value: string) => {
    window.history.pushState(null, '', urlWithVersion(window.location.href, value === 'latest' ? value : Number(value)));
    setHref(window.location.href);
  };
  onMount(() => {
    const pop = () => setHref(window.location.href);
    window.addEventListener('popstate', pop);
    onCleanup(() => window.removeEventListener('popstate', pop));
  });
  // A keyed subtree disposes canvases, observers and info panels before mounting another version.
  return <Show when={selected().version} keyed fallback={<main role="alert"><p>{selected().error}</p><button onClick={() => change('latest')}>Show latest version</button></main>}>{version => <>
    <style data-portable-version-style>{version.customCss}</style>
    <App artifact={version.artifact} versions={props.collection} selection={selection()} onVersion={change} />
  </>}</Show>;
}
render(() => 'format' in payload ? <VersionedApp collection={payload} /> : <App artifact={payload} />, document.getElementById('app')!);
