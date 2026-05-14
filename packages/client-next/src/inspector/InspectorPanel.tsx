import { Show, For, onMount, onCleanup, createMemo } from 'solid-js';
import type { JSX } from 'solid-js';
import { useContext } from 'solid-js';
import type { Graph, View, Node, Edge } from '@luminous/core';
import { getNodeRenderer, getEdgeRenderer } from '@luminous/core';
import { CanvasContext } from '@luminous/cactus';
import { useInspector } from './InspectorContext';

export interface InspectorPanelProps {
  graph: Graph;
  view: View;
}

const PANEL_STYLE: JSX.CSSProperties = {
  position: 'fixed',
  right: '0',
  top: '0',
  bottom: '0',
  width: '360px',
  background: 'white',
  'border-left': '1px solid #d0d0d0',
  padding: '12px',
  overflow: 'auto',
  'z-index': '10',
  'font-size': '13px',
  'font-family': 'system-ui, sans-serif',
};

function renderValue(
  val: unknown,
  graph: Graph,
  openFn: (id: string) => void,
): JSX.Element {
  if (
    typeof val === 'string' &&
    (graph.nodes.has(val) || graph.edges.has(val))
  ) {
    return (
      <a
        href="#"
        style={{ color: '#0066cc', 'text-decoration': 'underline', cursor: 'pointer' }}
        onClick={(e) => {
          e.preventDefault();
          openFn(val);
        }}
      >
        {val}
      </a>
    );
  }
  if (typeof val === 'string') return <>{val}</>;
  return <>{JSON.stringify(val)}</>;
}

function FallbackProps(props: {
  item: Node | Edge;
  graph: Graph;
  open: (id: string) => void;
}): JSX.Element {
  const entries = () => Object.entries(props.item.props);
  return (
    <dl style={{ margin: '0', padding: '0' }}>
      <dt style={{ 'font-weight': 'bold', 'margin-top': '6px' }}>id</dt>
      <dd style={{ margin: '0 0 0 12px', color: '#444' }}>{props.item.id}</dd>
      <dt style={{ 'font-weight': 'bold', 'margin-top': '6px' }}>kind</dt>
      <dd style={{ margin: '0 0 0 12px', color: '#444' }}>{props.item.kind}</dd>
      <Show when={props.item.tags.length > 0}>
        <dt style={{ 'font-weight': 'bold', 'margin-top': '6px' }}>tags</dt>
        <dd style={{ margin: '0 0 0 12px', color: '#444' }}>
          {props.item.tags.join(', ')}
        </dd>
      </Show>
      <For each={entries()}>
        {([key, val]) => (
          <>
            <dt style={{ 'font-weight': 'bold', 'margin-top': '6px' }}>{key}</dt>
            <dd style={{ margin: '0 0 0 12px', color: '#444' }}>
              {renderValue(val, props.graph, props.open)}
            </dd>
          </>
        )}
      </For>
    </dl>
  );
}

export function InspectorPanel(props: InspectorPanelProps): JSX.Element {
  const { target, open, back, close, stack } = useInspector();
  const canvasCtx = useContext(CanvasContext);

  onMount(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        close();
        canvasCtx?.clearSelection();
      }
    };
    window.addEventListener('keydown', handler);
    onCleanup(() => window.removeEventListener('keydown', handler));
  });

  const breadcrumb = createMemo(() => {
    const s = stack();
    const hasMore = s.length > 4;
    const visible = hasMore ? s.slice(-4) : s;
    return { visible, hasMore, fullStack: s };
  });

  const currentItem = createMemo((): Node | Edge | null => {
    const id = target();
    if (!id) return null;
    return (props.graph.nodes.get(id) as Node | undefined) ??
      (props.graph.edges.get(id) as Edge | undefined) ??
      null;
  });

  const renderBody = (): JSX.Element => {
    const id = target();
    if (!id) return null;
    const item = currentItem();
    if (!item) {
      return <p style={{ color: '#999', 'font-style': 'italic' }}>Not in graph</p>;
    }

    const renderCtx = {
      level: () => 'open' as const,
      zoom: () => 1,
      view: props.view,
      graph: props.graph,
      inspect: open,
    };

    const nodeItem = props.graph.nodes.get(id);
    if (nodeItem) {
      const renderer = getNodeRenderer(nodeItem.kind, 'open');
      if (renderer) {
        return renderer(nodeItem, renderCtx) as JSX.Element;
      }
    } else {
      const edgeItem = props.graph.edges.get(id);
      if (edgeItem) {
        const renderer = getEdgeRenderer(edgeItem.kind, 'open');
        if (renderer) {
          return renderer(edgeItem, renderCtx) as JSX.Element;
        }
      }
    }

    return <FallbackProps item={item} graph={props.graph} open={open} />;
  };

  return (
    <Show when={target() !== null}>
      <div style={PANEL_STYLE}>
        {/* Header: breadcrumb + back + close */}
        <div
          style={{
            display: 'flex',
            'align-items': 'center',
            gap: '6px',
            'margin-bottom': '12px',
            'border-bottom': '1px solid #eee',
            'padding-bottom': '8px',
          }}
        >
          {/* Breadcrumb */}
          <div style={{ flex: '1', display: 'flex', 'align-items': 'center', gap: '4px', overflow: 'hidden' }}>
            <Show when={breadcrumb().hasMore}>
              <span style={{ color: '#999' }}>…</span>
              <span style={{ color: '#999' }}>/</span>
            </Show>
            <For each={breadcrumb().visible}>
              {(id, i) => {
                const isLast = () => i() === breadcrumb().visible.length - 1;
                const fullIdx = () =>
                  breadcrumb().fullStack.length - breadcrumb().visible.length + i();
                return (
                  <>
                    <Show when={i() > 0}>
                      <span style={{ color: '#999' }}>/</span>
                    </Show>
                    <Show
                      when={!isLast()}
                      fallback={
                        <span
                          style={{
                            overflow: 'hidden',
                            'text-overflow': 'ellipsis',
                            'white-space': 'nowrap',
                            'max-width': '120px',
                            display: 'inline-block',
                            color: '#222',
                            'font-weight': 'bold',
                          }}
                          title={id}
                        >
                          {id}
                        </span>
                      }
                    >
                      <a
                        href="#"
                        style={{
                          overflow: 'hidden',
                          'text-overflow': 'ellipsis',
                          'white-space': 'nowrap',
                          'max-width': '100px',
                          display: 'inline-block',
                          color: '#0066cc',
                          'text-decoration': 'none',
                          cursor: 'pointer',
                        }}
                        title={id}
                        onClick={(e) => {
                          e.preventDefault();
                          const newStack = breadcrumb().fullStack.slice(0, fullIdx() + 1);
                          // Reset to this depth by opening from a clean position.
                          // We close and re-push from top of newStack.
                          close();
                          for (const entry of newStack) open(entry);
                        }}
                      >
                        {id}
                      </a>
                    </Show>
                  </>
                );
              }}
            </For>
          </div>

          {/* Back button */}
          <button
            disabled={stack().length <= 1}
            onClick={() => back()}
            style={{
              background: 'none',
              border: '1px solid #ccc',
              'border-radius': '3px',
              cursor: stack().length <= 1 ? 'default' : 'pointer',
              padding: '2px 8px',
              opacity: stack().length <= 1 ? '0.4' : '1',
              'font-size': '13px',
            }}
            title="Back"
          >
            ←
          </button>

          {/* Close button */}
          <button
            onClick={() => {
              close();
              canvasCtx?.clearSelection();
            }}
            style={{
              background: 'none',
              border: '1px solid #ccc',
              'border-radius': '3px',
              cursor: 'pointer',
              padding: '2px 8px',
              'font-size': '13px',
            }}
            title="Close"
          >
            ×
          </button>
        </div>

        {/* Body */}
        {renderBody()}
      </div>
    </Show>
  );
}
