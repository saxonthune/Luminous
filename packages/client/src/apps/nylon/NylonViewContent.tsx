import { For, Show, createMemo, createSignal, type JSX } from 'solid-js';
import { Portal } from 'solid-js/web';
import type { NylonDocument, NylonTransformation } from '@luminous/core/nylon';
import { checkNylonDocument } from '@luminous/core/nylon';
import {
  MenuRoot,
  NodeContainer,
  isOverContainerInterior,
  useCanvasContext,
  useGesture,
  type MenuSchema,
} from '@luminous/cactus';
import {
  CONTRACT_FRAME_VISUAL_BAND,
  LEAF_VISUAL_BAND,
  type NylonContractFrame,
  type NylonRenderNode,
} from '@luminous/core/nylon/projection';
import type { NylonDagDirection } from '@luminous/core/nylon/dagArrange';
import { NylonTransformationCard } from './NylonTransformationCard.tsx';
import { NylonFocusContainer } from './NylonFocusContainer.tsx';
import {
  NYLON_VIEW_POLICY,
  containerDragLocked,
  showsSecondaryNodeContent,
  type ViewportSize,
} from './viewportPolicy.ts';

const containerButtonStyle: JSX.CSSProperties = {
  height: '20px', padding: '0 3px', display: 'flex',
  'align-items': 'center', 'justify-content': 'center', gap: '2px',
  'flex-shrink': 0, 'font-size': '15px', 'font-weight': 650, 'line-height': 1,
  border: '1px solid var(--border-strong)', 'border-radius': '4px',
  background: 'var(--surface)', color: 'var(--fg)', cursor: 'pointer',
};

export function NylonViewContent(props: {
  doc: NylonDocument;
  nodes: () => NylonRenderNode[];
  contractFrames: () => NylonContractFrame[];
  viewportSize: () => ViewportSize;
  dragGroup: (id: string) => string[];
  onDragEnd: (id: string, dx: number, dy: number) => void;
  onDragStart: (id: string) => void;
  blocked: boolean;
  onExpand: (id: string) => void;
  onCollapse: (id: string) => void;
  onCover: (id: string) => void;
  onArrange: (id: string, direction: NylonDagDirection) => void;
  onSpace: (id: string) => void;
  standard: boolean;
  canMove: (id: string) => boolean;
  onOpenView?: (id: string | null) => void;
  onOpenPip?: (id: string, renderId: string) => void;
}): JSX.Element {
  const ctx = useCanvasContext();
  const diagnostics = createMemo(() => checkNylonDocument(props.doc));
  const nodeWarnings = (id: string) => {
    const items = new Map([...props.doc.transformations, ...props.doc.contracts].map((item) => [item.id, item]));
    const visible = new Set(props.nodes().map((node) => node.item.id));
    return diagnostics().filter((issue) => issue.nodeIds.some((affected) => {
      if (affected === id) return true;
      if (visible.has(affected)) return false;
      const seen = new Set<string>();
      let parent = items.get(affected)?.parent;
      while (parent && !seen.has(parent)) {
        if (parent === id) return true;
        if (visible.has(parent)) return false;
        seen.add(parent); parent = items.get(parent)?.parent;
      }
      return false;
    }));
  };
  const gesture = useGesture({
    zoomScale: () => ctx.transform().k,
    dragGroup: (id) => props.dragGroup(id),
    callbacks: {
      onDragStart: (id) => props.onDragStart(id),
      onDragEnd: (id, dx, dy) => props.onDragEnd(id, dx, dy),
    },
  });
  const dragDelta = (id: string) => gesture.draggedNodeIds().includes(id)
    ? gesture.dragDelta()
    : { dx: 0, dy: 0 };

  return (
    <>
      <For each={props.contractFrames()}>
        {(frame) => {
          const dragLocked = () => !props.canMove(frame.inputRenderId) || !props.canMove(frame.outputRenderId)
            || containerDragLocked(frame, ctx.transform().k, props.viewportSize());
          const delta = () => [frame.inputRenderId, frame.outputRenderId]
            .every((id) => gesture.draggedNodeIds().includes(id))
            ? gesture.dragDelta()
            : { dx: 0, dy: 0 };
          return (
            <div
              style={{
                position: 'absolute',
                left: `${frame.x}px`,
                top: `${frame.y}px`,
                width: `${frame.w}px`,
                height: `${frame.h}px`,
                transform: `translate(${delta().dx}px, ${delta().dy}px)`,
                'z-index': CONTRACT_FRAME_VISUAL_BAND,
                'pointer-events': frame.boundaryContainerId ? 'none' : 'auto',
                border: `${frame.compact ? 2 : 3}px solid var(--nylon-control-arc)`,
                'border-radius': frame.compact ? '22px' : '34px',
                background: 'color-mix(in srgb, var(--color-kind-signal-bg) 30%, transparent)',
                'box-shadow': '0 0 0 5px color-mix(in srgb, var(--nylon-control-arc) 14%, transparent)',
                cursor: frame.boundaryContainerId
                  ? 'default'
                  : dragLocked() ? 'not-allowed' : gesture.isDraggingNode(frame.id) ? 'grabbing' : 'grab',
              }}
              data-contract-frame={frame.id}
              data-no-pan
              onPointerDown={(event) => {
                // A marquee selects the constituent Contracts, not their owner.
                // Keep that selection when pressing an already selected frame.
                if (!ctx.isSelected(frame.inputRenderId) || !ctx.isSelected(frame.outputRenderId)) {
                  ctx.onNodePointerDown(frame.transformationId, event);
                }
                if (!props.blocked && !dragLocked()) gesture.beginPress(frame.id, event);
              }}
            >
              <Show when={ctx.transform().k >= NYLON_VIEW_POLICY.namesOnlyZoom}>
              <div title={frame.controlArcId ? `Invocation: ${frame.controlArcId}` : frame.name} style={{
                position: 'absolute', top: '0', left: '50%', transform: 'translate(-50%, -50%)',
                padding: frame.compact ? '2px 7px' : '3px 10px', background: 'var(--surface-alt)', color: 'var(--fg)',
                border: '2px solid var(--nylon-control-arc)', 'border-radius': '999px',
                'font-size': frame.compact ? '9px' : '11px', 'font-weight': 700, 'white-space': 'nowrap',
                'text-transform': 'uppercase', 'letter-spacing': '.08em',
              }}>
                {frame.name} · Control Contracts
              </div>
              <div style={{
                position: 'absolute', left: '50%', top: '50%', transform: 'translate(-50%, -50%)',
                width: frame.compact ? '18px' : '24px', height: frame.compact ? '18px' : '24px', display: 'grid', 'place-items': 'center',
                background: 'var(--surface-alt)', color: 'var(--nylon-control-arc)',
                border: '2px solid var(--nylon-control-arc)', 'border-radius': '999px',
                'font-size': frame.compact ? '12px' : '15px', 'font-weight': 800,
              }} aria-hidden="true">↓</div>
              </Show>
            </div>
          );
        }}
      </For>
      <For each={props.nodes()}>
        {(node) => {
          const focusContainer = () => props.standard && node.kind === 'container' && node.expanded;
          const dragLocked = () => !props.canMove(node.renderId) || (node.kind === 'container'
            && containerDragLocked(node, ctx.transform().k, props.viewportSize()));
          const showSecondary = () => showsSecondaryNodeContent(node, ctx.transform().k);
          const delta = () => dragDelta(node.renderId);
          const containerTint = () => node.depth % 2 === 0
            ? 'color-mix(in srgb, var(--surface-alt) 76%, var(--color-token-ochre) 24%)'
            : 'color-mix(in srgb, var(--surface-alt) 72%, var(--color-token-moss) 28%)';
          const containerBorder = () => node.depth % 2 === 0
            ? 'var(--color-token-ochre)'
            : 'var(--color-token-moss)';
          const facetRole = () => {
            if (node.kind !== 'contract') return null;
            const frame = props.contractFrames().find((candidate) => (
              candidate.input === node.item.id || candidate.output === node.item.id
            ));
            if (!frame) return null;
            return frame.input === node.item.id ? 'input' : 'output';
          };
          const contractKind = () => node.kind === 'contract' ? node.item.kind : undefined;
          const contractBackground = () => contractKind() === 'environment-settings'
            ? 'var(--color-kind-datasource-bg)'
            : contractKind() === 'options'
              ? 'var(--color-kind-memo-bg)'
              : contractKind()
                ? 'var(--color-kind-effect-bg)'
                : 'var(--color-kind-signal-bg)';
          const contractBorder = () => contractKind() === 'environment-settings'
            ? 'var(--color-kind-datasource-border)'
            : contractKind() === 'options'
              ? 'var(--color-kind-memo-border)'
              : contractKind()
                ? 'var(--color-kind-effect-border)'
                : 'var(--color-kind-signal-border)';
          return (
            <NodeContainer
          nodeId={node.renderId}
          x={() => node.x + delta().dx}
          y={() => node.y + delta().dy}
          w={() => node.w}
          h={() => node.h}
          visualBand={() => node.kind === 'container' && (!props.standard || focusContainer()) ? node.depth : LEAF_VISUAL_BAND + node.depth}
          softContainer={() => node.kind === 'container' && (!props.standard || focusContainer())}
          containerTint={containerTint}
          containerBorder={containerBorder}
          containerBorderWidth={() => 2}
          containerInset={() => ({ top: 38, left: 0, right: 0, bottom: 0 })}
          onPointerDown={(event) => {
            if (node.kind === 'container' && node.state === 'expanded' && event.button === 0
              && isOverContainerInterior(event.currentTarget as Element, event.clientX, event.clientY)) return;
            if (node.kind === 'container' && node.state === 'covered' && event.button === 0) {
              event.stopPropagation();
            }
            ctx.onNodePointerDown(node.renderId, event);
            if (!props.blocked && !dragLocked()) gesture.beginPress(node.renderId, event);
          }}
        >
          <Show when={node.context}>
            <span class="absolute -top-5 left-1 text-xs font-semibold text-fg-muted">Context</span>
          </Show>
          <Show when={nodeWarnings(node.item.id).length}>
            <details data-no-pan class="absolute right-0 top-0 z-50 max-w-72 rounded bg-surface text-fg shadow-lg"
              onPointerDown={(event) => event.stopPropagation()} onClick={(event) => event.stopPropagation()}>
              <summary class="cursor-pointer px-2" aria-label={`Warnings for ${node.item.name}`}>
                ⚠ {nodeWarnings(node.item.id).length}
              </summary>
              <For each={nodeWarnings(node.item.id)}>{(issue) => <p class="p-2 text-xs">{issue.rule}: {issue.message}</p>}</For>
            </details>
          </Show>
          <Show when={focusContainer()}>
            <NylonFocusContainer overview={ctx.transform().k < NYLON_VIEW_POLICY.namesOnlyZoom} name={node.item.name} selected={ctx.isSelected(node.renderId)} />
          </Show>
          <Show when={props.standard && node.kind !== 'contract' && !focusContainer() ? node : null}>
            {(card) => <NylonTransformationCard doc={props.doc} item={card().item as NylonTransformation}
              selected={ctx.isSelected(node.renderId)} overview={ctx.transform().k < NYLON_VIEW_POLICY.namesOnlyZoom} onOpen={props.onOpenView}
              onOpenPip={props.onOpenPip ? (id) => props.onOpenPip?.(id, node.renderId) : undefined} />}
          </Show>
          <Show when={node.kind === 'container' && !props.standard}>
            <div style={{
              height: node.kind === 'container' && node.state === 'collapsed' ? '100%' : '38px',
              padding: '0 4px', display: 'flex', 'align-items': 'center', gap: '4px',
              color: 'var(--fg)', 'font-size': '15px', 'font-weight': 650,
              border: ctx.isSelected(node.renderId) ? '3px solid var(--accent)' : `2px solid ${containerBorder()}`,
              'border-radius': node.kind === 'container' && node.state === 'collapsed' ? '10px' : '10px 10px 0 0',
              background: containerTint(),
              cursor: dragLocked() ? 'not-allowed' : gesture.isDraggingNode(node.renderId) ? 'grabbing' : 'grab',
            }}>
              <span title={node.item.name} style={{ overflow: 'hidden', 'text-overflow': 'ellipsis', 'white-space': 'nowrap',
                'max-width': '100%', 'flex-shrink': 1 }}>
                {node.item.name}
              </span>
              <div style={{ 'margin-left': 'auto', display: 'flex', gap: '2px', 'flex-shrink': 0 }} data-no-pan>
                <Show when={node.kind === 'container' && node.expanded}>
                  <button
                    type="button"
                    aria-label={`Space children of ${node.item.name}`}
                    title="Space children"
                    on:pointerdown={(event) => event.stopPropagation()}
                    on:click={(event) => {
                      event.stopPropagation();
                      props.onSpace(node.item.id);
                    }}
                    style={containerButtonStyle}
                  >Space</button>
                  <DagLayoutMenu
                    name={node.item.name}
                    onArrange={(direction) => props.onArrange(node.item.id, direction)}
                  />
                </Show>
                <Show when={!props.standard}>
                <button
                  type="button"
                  aria-label={`Expand ${node.item.name}`}
                  title="Expand"
                  disabled={node.kind === 'container' && node.expanded}
                  on:pointerdown={(event) => event.stopPropagation()}
                  on:click={(event) => {
                    event.stopPropagation();
                    props.onExpand(node.item.id);
                  }}
                  style={{
                    ...containerButtonStyle,
                    opacity: node.kind === 'container' && node.expanded ? 0.38 : 1,
                  }}
                >+</button>
                <button
                  type="button"
                  aria-label={`Collapse ${node.item.name}`}
                  title="Collapse"
                  disabled={node.kind === 'container' && node.state === 'collapsed'}
                  on:pointerdown={(event) => event.stopPropagation()}
                  on:click={(event) => {
                    event.stopPropagation();
                    props.onCollapse(node.item.id);
                  }}
                  style={{
                    ...containerButtonStyle,
                    opacity: node.kind === 'container' && node.state === 'collapsed' ? 0.38 : 1,
                  }}
                >−</button>
                <button
                  type="button"
                  aria-label={`Cover ${node.item.name}`}
                  title="Cover"
                  disabled={node.kind === 'container' && !node.expanded}
                  on:pointerdown={(event) => event.stopPropagation()}
                  on:click={(event) => {
                    event.stopPropagation();
                    props.onCover(node.item.id);
                  }}
                  style={{
                    ...containerButtonStyle,
                    opacity: node.kind === 'container' && !node.expanded ? 0.38 : 1,
                  }}
                >Cover</button>
                </Show>
              </div>
            </div>
          </Show>
          <Show when={node.kind === 'transformation' && !props.standard}>
            <div style={{
              width: '100%', height: '100%', padding: '16px', display: 'flex',
              'flex-direction': 'column', 'justify-content': 'center', gap: '10px',
              background: 'var(--surface)', color: 'var(--fg)',
              border: ctx.isSelected(node.renderId) ? '3px solid var(--accent)' : '2px solid var(--border-strong)',
              'border-radius': '3px', 'box-shadow': 'var(--shadow-sm)', overflow: 'hidden',
              cursor: gesture.isDraggingNode(node.renderId) ? 'grabbing' : 'grab',
            }}>
              <span style={{ 'font-size': '11px', 'text-transform': 'uppercase', 'letter-spacing': '.1em', color: 'var(--fg-muted)' }}>Transformation</span>
              <strong style={{ 'font-size': '18px', 'line-height': 1.2 }}>{node.item.name}</strong>
              <Show when={showSecondary()}>
                <span style={{ 'font-size': '12px', 'line-height': 1.35, color: 'var(--fg-muted)', display: '-webkit-box', '-webkit-line-clamp': 4, '-webkit-box-orient': 'vertical', overflow: 'hidden' }}>
                  {node.kind === 'transformation' ? node.item.prose : ''}
                </span>
                <Show when={node.kind === 'transformation' && node.item.needs?.length}>
                  <span style={{ 'font-size': '11px', color: 'var(--fg-muted)', overflow: 'hidden', 'text-overflow': 'ellipsis', 'white-space': 'nowrap' }}>
                    Needs: {node.kind === 'transformation' ? node.item.needs?.join(', ') : ''}
                  </span>
                </Show>
              </Show>
            </div>
          </Show>
          <Show when={node.kind === 'contract' ? node : null}>
            {(contractNode) => (
              <NylonContractContent
                node={contractNode()}
                selected={() => ctx.isSelected(contractNode().renderId)}
                dragging={() => gesture.isDraggingNode(contractNode().renderId)}
                facetRole={facetRole()}
                contractKind={contractKind()}
                background={contractBackground()}
                border={contractBorder()}
                overview={ctx.transform().k < NYLON_VIEW_POLICY.namesOnlyZoom}
                showSecondary={showSecondary}
              />
            )}
          </Show>
            </NodeContainer>
          );
        }}
      </For>
    </>
  );
}

function NylonContractContent(props: {
  node: Extract<NylonRenderNode, { kind: 'contract' }>;
  selected: () => boolean;
  dragging: () => boolean;
  facetRole: string | null;
  contractKind: string | undefined;
  background: string;
  border: string;
  showSecondary: () => boolean;
  overview: boolean;
}): JSX.Element {
  return (
    <Show when={!props.overview} fallback={
      <div style={{ width: '100%', height: '100%', 'box-sizing': 'border-box', padding: '4px 10px',
        display: 'flex', 'align-items': 'center', 'justify-content': 'center', background: props.background,
        color: 'var(--fg)', border: `3px solid ${props.selected() ? 'var(--accent)' : props.border}`,
        'border-radius': '999px', overflow: 'hidden' }}>
        <strong title={props.node.item.name} style={{ 'font-size': props.node.compact ? '22px' : '30px',
          'line-height': '1.05', 'text-align': 'center', 'overflow-wrap': 'anywhere', display: '-webkit-box',
          '-webkit-line-clamp': props.node.compact ? 2 : 3, '-webkit-box-orient': 'vertical', overflow: 'hidden' }}>{props.node.item.name}</strong>
      </div>
    }>
    <Show
      when={props.node.compact}
      fallback={
        <div style={{
          width: '100%', height: '100%', padding: '14px 22px', display: 'flex',
          'flex-direction': 'column', 'justify-content': 'center', gap: '6px',
          background: props.background, color: 'var(--fg)',
          border: props.selected() ? '3px solid var(--accent)' : `2px solid ${props.border}`,
          'border-radius': '999px', 'box-shadow': 'var(--shadow-sm)', overflow: 'hidden',
          cursor: props.dragging() ? 'grabbing' : 'grab',
        }}>
          <span style={{ 'font-size': '10px', 'text-transform': 'uppercase', 'letter-spacing': '.1em', color: 'var(--fg-muted)', 'text-align': 'center' }}>
            Contract{props.facetRole ? ` · ${props.facetRole}` : ''}{props.contractKind ? ` · ${props.contractKind}` : ''}
          </span>
          <strong style={{ 'font-size': '20px', 'line-height': 1.2, 'text-align': 'center' }}>{props.node.item.name}</strong>
          <Show when={props.showSecondary()}>
            <span style={{ 'font-family': 'ui-monospace, monospace', 'font-size': '11px', 'line-height': 1.3, color: 'var(--fg-muted)', 'white-space': 'pre-line', 'text-align': 'center', overflow: 'hidden', 'text-overflow': 'ellipsis' }}>
              {props.node.item.text}
            </span>
          </Show>
        </div>
      }
    >
      <div style={{
        width: '100%', height: '100%', padding: '2px 6px', display: 'flex',
        'flex-direction': 'column', 'justify-content': 'center', gap: '0',
        background: props.background, color: 'var(--fg)',
        border: props.selected() ? '3px solid var(--accent)' : `2px solid ${props.border}`,
        'border-radius': '999px', 'box-shadow': 'var(--shadow-sm)', overflow: 'hidden',
        cursor: props.dragging() ? 'grabbing' : 'grab',
      }}>
        <span style={{ 'font-size': '10px', 'text-transform': 'uppercase', 'letter-spacing': '.08em', color: 'var(--fg-muted)', 'text-align': 'center' }}>
          {props.facetRole ?? 'contract'}
        </span>
        <strong style={{ 'font-size': '18px', 'line-height': 1.1, 'text-align': 'center', overflow: 'hidden', 'text-overflow': 'ellipsis', 'white-space': 'nowrap' }}>
          {props.node.item.name}
        </strong>
      </div>
    </Show>
    </Show>
  );
}

function DagLayoutMenu(props: {
  name: string;
  onArrange: (direction: NylonDagDirection) => void;
}): JSX.Element {
  const [open, setOpen] = createSignal(false);
  const [anchor, setAnchor] = createSignal({ x: 0, y: 0 });
  const schema = (): MenuSchema => ({
    id: 'nylon-dag-direction',
    items: [
      ['LR', 'Left to right'],
      ['TD', 'Top to down'],
      ['RL', 'Right to left'],
      ['DT', 'Down to top'],
    ].map(([direction, label]) => ({
      type: 'action' as const,
      action: { id: `layout.dag.${direction}`, label, payload: direction },
    })),
  });

  return (
    <>
      <button
        type="button"
        aria-label={`Order ${props.name} with DAG layout`}
        aria-haspopup="menu"
        title="DAG layout"
        on:pointerdown={(event) => event.stopPropagation()}
        on:click={(event) => {
          event.stopPropagation();
          const rect = event.currentTarget.getBoundingClientRect();
          setAnchor({ x: rect.left, y: rect.bottom + 2 });
          setOpen(true);
        }}
        style={containerButtonStyle}
      >
        DAG <span aria-hidden="true">▾</span>
      </button>
      <Show when={open()}>
        <Portal>
          <MenuRoot
            schema={schema()}
            open
            onOpenChange={setOpen}
            anchorX={anchor().x}
            anchorY={anchor().y}
            onAction={(_id, payload) => {
              props.onArrange(payload as NylonDagDirection);
              setOpen(false);
            }}
          />
        </Portal>
      </Show>
    </>
  );
}
