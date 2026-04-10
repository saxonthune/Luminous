import { createSignal, For, Show, type JSX } from 'solid-js'
import { NodeContainer, ConnectionHandle, ResizeHandle, useCanvasContext } from '@luminous/cactus'
import type { ResizeDirection } from '@luminous/cactus'
import { primitiveRenderers } from './primitives'
import type { CanvasIndex } from './canvasIndex'
import { ContextMenu, type MenuItem } from './ContextMenu'
import { isNodeSchema } from './api'
import type { AncestorEdgeInfo } from './CanvasView'

export interface SchemaNodeProps {
  nodeId: string
  index: CanvasIndex
  /** Cycle-protection set, threaded through recursion. */
  visited?: Set<string>
  /** Drag wiring — provided by the canvas-level integrator (CanvasView). */
  onDragPointerDown: (id: string, e: PointerEvent) => void
  onResizePointerDown: (id: string, dir: ResizeDirection, e: PointerEvent) => void
  /** Action wiring — provided by the canvas-level integrator. */
  onDelete: (id: string) => void
  onTidy: (id: string) => void
  /** Ancestor edges for inline rendering — keyed by node ID. */
  ancestorEdges?: () => Map<string, AncestorEdgeInfo[]>
}

export function SchemaNode(props: SchemaNodeProps): JSX.Element {
  const visited = props.visited ?? new Set<string>()

  // Cycle guard — if we've already rendered this node up the recursion chain, stop.
  if (visited.has(props.nodeId)) {
    return <CycleNode nodeId={props.nodeId} />
  }
  const nextVisited = new Set(visited)
  nextVisited.add(props.nodeId)

  const node = () => props.index.getNode(props.nodeId)
  const schema = () => props.index.getSchema(props.nodeId)
  const content = () => props.index.getContent(props.nodeId) ?? {}
  const children = () => props.index.getChildren(props.nodeId)

  const [contextMenu, setContextMenu] = createSignal<{ x: number; y: number } | null>(null)
  const { isSelected, onNodePointerDown, startConnection } = useCanvasContext()

  return (
    <Show when={node()} fallback={null}>
      {(n) => (
        <NodeContainer
          nodeId={props.nodeId}
          x={() => n().geometry.x}
          y={() => n().geometry.y}
          w={() => n().geometry.w}
          h={() => n().geometry.h}
          onPointerDown={(e) => {
            onNodePointerDown(props.nodeId, e)
            props.onDragPointerDown(props.nodeId, e)
          }}
          onContextMenu={(e) => {
            e.preventDefault()
            e.stopPropagation()
            setContextMenu({ x: e.clientX, y: e.clientY })
          }}
        >
          <Show
            when={schema()}
            fallback={<FallbackNode nodeId={props.nodeId} content={content()} />}
          >
            {(s) => (
              <div
                class={`relative bg-[var(--bg-surface)] rounded-lg flex flex-col select-none ${
                  isSelected(props.nodeId)
                    ? 'outline outline-2 outline-[var(--color-accent-subtle)] border-transparent'
                    : 'border border-[var(--border-default)]'
                }`}
                style={{
                  'box-shadow': 'var(--shadow-sm)',
                  width: '100%',
                  // h=0 means "auto-size me" — omit min-height so content drives the height.
                  // h>0 means a measured or user-set height — enforce it via min-height.
                  ...(n().geometry.h > 0 ? { 'min-height': 'inherit' } : {}),
                  ...kindStyle(n().schemaName),
                }}
              >
                {/* Node's own content (primitives + inline edges) — measured for tidy layout */}
                <div data-node-header="true">
                  <div data-primitive-stack="true">
                    <For each={(() => { const sc = s(); return isNodeSchema(sc) ? sc.primitives : [] })()}>
                      {(primitive) => {
                        const Renderer = primitiveRenderers[primitive.type] ?? UnknownPrimitiveRenderer
                        const value = primitive.bind ? content()[primitive.bind] : undefined
                        return (
                          <Renderer
                            primitive={primitive}
                            nodeId={props.nodeId}
                            schemaName={s().name}
                            value={value}
                            onChange={(next) => {
                              if (primitive.bind) {
                                props.index.setContent(props.nodeId, { [primitive.bind]: next })
                              }
                            }}
                          />
                        )
                      }}
                    </For>
                  </div>

                  {/* Ancestor edges rendered inline */}
                  <Show when={props.ancestorEdges?.().get(props.nodeId)}>
                    {(edgeInfos) => (
                      <div class="mx-2 mb-2 flex flex-wrap gap-1">
                        <For each={edgeInfos()}>
                          {(info) => (
                            <span
                              class="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-mono border border-[var(--border-subtle)] bg-[var(--bg-surface-alt)] text-[var(--text-secondary)]"
                              title={`${info.direction === 'up' ? '↑' : '↓'} ${info.label} ${info.targetName}`}
                            >
                              <span class="opacity-60">{info.direction === 'up' ? '↑' : '↓'}</span>
                              {info.label ? `${info.label} ` : ''}{info.targetName}
                            </span>
                          )}
                        </For>
                      </div>
                    )}
                  </Show>
                </div>

                {/* Default child region — render children of this node, recursively */}
                <Show when={children().length > 0}>
                  <For each={children()}>
                    {(childId) => (
                      <SchemaNode
                        nodeId={childId}
                        index={props.index}
                        visited={nextVisited}
                        onDragPointerDown={props.onDragPointerDown}
                        onResizePointerDown={props.onResizePointerDown}
                        onDelete={props.onDelete}
                        onTidy={props.onTidy}
                        ancestorEdges={props.ancestorEdges}
                      />
                    )}
                  </For>
                </Show>

                <ConnectionHandle
                  type="source"
                  nodeId={props.nodeId}
                  onStartConnection={startConnection}
                  class="absolute top-1/2 w-3 h-3 rounded-full bg-[var(--color-accent-subtle)] border-2 border-[var(--bg-surface)] shadow-sm cursor-crosshair opacity-0 hover:opacity-100 transition-opacity"
                  style={{ right: '-6px', transform: 'translateY(-50%)' }}
                />

                <ResizeHandle
                  nodeId={props.nodeId}
                  onResizePointerDown={props.onResizePointerDown}
                />
              </div>
            )}
          </Show>

          <Show when={contextMenu()}>
            {(menu) => (
              <ContextMenu
                x={menu().x}
                y={menu().y}
                header={`${String(content().title ?? content().label ?? 'Untitled')} · ${props.nodeId.slice(0, 8)}`}
                items={buildMenuItems(props, schema()?.label)}
                onClose={() => setContextMenu(null)}
              />
            )}
          </Show>
        </NodeContainer>
      )}
    </Show>
  )
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function kindStyle(schemaName: string): Record<string, string> {
  return {
    'background-color': `var(--kind-${schemaName}-bg, var(--bg-surface))`,
    'border-color': `var(--kind-${schemaName}-border, var(--border-default))`,
  }
}

function buildMenuItems(
  props: SchemaNodeProps,
  kindLabel: string | undefined,
): MenuItem[] {
  return [
    { label: 'Tidy layout', action: () => props.onTidy(props.nodeId) },
    { label: '', action: () => {}, separator: true },
    { label: kindLabel ? `Delete ${kindLabel.toLowerCase()}` : 'Delete', action: () => props.onDelete(props.nodeId) },
  ]
}

// ---------------------------------------------------------------------------
// Fallback components
// ---------------------------------------------------------------------------

function FallbackNode(props: { nodeId: string; content: Record<string, unknown> }) {
  return (
    <div class="relative bg-amber-50 border border-amber-300 rounded-lg p-2 text-xs">
      <div class="font-semibold text-amber-900">⚠ Unknown schema</div>
      <div class="font-mono text-amber-700">{props.nodeId.slice(0, 8)}</div>
      <For each={Object.entries(props.content)}>
        {([key, value]) => (
          <div class="mt-1">
            <span class="font-mono text-amber-800">{key}:</span>{' '}
            <span class="text-amber-900">{String(value).slice(0, 100)}</span>
          </div>
        )}
      </For>
    </div>
  )
}

const UnknownPrimitiveRenderer = (props: { primitive: { type: string } }) => (
  <div class="px-2 py-1 text-xs bg-amber-100 border border-amber-300 text-amber-900 rounded">
    Unknown primitive: <span class="font-mono">{props.primitive.type}</span>
  </div>
)

function CycleNode(props: { nodeId: string }) {
  return (
    <div class="px-2 py-1 text-xs bg-red-50 border border-red-300 text-red-900 rounded font-mono">
      ⟲ cycle: {props.nodeId.slice(0, 8)}
    </div>
  )
}
