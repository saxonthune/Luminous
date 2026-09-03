import { For, Show, createEffect, createMemo, createSignal, on, type JSX, type Setter } from 'solid-js';
import { Portal } from 'solid-js/web';
import type { MerinoDocument, MerinoNode, MerinoNodeType, MerinoTab } from '@luminous/core/merino';
import { Canvas, MenuRoot, NodeContainer, useGesture } from '@luminous/cactus';
import type { CanvasRef, EdgeDeclaration, MenuSchema } from '@luminous/cactus';
import { tokenVar } from './projection.ts';
import { transientViewportOptions } from '../../canvas-tools/transientViewport.ts';

export const MERINO_OVERVIEW_ROOT_IDS = ['ui-transition-graph', 'resources-section'] as const;

const CARD_WIDTH = 288;
const DEFAULT_CARD_HEIGHT = 420;
const MIN_CARD_HEIGHT = 240;
const CARD_GAP_X = 56;
const HEADER_EDGE_Y = 36;
const OUT_CARD_WIDTH = 136;
const OUT_CARD_HEIGHT = 50;
const OUT_POSITION_SCALE = 0.4;

export type MerinoOverviewZoom = 'in' | 'out';

export interface MerinoOverviewCardState {
  id: string;
  parentId?: string;
  root: boolean;
  pinned: boolean;
  x: number;
  y: number;
  h: number;
}

export interface MerinoOverviewDisclosureState {
  cards: MerinoOverviewCardState[];
  activeChildByParent: Record<string, string>;
}

function cardNodeId(nodeId: string): string {
  return `merino-overview:${nodeId}`;
}

function childrenOf(doc: MerinoDocument, parentId: string): MerinoNode[] {
  return doc.nodes.filter((node) => node.parent === parentId);
}

export function initialCards(doc: MerinoDocument, tab: MerinoTab, rootIds: readonly string[]): MerinoOverviewCardState[] {
  const nodeById = new Map(doc.nodes.map((node) => [node.id, node]));
  return rootIds.flatMap((id, index) => {
    const root = nodeById.get(id);
    return root?.tab === tab
      ? [{ id, root: true, pinned: true, x: 48, y: 48 + index * (DEFAULT_CARD_HEIGHT + 48), h: DEFAULT_CARD_HEIGHT }]
      : [];
  });
}

function rootIdForCard(cardsById: ReadonlyMap<string, MerinoOverviewCardState>, card: MerinoOverviewCardState): string {
  let current = card;
  while (current.parentId) {
    const parent = cardsById.get(current.parentId);
    if (!parent) break;
    current = parent;
  }
  return current.id;
}

/** Reconcile a changed host-owned root list without disturbing retained root
 * cards or their open branches. Overview configuration is keyed by Node id. */
export function reconcileMerinoOverviewRoots(
  state: MerinoOverviewDisclosureState,
  doc: MerinoDocument,
  tab: MerinoTab,
  rootIds: readonly string[],
): MerinoOverviewDisclosureState {
  const nodeById = new Map(doc.nodes.map((node) => [node.id, node]));
  const validRootIds = rootIds.filter((id) => nodeById.get(id)?.tab === tab);
  const validRoots = new Set(validRootIds);
  const promotedCards = state.cards.map((card) => validRoots.has(card.id)
    ? { ...card, root: true, pinned: true, parentId: undefined }
    : card);
  const cardsById = new Map(promotedCards.map((card) => [card.id, card]));
  let cards = promotedCards.filter((card) => validRoots.has(rootIdForCard(cardsById, card)));
  for (const [index, id] of validRootIds.entries()) {
    if (cards.some((card) => card.id === id)) continue;
    cards = [...cards, {
      id,
      root: true,
      pinned: true,
      x: 48,
      y: 48 + index * (DEFAULT_CARD_HEIGHT + 48),
      h: DEFAULT_CARD_HEIGHT,
    }];
  }
  const visibleIds = new Set(cards.map((card) => card.id));
  const visibleCardsById = new Map(cards.map((card) => [card.id, card]));
  return {
    cards,
    activeChildByParent: Object.fromEntries(Object.entries(state.activeChildByParent)
      .filter(([parentId, childId]) => visibleIds.has(parentId)
        && visibleCardsById.get(childId)?.parentId === parentId)),
  };
}

function protectedCardIds(cards: readonly MerinoOverviewCardState[]): Set<string> {
  const cardById = new Map(cards.map((card) => [card.id, card]));
  const protectedIds = new Set<string>();
  for (const card of cards) {
    if (!card.pinned || card.root) continue;
    let current: MerinoOverviewCardState | undefined = card;
    while (current && !protectedIds.has(current.id)) {
      protectedIds.add(current.id);
      current = current.parentId ? cardById.get(current.parentId) : undefined;
    }
  }
  return protectedIds;
}

function isInCardBranch(
  cardsById: ReadonlyMap<string, MerinoOverviewCardState>,
  cardId: string,
  branchRootId: string,
): boolean {
  let current = cardsById.get(cardId);
  while (current) {
    if (current.id === branchRootId) return true;
    current = current.parentId ? cardsById.get(current.parentId) : undefined;
  }
  return false;
}

/** Replaces an unpinned branch while preserving pinned cards and the ancestor
 * chain needed to connect them. Newly opened cards start to their parent's right. */
export function openMerinoOverviewCard(
  state: MerinoOverviewDisclosureState,
  parentId: string,
  childId: string,
): MerinoOverviewDisclosureState {
  const parent = state.cards.find((card) => card.id === parentId);
  if (!parent) return state;

  let cards = state.cards;
  const previousChild = state.activeChildByParent[parentId];
  if (previousChild && previousChild !== childId) {
    const cardsById = new Map(cards.map((card) => [card.id, card]));
    const protectedIds = protectedCardIds(cards);
    cards = cards.filter((card) =>
      !isInCardBranch(cardsById, card.id, previousChild) || protectedIds.has(card.id),
    );
  }

  if (!cards.some((card) => card.id === childId)) {
    const siblingOffset = cards.filter((card) => card.parentId === parentId).length * 36;
    cards = [...cards, {
      id: childId,
      parentId,
      root: false,
      pinned: false,
      x: parent.x + CARD_WIDTH + CARD_GAP_X,
      y: parent.y + siblingOffset,
      h: DEFAULT_CARD_HEIGHT,
    }];
  }

  const visibleIds = new Set(cards.map((card) => card.id));
  const activeChildByParent = Object.fromEntries(
    Object.entries(state.activeChildByParent)
      .filter(([openParent, openChild]) => visibleIds.has(openParent) && visibleIds.has(openChild)),
  );
  activeChildByParent[parentId] = childId;
  return { cards, activeChildByParent };
}

/** Drop a Card and every Card disclosed beneath it — used when the Card's Node
 * is deleted, since deletion removes the Node's whole subtree. */
export function removeMerinoOverviewCardBranch(
  state: MerinoOverviewDisclosureState,
  cardId: string,
): MerinoOverviewDisclosureState {
  const removed = new Set<string>();
  const stack = [cardId];
  while (stack.length > 0) {
    const id = stack.pop()!;
    if (removed.has(id)) continue;
    removed.add(id);
    for (const card of state.cards) if (card.parentId === id) stack.push(card.id);
  }
  const cards = state.cards.filter((card) => !removed.has(card.id));
  const visibleIds = new Set(cards.map((card) => card.id));
  return {
    cards,
    activeChildByParent: Object.fromEntries(
      Object.entries(state.activeChildByParent)
        .filter(([parentId, childId]) => visibleIds.has(parentId) && visibleIds.has(childId)),
    ),
  };
}

export function toggleMerinoOverviewCardPin(
  state: MerinoOverviewDisclosureState,
  cardId: string,
): MerinoOverviewDisclosureState {
  const target = state.cards.find((card) => card.id === cardId);
  if (!target || target.root) return state;
  let cards = state.cards.map((card) => card.id === cardId ? { ...card, pinned: !card.pinned } : card);

  // An unpinned card that is no longer its parent's active disclosure closes
  // immediately; pinned descendants still protect the branch they require.
  if (target.pinned && target.parentId && state.activeChildByParent[target.parentId] !== cardId) {
    const cardsById = new Map(cards.map((card) => [card.id, card]));
    const protectedIds = protectedCardIds(cards);
    cards = cards.filter((card) =>
      !isInCardBranch(cardsById, card.id, cardId) || protectedIds.has(card.id),
    );
  }

  const visibleIds = new Set(cards.map((card) => card.id));
  return {
    cards,
    activeChildByParent: Object.fromEntries(
      Object.entries(state.activeChildByParent)
        .filter(([parentId, childId]) => visibleIds.has(parentId) && visibleIds.has(childId)),
    ),
  };
}

function TypeBadge(props: { node: MerinoNode; typeById: Map<string, MerinoNodeType> }): JSX.Element {
  const nodeType = () => props.typeById.get(props.node.type);
  return (
    <span
      class="inline-flex max-w-full items-center truncate rounded-full px-2 py-0.5 text-xs font-semibold text-on-accent"
      style={{ background: nodeType() ? tokenVar(nodeType()!.color) : 'var(--border)' }}
    >
      {nodeType()?.name ?? props.node.type}
    </span>
  );
}

/** The Card header title, editable in place. Double-click opens an input;
 * Enter or blur saves a non-empty change, Escape cancels. Mirrors the Edit
 * View's header-name editor. */
function EditableTitle(props: { name: string; class?: string; onRename: (name: string) => void }): JSX.Element {
  const [editing, setEditing] = createSignal(false);
  let input: HTMLInputElement | undefined;
  let cancelled = false;

  function start(): void {
    setEditing(true);
    queueMicrotask(() => { input?.focus(); input?.select(); });
  }
  function finish(value: string): void {
    setEditing(false);
    const next = value.trim();
    if (!cancelled && next && next !== props.name) props.onRename(next);
    cancelled = false;
  }

  return (
    <Show when={editing()} fallback={(
      <div class={props.class} title="Double-click to rename" on:dblclick={(event) => { event.stopPropagation(); start(); }}>
        {props.name}
      </div>
    )}>
      <input
        ref={input}
        class="block w-full rounded border border-border bg-canvas px-1 text-sm font-semibold text-fg outline-none focus:border-accent"
        aria-label={`Rename ${props.name}`}
        value={props.name}
        on:pointerdown={(event) => event.stopPropagation()}
        onBlur={(event) => finish(event.currentTarget.value)}
        onKeyDown={(event) => {
          event.stopPropagation();
          if (event.key === 'Enter') { event.preventDefault(); event.currentTarget.blur(); }
          else if (event.key === 'Escape') { event.preventDefault(); cancelled = true; event.currentTarget.blur(); }
        }}
      />
    </Show>
  );
}

/** The Card header Node Type control. The badge shows the current Type in its
 * Color; clicking it opens the shared cactus menu listing every Type with its
 * Color swatch. A Node that has children may only take a Container Type — the
 * other rows are shown disabled, matching the domain guard in
 * operations.setNode. */
function TypeMenu(props: {
  node: MerinoNode;
  nodeTypes: MerinoNodeType[];
  hasChildren: boolean;
  onSetType: (typeId: string) => void;
}): JSX.Element {
  const [open, setOpen] = createSignal(false);
  const [anchor, setAnchor] = createSignal({ x: 0, y: 0 });
  const current = () => props.nodeTypes.find((t) => t.id === props.node.type);
  const wouldOrphanChildren = (t: MerinoNodeType): boolean =>
    props.hasChildren && current()?.layout !== undefined && t.layout === undefined;

  const schema = (): MenuSchema => ({
    id: `merino-overview-type-${props.node.id}`,
    items: props.nodeTypes.map((t) => ({
      type: 'custom',
      id: t.id,
      render: () => {
        const disabled = wouldOrphanChildren(t);
        return (
          <button
            class="flex w-full items-center gap-2 rounded px-2 py-1 text-left text-xs text-fg hover:bg-surface-alt disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-transparent"
            disabled={disabled}
            title={disabled ? 'This Node has children; its Type must stay a Container' : undefined}
            onClick={() => { props.onSetType(t.id); setOpen(false); }}
          >
            <span class="h-2.5 w-2.5 flex-none rounded-full" style={{ background: tokenVar(t.color) }} />
            <span class="min-w-0 flex-1 truncate">{t.name}</span>
            <Show when={t.id === props.node.type}><span aria-hidden="true">✓</span></Show>
          </button>
        );
      },
    })),
  });

  return (
    <>
      <button
        class="mt-1 inline-flex max-w-full items-center gap-1 truncate rounded-full px-2 py-0.5 text-xs font-semibold text-on-accent"
        style={{ background: current() ? tokenVar(current()!.color) : 'var(--border)' }}
        aria-label={`Node Type for ${props.node.name}`}
        aria-haspopup="menu"
        on:pointerdown={(event) => event.stopPropagation()}
        onClick={(event) => {
          event.stopPropagation();
          const rect = event.currentTarget.getBoundingClientRect();
          setAnchor({ x: rect.left, y: rect.bottom + 2 });
          setOpen(true);
        }}
      >
        <span class="truncate">{current()?.name ?? props.node.type}</span>
        <span aria-hidden="true">▾</span>
      </button>
      <Show when={open()}>
        <Portal>
          <MenuRoot
            schema={schema()}
            open
            onOpenChange={setOpen}
            anchorX={anchor().x}
            anchorY={anchor().y}
          />
        </Portal>
      </Show>
    </>
  );
}

function OverviewDescription(props: { node: MerinoNode; onSetText: (text: string) => void }): JSX.Element {
  const [expanded, setExpanded] = createSignal(false);
  const [editing, setEditing] = createSignal(false);
  const [draft, setDraft] = createSignal('');
  let editor: HTMLTextAreaElement | undefined;
  let cancelOnBlur = false;
  const description = () => props.node.text?.trim() ?? '';
  const firstLine = () => description().split('\n')[0] || 'No description';

  function startEditing(): void {
    setDraft(props.node.text ?? '');
    setExpanded(true);
    setEditing(true);
    queueMicrotask(() => { editor?.focus(); editor?.select(); });
  }
  function commit(): void {
    setEditing(false);
    if (draft() !== (props.node.text ?? '')) props.onSetText(draft());
  }
  function cancel(): void {
    cancelOnBlur = true;
    setEditing(false);
    queueMicrotask(() => { cancelOnBlur = false; });
  }

  return (
    <div class="mt-1" on:pointerdown={(event) => event.stopPropagation()}>
      <Show when={editing()} fallback={(
        <button
          class="block w-full rounded px-1 py-1 text-left text-xs italic text-fg-muted hover:bg-surface hover:text-fg"
          title="Click to expand; double-click to edit"
          onClick={() => setExpanded((value) => !value)}
          onDblClick={(event) => { event.preventDefault(); startEditing(); }}
        >
          <span classList={{
            'block truncate': !expanded(),
            'block max-h-24 overflow-y-auto whitespace-pre-wrap': expanded(),
          }}>
            {expanded() ? description() || 'No description' : firstLine()}
          </span>
        </button>
      )}>
        <div class="py-1">
          <textarea
            ref={editor}
            class="block max-h-28 min-h-16 w-full resize-y rounded border border-border bg-canvas px-2 py-1.5 text-xs text-fg outline-none focus:border-accent"
            aria-label={`Description for ${props.node.name}`}
            value={draft()}
            onInput={(event) => setDraft(event.currentTarget.value)}
            onBlur={() => { if (!cancelOnBlur) commit(); }}
            onKeyDown={(event) => {
              if (event.key === 'Escape') { event.preventDefault(); cancel(); }
              else if (event.key === 'Enter' && (event.ctrlKey || event.metaKey)) {
                event.preventDefault(); event.currentTarget.blur();
              }
            }}
          />
          <div class="mt-1 text-[10px] text-fg-muted">Ctrl/Cmd+Enter saves · Escape cancels</div>
        </div>
      </Show>
    </div>
  );
}

function OverviewCardLayer(props: {
  doc: MerinoDocument;
  cards: () => MerinoOverviewCardState[];
  activeChildByParent: () => Record<string, string>;
  typeById: () => Map<string, MerinoNodeType>;
  nodeTypes: () => MerinoNodeType[];
  onOpenChild: (parentId: string, childId: string) => void;
  onMove: (cardId: string, dx: number, dy: number) => void;
  onResize: (cardId: string, height: number) => void;
  onTogglePin: (cardId: string) => void;
  onSetText: (nodeId: string, text: string) => void;
  onRename: (nodeId: string, name: string) => void;
  onSetType: (nodeId: string, typeId: string) => void;
  onAddChild: (parentId: string) => void;
}): JSX.Element {
  const nodeById = createMemo(() => new Map(props.doc.nodes.map((node) => [node.id, node])));
  const gesture = useGesture({
    zoomScale: () => 1,
    callbacks: {
      onDragEnd: (renderId, dx, dy) => props.onMove(renderId.replace('merino-overview:', ''), dx, dy),
    },
  });

  return (
    <For each={props.cards().map((card) => card.id)}>
      {(cardId) => {
        const card = () => props.cards().find((candidate) => candidate.id === cardId)!;
        const node = () => nodeById().get(cardId);
        const children = () => childrenOf(props.doc, cardId);
        const renderId = cardNodeId(cardId);
        const delta = () => gesture.isDraggingNode(renderId) ? gesture.dragDelta() : { dx: 0, dy: 0 };
        let resizeStartY = 0;
        let resizeStartHeight = 0;
        const beginResize = (event: PointerEvent): void => {
          event.preventDefault();
          event.stopPropagation();
          resizeStartY = event.clientY;
          resizeStartHeight = card().h;
          if (event.currentTarget instanceof HTMLElement) event.currentTarget.setPointerCapture(event.pointerId);
        };
        const continueResize = (event: PointerEvent): void => {
          if (!(event.currentTarget instanceof HTMLElement) || !event.currentTarget.hasPointerCapture(event.pointerId)) return;
          props.onResize(cardId, Math.max(MIN_CARD_HEIGHT, resizeStartHeight + event.clientY - resizeStartY));
        };
        return (
          <Show when={node()}>
            {(presentNode) => (
              <NodeContainer
                nodeId={renderId}
                x={() => card().x + delta().dx}
                y={() => card().y + delta().dy}
                w={() => CARD_WIDTH}
                h={() => card().h}
                visualBand={() => card().root ? 2 : 4}
              >
                <div class="relative flex h-full w-full flex-col overflow-hidden rounded-xl border border-border shadow-md"
                  classList={{ 'bg-surface': card().root, 'bg-surface-alt': !card().root }}>
                  <header
                    class="flex-none border-b border-border px-3 py-2"
                    classList={{ 'cursor-grab': !gesture.isDraggingNode(renderId), 'cursor-grabbing': gesture.isDraggingNode(renderId) }}
                    on:pointerdown={(event) => gesture.beginPress(renderId, event)}
                  >
                    <div class="flex items-start gap-2">
                      <div class="min-w-0 flex-1">
                        <EditableTitle
                          name={presentNode().name}
                          class="truncate rounded px-1 text-sm font-semibold text-fg hover:bg-surface"
                          onRename={(name) => props.onRename(cardId, name)}
                        />
                        <TypeMenu
                          node={presentNode()}
                          nodeTypes={props.nodeTypes()}
                          hasChildren={children().length > 0}
                          onSetType={(typeId) => props.onSetType(cardId, typeId)}
                        />
                      </div>
                      <Show when={!card().root}>
                        <button
                          class="flex-none rounded border border-border bg-surface px-2 py-1 text-xs hover:text-fg"
                          classList={{ 'text-accent': card().pinned, 'text-fg-muted': !card().pinned }}
                          aria-pressed={card().pinned}
                          title={card().pinned ? 'Unpin this card' : 'Keep this card open'}
                          on:pointerdown={(event) => event.stopPropagation()}
                          onClick={() => props.onTogglePin(cardId)}
                        >
                          {card().pinned ? 'Pinned' : 'Pin'}
                        </button>
                      </Show>
                    </div>
                    <Show when={!card().root}>
                      <OverviewDescription node={presentNode()} onSetText={(text) => props.onSetText(cardId, text)} />
                    </Show>
                    <div class="mt-1 text-xs text-fg-muted">
                      {children().length} {children().length === 1 ? 'child' : 'children'}
                    </div>
                  </header>

                  <div class="min-h-0 flex-1 overflow-y-auto p-2">
                    <Show when={props.typeById().get(presentNode().type)?.layout !== undefined}>
                      <button
                        class="mb-1.5 flex w-full items-center justify-center gap-1 rounded-md border border-dashed border-border px-3 py-2 text-xs font-semibold text-fg-muted hover:border-accent hover:text-fg"
                        on:pointerdown={(event) => event.stopPropagation()}
                        onClick={() => props.onAddChild(cardId)}
                      >
                        + Add child
                      </button>
                    </Show>
                    <Show when={children().length > 0} fallback={<div class="px-2 py-3 text-sm italic text-fg-muted">No children</div>}>
                      <div class="flex flex-col gap-1.5">
                        <For each={children()}>
                          {(child) => {
                            const childCount = () => childrenOf(props.doc, child.id).length;
                            const selected = () => props.activeChildByParent()[cardId] === child.id;
                            return (
                              // A row is a navigation target for another Node, and it holds a
                              // Type control that is itself a button — so the row is a div, not a
                              // nested button. Its own `data-container-id` routes a right-click to
                              // this row's Clone/Delete menu instead of the Card's menu.
                              <div
                                role="button"
                                tabindex={0}
                                class="group flex w-full items-center gap-2 rounded-md border bg-surface px-3 py-2 text-left transition-colors hover:border-border hover:bg-canvas"
                                classList={{ 'border-accent shadow-sm': selected(), 'border-transparent': !selected() }}
                                aria-pressed={selected()}
                                onClick={() => props.onOpenChild(cardId, child.id)}
                                onKeyDown={(event) => {
                                  if (event.key === 'Enter' || event.key === ' ') {
                                    event.preventDefault();
                                    props.onOpenChild(cardId, child.id);
                                  }
                                }}
                                data-container-id={`merino-overview-row:${child.id}`}
                              >
                                <span class="min-w-0 flex-1">
                                  <span class="block truncate text-sm font-semibold text-fg">{child.name}</span>
                                  <span class="mt-1 block">
                                    <TypeMenu
                                      node={child}
                                      nodeTypes={props.nodeTypes()}
                                      hasChildren={childCount() > 0}
                                      onSetType={(typeId) => props.onSetType(child.id, typeId)}
                                    />
                                  </span>
                                </span>
                                <span class="flex flex-none items-center gap-1 text-xs text-fg-muted">
                                  <Show when={childCount() > 0}>{childCount()}</Show>
                                  <span aria-hidden="true" class="text-base">›</span>
                                </span>
                              </div>
                            );
                          }}
                        </For>
                      </div>
                    </Show>
                  </div>
                  <div
                    class="absolute inset-x-0 bottom-0 h-2 cursor-ns-resize touch-none"
                    aria-label={`Resize ${presentNode().name} vertically`}
                    title="Drag to resize vertically"
                    on:pointerdown={beginResize}
                    on:pointermove={continueResize}
                    on:pointerup={(event) => {
                      if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
                    }}
                    on:pointercancel={(event) => {
                      if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
                    }}
                  />
                </div>
              </NodeContainer>
            )}
          </Show>
        );
      }}
    </For>
  );
}

function OverviewOutLayer(props: {
  doc: MerinoDocument;
  cards: () => MerinoOverviewCardState[];
  typeById: () => Map<string, MerinoNodeType>;
}): JSX.Element {
  const nodeById = createMemo(() => new Map(props.doc.nodes.map((node) => [node.id, node])));
  return (
    <For each={props.cards().map((card) => card.id)}>
      {(cardId) => {
        const card = () => props.cards().find((candidate) => candidate.id === cardId)!;
        const node = () => nodeById().get(cardId);
        return (
          <Show when={node()}>
            {(presentNode) => (
              <NodeContainer
                nodeId={`merino-overview-out:${cardId}`}
                x={() => card().x * OUT_POSITION_SCALE}
                y={() => card().y * OUT_POSITION_SCALE}
                w={() => OUT_CARD_WIDTH}
                h={() => OUT_CARD_HEIGHT}
                visualBand={() => 2}
              >
                <div class="pointer-events-none flex h-full w-full flex-col justify-center overflow-hidden rounded-md border border-border bg-surface px-2 shadow-sm">
                  <div class="truncate text-xs font-semibold text-fg">{presentNode().name}</div>
                  <div class="mt-0.5 truncate"><TypeBadge node={presentNode()} typeById={props.typeById()} /></div>
                </div>
              </NodeContainer>
            )}
          </Show>
        );
      }}
    </For>
  );
}

export function MerinoOverview(props: {
  doc: MerinoDocument;
  zoom: MerinoOverviewZoom;
  /** Stable identity of the open document, used only to retain the transient
   * Overview camera across a browser tab's life. */
  sourceId: string;
  /** The opened-Card state. It is owned by the host (MerinoCanvas), not this
   * component, so the opened Cards survive switching to the Edit View and back. */
  disclosure: () => MerinoOverviewDisclosureState;
  setDisclosure: Setter<MerinoOverviewDisclosureState>;
  onSetText: (nodeId: string, text: string) => void;
  onRename: (nodeId: string, name: string) => void;
  onSetType: (nodeId: string, typeId: string) => void;
  /** Append a child to a Container Card. Returns the new Node id, or undefined
   * when the write was refused. */
  onAddChild: (parentId: string) => string | undefined;
  /** Clone a Node as a sibling under the same parent. Returns the new Node id,
   * or undefined when the write was refused. */
  onClone: (nodeId: string) => string | undefined;
  /** Delete a Node and its whole subtree. */
  onDelete: (nodeId: string) => void;
}): JSX.Element {
  let canvasRef: CanvasRef | undefined;
  let viewportElement: HTMLDivElement | undefined;
  let previousZoom = props.zoom;
  const disclosure = (): MerinoOverviewDisclosureState => props.disclosure();
  const setDisclosure = (
    update: (prev: MerinoOverviewDisclosureState) => MerinoOverviewDisclosureState,
  ): void => { props.setDisclosure(update); };

  createEffect(on(
    () => props.zoom,
    (nextZoom) => {
      const previous = previousZoom;
      previousZoom = nextZoom;
      if (nextZoom === previous || !canvasRef || !viewportElement) return;
      const ratio = nextZoom === 'out' ? OUT_POSITION_SCALE : 1 / OUT_POSITION_SCALE;
      const current = canvasRef.getTransform();
      const bounds = viewportElement.getBoundingClientRect();
      const centerX = bounds.width / 2;
      const centerY = bounds.height / 2;
      canvasRef.setView({
        x: centerX - (centerX - current.x) * ratio,
        y: centerY - (centerY - current.y) * ratio,
        k: 1,
      }, false);
    },
    { defer: true },
  ));

  const typeById = createMemo(() => new Map(props.doc.nodeTypes.map((nodeType) => [nodeType.id, nodeType])));
  const edges = createMemo<EdgeDeclaration[]>(() => {
    const visibleIds = new Set(disclosure().cards.map((card) => card.id));
    return disclosure().cards.flatMap((card) => {
      if (!card.parentId || !visibleIds.has(card.parentId)) return [];
      const sourceId = cardNodeId(card.parentId);
      const targetId = cardNodeId(card.id);
      return [{
        id: `merino-overview-edge:${card.parentId}:${card.id}`,
        sourceId,
        targetId,
        styling: { colorToken: 'fg-muted', dash: 'dotted', curve: 'bezier', width: 1.5 },
        routeBuilder: (rects) => {
          const source = rects.get(sourceId);
          const target = rects.get(targetId);
          if (!source || !target) return null;
          return { points: [
            { x: source.x + source.w, y: source.y + HEADER_EDGE_Y },
            { x: target.x, y: target.y + HEADER_EDGE_Y },
          ] };
        },
      } satisfies EdgeDeclaration];
    });
  });

  const openChild = (parentId: string, childId: string) =>
    setDisclosure((state) => openMerinoOverviewCard(state, parentId, childId));
  const addChild = (parentId: string) => {
    const childId = props.onAddChild(parentId);
    if (childId !== undefined) setDisclosure((state) => openMerinoOverviewCard(state, parentId, childId));
  };
  const deleteCard = (nodeId: string) => {
    props.onDelete(nodeId);
    setDisclosure((state) => removeMerinoOverviewCardBranch(state, nodeId));
  };
  const cloneCard = (nodeId: string) => {
    const cloneId = props.onClone(nodeId);
    if (cloneId === undefined) return;
    const parentId = props.doc.nodes.find((candidate) => candidate.id === nodeId)?.parent;
    if (parentId !== undefined) setDisclosure((state) => openMerinoOverviewCard(state, parentId, cloneId));
  };

  // cactus resolves a right-click to the nearest `data-container-id` and asks
  // this callback for that element's menu. A Card wrapper carries
  // `merino-overview:<nodeId>`; a child-list row carries
  // `merino-overview-row:<nodeId>` (see OverviewCardLayer). A Card offers
  // Delete; a row offers Clone and Delete for the Node it points to.
  const cardContextMenu = (renderId: string): MenuSchema | undefined => {
    const rowPrefix = 'merino-overview-row:';
    const cardPrefix = 'merino-overview:';
    if (renderId.startsWith(rowPrefix)) {
      const nodeId = renderId.slice(rowPrefix.length);
      const node = props.doc.nodes.find((candidate) => candidate.id === nodeId);
      if (!node) return undefined;
      return {
        id: `merino-overview-row-${nodeId}`,
        items: [
          { type: 'action', action: { id: 'merino-overview.clone', label: `Clone node "${node.name}"`, payload: { id: nodeId } } },
          { type: 'divider' },
          { type: 'action', action: { id: 'merino-overview.delete', label: `Delete node "${node.name}"`, tone: 'danger', payload: { id: nodeId } } },
        ],
      };
    }
    if (!renderId.startsWith(cardPrefix)) return undefined;
    const nodeId = renderId.slice(cardPrefix.length);
    const node = props.doc.nodes.find((candidate) => candidate.id === nodeId);
    if (!node) return undefined;
    return {
      id: `merino-overview-card-${nodeId}`,
      items: [{
        type: 'action',
        action: { id: 'merino-overview.delete', label: `Delete node "${node.name}"`, tone: 'danger', payload: { id: nodeId } },
      }],
    };
  };
  const onCanvasAction = (actionId: string, payload?: unknown) => {
    const id = (payload as { id?: unknown } | undefined)?.id;
    if (typeof id !== 'string') return;
    if (actionId === 'merino-overview.delete') deleteCard(id);
    else if (actionId === 'merino-overview.clone') cloneCard(id);
  };
  const moveCard = (cardId: string, dx: number, dy: number) => setDisclosure((state) => ({
    ...state,
    cards: state.cards.map((card) => card.id === cardId ? { ...card, x: card.x + dx, y: card.y + dy } : card),
  }));
  const togglePin = (cardId: string) =>
    setDisclosure((state) => toggleMerinoOverviewCardPin(state, cardId));
  const resizeCard = (cardId: string, height: number) => setDisclosure((state) => ({
    ...state,
    cards: state.cards.map((card) => card.id === cardId ? { ...card, h: height } : card),
  }));

  return (
    <div ref={viewportElement} class="absolute inset-0 bg-canvas">
      <Show when={disclosure().cards.length > 0} fallback={<div class="p-6 text-sm text-fg-muted">This Tab has no configured Overview roots.</div>}>
        <Canvas
          ref={(ref) => { canvasRef = ref; }}
          class="h-full w-full"
          viewportOptions={{
            minZoom: 1,
            maxZoom: 1,
            ...transientViewportOptions(`luminous:merino:overview-viewport:${props.sourceId}`),
          }}
          edges={props.zoom === 'in' ? edges() : []}
          edgeEmphasis={{ dimUnselected: false }}
          nodeContextMenu={props.zoom === 'in' ? cardContextMenu : undefined}
          onAction={onCanvasAction}
        >
          <Show
            when={props.zoom === 'in'}
            fallback={(
              <OverviewOutLayer
                doc={props.doc}
                cards={() => disclosure().cards}
                typeById={typeById}
              />
            )}
          >
            <OverviewCardLayer
              doc={props.doc}
              cards={() => disclosure().cards}
              activeChildByParent={() => disclosure().activeChildByParent}
              typeById={typeById}
              nodeTypes={() => props.doc.nodeTypes}
              onOpenChild={openChild}
              onMove={moveCard}
              onResize={resizeCard}
              onTogglePin={togglePin}
              onSetText={props.onSetText}
              onRename={props.onRename}
              onSetType={props.onSetType}
              onAddChild={addChild}
            />
          </Show>
        </Canvas>
      </Show>
    </div>
  );
}
