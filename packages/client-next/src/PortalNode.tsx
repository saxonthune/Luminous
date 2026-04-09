import { createSignal, createResource, createMemo, Show, For, type JSX } from 'solid-js';
import { NodeContainer, DragHandle, ResizeHandle, ConnectionHandle, useCanvasContext } from '@luminous/cactus';
import type { ResizeDirection } from '@luminous/cactus';
import type { Note, Node, Document, PortalNode as PortalNodeType } from './api';
import { getDocument } from './api';
import { ContextMenu } from './ContextMenu';
import type { MenuItem } from './ContextMenu';

interface PortalNodeProps {
  node: PortalNodeType;
  mergedNotes: () => Record<string, Note>;
  onDragPointerDown: (nodeId: string, event: PointerEvent) => void;
  onResizePointerDown: (nodeId: string, direction: ResizeDirection, event: PointerEvent) => void;
  onDelete: (nodeId: string) => void;
  // Multi-source portal loading
  sources: Record<string, Document>;
  onSourceLoaded: (path: string, doc: Document) => void;
  ancestorSources: Set<string>;
  renderNode: (node: Node, sourcePath: string, ancestors: Set<string>) => JSX.Element;
  children?: JSX.Element;
}

export function PortalNode(props: PortalNodeProps) {
  const [contextMenu, setContextMenu] = createSignal<{ x: number; y: number } | null>(null);
  const { startConnection, isSelected, onNodePointerDown } = useCanvasContext();

  const merged = () => props.mergedNotes()[props.node.id];

  // Cycle detection — is this canvasRef already in our rendering ancestry?
  const isCycle = () => props.ancestorSources.has(props.node.canvasRef);

  const [portalResource] = createResource(
    () => !isCycle() && props.node.canvasRef ? props.node.canvasRef : null,
    async (path) => {
      // Already loaded — return immediately without another fetch
      if (props.sources[path]) return props.sources[path];
      const doc = await getDocument(path);
      props.onSourceLoaded(path, doc);
      return doc;
    }
  );

  // Prefer the store (reactive, kept up-to-date on WS reload) over the resource snapshot
  const portalDoc = () =>
    props.sources[props.node.canvasRef] ??
    (portalResource.state === 'ready' ? portalResource() : null);

  const isNotFound = () => {
    const err = portalResource.error;
    return err != null && String((err as any)?.message ?? err).includes('404');
  };

  // Build the new ancestor set for children of this portal
  const newAncestors = createMemo(() =>
    new Set([...props.ancestorSources, props.node.canvasRef])
  );

  // Top-level nodes of the loaded portal canvas (parentId === null)
  const portalTopLevel = () => {
    const doc = portalDoc();
    if (!doc) return [] as Node[];
    return Object.values(doc.notes).filter((n) => !n.parentId);
  };

  const buildMenuItems = (): MenuItem[] => [
    { label: 'Delete portal', action: () => props.onDelete(props.node.id) },
  ];

  return (
    <NodeContainer
      nodeId={props.node.id}
      x={() => merged()?.x ?? props.node.x}
      y={() => merged()?.y ?? props.node.y}
      w={() => merged()?.w ?? props.node.w}
      h={() => merged()?.h ?? props.node.h}
      onPointerDown={(e) => {
        onNodePointerDown(props.node.id, e);
        props.onDragPointerDown(props.node.id, e);
      }}
      onContextMenu={(e) => {
        e.preventDefault();
        setContextMenu({ x: e.clientX, y: e.clientY });
      }}
    >
      <div
        class={`bg-[var(--bg-surface)] rounded-lg flex flex-col select-none ${
          isSelected(props.node.id)
            ? 'outline outline-2 outline-[var(--color-accent-subtle)] border-transparent'
            : 'border border-dashed border-[var(--border-default)]'
        }`}
        style={{ 'box-shadow': 'var(--shadow-sm)', width: '100%', 'min-height': 'inherit' }}
      >
        <DragHandle class="h-5 bg-[var(--bg-surface-alt)] rounded-t-lg cursor-grab active:cursor-grabbing border-b border-[var(--border-subtle)] flex items-center justify-center shrink-0">
          <div class="w-8 h-0.5 bg-[var(--text-tertiary)] rounded-full" />
        </DragHandle>

        <div class="px-2 py-1 font-semibold text-sm border-b border-[var(--border-subtle)] text-[var(--text-primary)] flex items-center gap-2">
          <span>{props.node.title || 'Untitled Portal'}</span>
          <span class="text-xs text-[var(--text-tertiary)] font-mono font-normal truncate">
            {props.node.canvasRef || '(no canvas ref)'}
          </span>
        </div>

        {/* Portal body — shows loading / error / cycle / content */}
        <div class="flex-1 relative overflow-hidden">
          <Show when={isCycle()}>
            <div class="flex items-center justify-center h-full p-4 text-center">
              <div class="text-sm text-amber-500">
                Circular reference: {props.node.canvasRef}
              </div>
            </div>
          </Show>

          <Show when={!isCycle()}>
            <Show when={portalResource.loading && !portalDoc()}>
              <div class="flex items-center justify-center h-full p-4">
                <div class="text-sm text-[var(--text-tertiary)]">Loading…</div>
              </div>
            </Show>

            <Show when={!portalResource.loading && isNotFound()}>
              <div class="flex items-center justify-center h-full p-4 text-center">
                <div class="text-sm text-[var(--text-secondary)]">
                  Canvas not found: {props.node.canvasRef}
                </div>
              </div>
            </Show>

            <Show when={!portalResource.loading && portalResource.error && !isNotFound()}>
              <div class="flex items-center justify-center h-full p-4 text-center">
                <div class="text-sm text-red-500">
                  Failed to load: {props.node.canvasRef}
                </div>
              </div>
            </Show>

            <Show when={portalDoc()}>
              <For each={portalTopLevel()}>
                {(node) => props.renderNode(node, props.node.canvasRef, newAncestors())}
              </For>
            </Show>
          </Show>
        </div>

        {/* Nested children from the main document (Ctrl+drag'd into this portal node) */}
        {props.children}

        <ConnectionHandle
          type="source"
          nodeId={props.node.id}
          onStartConnection={startConnection}
          class="absolute top-1/2 w-3 h-3 rounded-full bg-[var(--color-accent-subtle)] border-2 border-[var(--bg-surface)] shadow-sm cursor-crosshair opacity-0 hover:opacity-100 transition-opacity"
          style={{ right: '-6px', transform: 'translateY(-50%)' }}
        />

        <ResizeHandle
          nodeId={props.node.id}
          onResizePointerDown={props.onResizePointerDown}
        />
      </div>

      <Show when={contextMenu()}>
        {(menu) => (
          <ContextMenu
            x={menu().x}
            y={menu().y}
            items={buildMenuItems()}
            onClose={() => setContextMenu(null)}
          />
        )}
      </Show>
    </NodeContainer>
  );
}
