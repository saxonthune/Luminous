import { createSignal, createMemo, onMount, onCleanup, Show, For } from 'solid-js';
import { createStore, produce, reconcile, type SetStoreFunction } from 'solid-js/store';
import {
  Canvas,
  useNodeDrag,
  useNodeResize,
  useCanvasContext,
  forceDirectedLayout,
  treeLayout,
  type CanvasRef,
  type ResizeDirection,
} from '@luminous/cactus';
import { getDocument, postAction, type Document, type Note, type Node, type NoteNode as NoteNodeType, type PortalNode as PortalNodeType } from './api';
import { NoteNode } from './NoteNode';
import { PortalNode } from './PortalNode';
import { FreeformEdge } from './FreeformEdge';
import { CanvasToolbar } from './CanvasToolbar';
import { theme, toggleTheme } from './theme';

interface CanvasViewProps {
  documentPath: string;
  onBack: () => void;
}

function getAbsolutePos(
  noteId: string,
  notes: Record<string, Note>
): { x: number; y: number } {
  const note = notes[noteId];
  if (!note) return { x: 0, y: 0 };
  if (!note.parentId) return { x: note.x, y: note.y };
  const parentAbs = getAbsolutePos(note.parentId, notes);
  return { x: parentAbs.x + note.x, y: parentAbs.y + note.y };
}

function findDropTarget(screenX: number, screenY: number, excludeId: string): string | null {
  const elements = document.elementsFromPoint(screenX, screenY);
  for (const el of elements) {
    if (el.getAttribute('data-drop-target') === 'true') {
      const containerId = el.getAttribute('data-container-id');
      if (containerId && containerId !== excludeId) return containerId;
    }
  }
  return null;
}

// ---------------------------------------------------------------------------
// CanvasContent — rendered inside <Canvas>, can use useCanvasContext()
// ---------------------------------------------------------------------------

interface CanvasContentProps {
  doc: Document;
  setDoc: SetStoreFunction<{ current: Document | null }>;
  documentPath: string;
  loadDoc: () => void;
  onClearSelectionReady: (fn: () => void) => void;
  onCreateNoteReady: (fn: () => void) => void;
  mergedNotes: () => Record<string, Note>;
  setLive: SetStoreFunction<{
    positions: Record<string, { x: number; y: number }>;
    sizes: Record<string, { w: number; h: number }>;
  }>;
}

function CanvasContent(props: CanvasContentProps) {
  const {
    transform,
    ctrlHeld,
    clearSelection,
    isSelected,
    onNodePointerDown,
    selectedIds,
    screenToCanvas,
  } = useCanvasContext();

  props.onClearSelectionReady(clearSelection);

  props.onCreateNoteReady(() => {
    const center = screenToCanvas(window.innerWidth / 2, window.innerHeight / 2);
    const x = Math.round(center.x - 100);
    const y = Math.round(center.y - 75);

    const tempId = `temp-${Date.now()}`;
    const newNote: Note = { id: tempId, type: 'note', title: 'New Note', body: '', parentId: null, x, y, w: 200, h: 150 };

    props.setDoc('current', produce((d) => {
      if (d) d.notes[tempId] = newNote;
    }));

    postAction('note/create', { path: props.documentPath, title: 'New Note', x, y, w: 200, h: 150 })
      .then((result) => {
        if (result.ok && result.id) {
          props.setDoc('current', produce((d) => {
            if (!d) return;
            const temp = d.notes[tempId];
            delete d.notes[tempId];
            d.notes[result.id!] = { ...temp, id: result.id! };
          }));
        } else {
          props.setDoc('current', produce((d) => {
            if (!d) return;
            delete d.notes[tempId];
          }));
        }
      })
      .catch(() => props.loadDoc());
  });

  // Live tracking state
  const livePositionMap = new Map<string, { x: number; y: number }>();
  const liveSizeMap = new Map<string, { w: number; h: number }>();
  const dragBaseMap = new Map<string, { x: number; y: number }>();
  const resizeBaseMap = new Map<string, { w: number; h: number }>();
  let lastPointer = { x: 0, y: 0 };

  onMount(() => {
    const handler = (e: PointerEvent) => {
      lastPointer = { x: e.clientX, y: e.clientY };
    };
    window.addEventListener('pointermove', handler);
    onCleanup(() => window.removeEventListener('pointermove', handler));
  });

  const deleteNotes = (toDelete: string[]) => {
    if (toDelete.length === 0) return;

    props.setDoc('current', produce((d) => {
      if (!d) return;
      for (const id of toDelete) {
        delete d.notes[id];
        for (const edgeId of Object.keys(d.edges)) {
          if (d.edges[edgeId].fromId === id || d.edges[edgeId].toId === id) delete d.edges[edgeId];
        }
        for (const note of Object.values(d.notes)) {
          if (note.parentId === id) note.parentId = null;
        }
      }
    }));

    Promise.all(
      toDelete.map((id) => postAction('note/delete', { path: props.documentPath, id }))
    ).catch(() => props.loadDoc());
  };

  // Delete key handler
  onMount(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key !== 'Delete' && e.key !== 'Backspace') return;
      // Don't delete nodes when user is editing text
      const active = document.activeElement;
      if (active && (active.tagName === 'INPUT' || active.tagName === 'TEXTAREA' || (active as HTMLElement).closest?.('.cm-editor'))) return;
      const ids = selectedIds();
      if (ids.length === 0) return;
      const toDelete = [...ids];
      clearSelection();
      deleteNotes(toDelete);
    };
    window.addEventListener('keydown', handler);
    onCleanup(() => window.removeEventListener('keydown', handler));
  });

  // Drag callbacks
  const dragCallbacks = {
    onDragStart(nodeId: string) {
      const note = props.doc.notes[nodeId];
      if (note) dragBaseMap.set(nodeId, { x: note.x, y: note.y });
    },
    onDrag(nodeId: string, dx: number, dy: number) {
      const base = dragBaseMap.get(nodeId);
      if (!base) return;
      const pos = { x: base.x + dx, y: base.y + dy };
      livePositionMap.set(nodeId, pos);
      props.setLive('positions', nodeId, pos);
    },
    onDragEnd(nodeId: string) {
      const livePos = livePositionMap.get(nodeId);
      const note = props.doc.notes[nodeId];
      if (!note) return;

      const finalLocalPos = livePos ?? { x: note.x, y: note.y };
      const parentAbsPos = note.parentId
        ? getAbsolutePos(note.parentId, props.doc.notes)
        : { x: 0, y: 0 };
      const finalAbsPos = note.parentId
        ? { x: parentAbsPos.x + finalLocalPos.x, y: parentAbsPos.y + finalLocalPos.y }
        : finalLocalPos;

      livePositionMap.delete(nodeId);
      dragBaseMap.delete(nodeId);
      props.setLive(produce((s) => { delete s.positions[nodeId]; }));

      if (ctrlHeld()) {
        const pointer = lastPointer;
        const dropTargetId = findDropTarget(pointer.x, pointer.y, nodeId);

        if (dropTargetId && dropTargetId !== note.parentId) {
          const targetAbsPos = getAbsolutePos(dropTargetId, props.doc.notes);
          const relPos = { x: finalAbsPos.x - targetAbsPos.x, y: finalAbsPos.y - targetAbsPos.y };

          props.setDoc('current', produce((d) => {
            if (!d) return;
            d.notes[nodeId].parentId = dropTargetId;
            d.notes[nodeId].x = relPos.x;
            d.notes[nodeId].y = relPos.y;
          }));
          Promise.all([
            postAction('nest', { path: props.documentPath, parentId: dropTargetId, childId: nodeId }),
            postAction('node/move', { path: props.documentPath, id: nodeId, x: relPos.x, y: relPos.y }),
          ]).catch(() => props.loadDoc());
        } else if (!dropTargetId && note.parentId) {
          props.setDoc('current', produce((d) => {
            if (!d) return;
            d.notes[nodeId].parentId = null;
            d.notes[nodeId].x = finalAbsPos.x;
            d.notes[nodeId].y = finalAbsPos.y;
          }));
          Promise.all([
            postAction('unnest', { path: props.documentPath, childId: nodeId }),
            postAction('node/move', { path: props.documentPath, id: nodeId, x: finalAbsPos.x, y: finalAbsPos.y }),
          ]).catch(() => props.loadDoc());
        } else {
          props.setDoc('current', produce((d) => {
            if (!d) return;
            d.notes[nodeId].x = finalLocalPos.x;
            d.notes[nodeId].y = finalLocalPos.y;
          }));
          postAction('node/move', { path: props.documentPath, id: nodeId, x: finalLocalPos.x, y: finalLocalPos.y }).catch(() => props.loadDoc());
        }
      } else {
        props.setDoc('current', produce((d) => {
          if (!d) return;
          d.notes[nodeId].x = finalLocalPos.x;
          d.notes[nodeId].y = finalLocalPos.y;
        }));
        postAction('node/move', { path: props.documentPath, id: nodeId, x: finalLocalPos.x, y: finalLocalPos.y }).catch(() => props.loadDoc());
      }
    },
  };

  const { onPointerDown: onDragPointerDown } = useNodeDrag({
    zoomScale: () => transform().k,
    handleSelector: '[data-drag-handle]',
    callbacks: dragCallbacks,
  });

  const resizeCallbacks = {
    onResizeStart(nodeId: string) {
      const note = props.doc.notes[nodeId];
      if (note) resizeBaseMap.set(nodeId, { w: note.w, h: note.h });
    },
    onResize(nodeId: string, dw: number, dh: number) {
      const base = resizeBaseMap.get(nodeId);
      if (!base) return;
      const size = { w: Math.max(120, base.w + dw), h: Math.max(80, base.h + dh) };
      liveSizeMap.set(nodeId, size);
      props.setLive('sizes', nodeId, size);
    },
    onResizeEnd(nodeId: string) {
      const liveSize = liveSizeMap.get(nodeId);
      const note = props.doc.notes[nodeId];
      if (!note) return;
      const finalSize = liveSize ?? { w: note.w, h: note.h };
      liveSizeMap.delete(nodeId);
      resizeBaseMap.delete(nodeId);
      props.setLive(produce((s) => { delete s.sizes[nodeId]; }));
      props.setDoc('current', produce((d) => {
        if (!d) return;
        d.notes[nodeId].w = finalSize.w;
        d.notes[nodeId].h = finalSize.h;
      }));
      postAction('node/resize', { path: props.documentPath, id: nodeId, w: finalSize.w, h: finalSize.h }).catch(() => props.loadDoc());
    },
  };

  const { onResizePointerDown } = useNodeResize({
    zoomScale: () => transform().k,
    callbacks: resizeCallbacks,
  });

  const handleUpdateTitle = (id: string, title: string) => {
    props.setDoc('current', produce((d) => {
      if (d) d.notes[id].title = title;
    }));
    postAction('note/update', { path: props.documentPath, id, title }).catch(() => props.loadDoc());
  };

  const handleUpdateBody = (id: string, body: string) => {
    props.setDoc('current', produce((d) => {
      if (d) (d.notes[id] as any).body = body;
    }));
    postAction('note/update', { path: props.documentPath, id, body }).catch(() => props.loadDoc());
  };

  const autoResizeParent = (parentId: string) => {
    const parent = props.doc.notes[parentId];
    if (!parent) return;
    const children = Object.values(props.doc.notes).filter((n) => n.parentId === parentId);
    if (children.length === 0) return;
    const headerHeight = 80;
    const padding = 10;
    let maxRight = parent.w;
    let maxBottom = headerHeight;
    for (const child of children) {
      maxRight = Math.max(maxRight, child.x + child.w + padding);
      maxBottom = Math.max(maxBottom, child.y + child.h + padding);
    }
    const newW = Math.max(parent.w, maxRight);
    const newH = Math.max(parent.h, maxBottom);
    if (newW !== parent.w || newH !== parent.h) {
      props.setDoc('current', produce((d) => {
        if (!d) return;
        d.notes[parentId].w = newW;
        d.notes[parentId].h = newH;
      }));
      postAction('node/resize', { path: props.documentPath, id: parentId, w: newW, h: newH }).catch(() => props.loadDoc());
    }
  };

  const handleExtract = (parentNoteId: string, selectedText: string, selectionFrom: number, selectionTo: number) => {
    const parentNote = props.doc.notes[parentNoteId];
    if (!parentNote) return;
    const firstLine = selectedText.split('\n')[0];
    const colonIdx = firstLine.indexOf(':');
    let title = colonIdx > 0 ? firstLine.slice(0, colonIdx).trim() : firstLine.trim();
    if (title.length > 40) title = title.slice(0, 40) + '\u2026';
    if (!title) title = 'Untitled';
    const body = colonIdx > 0 ? selectedText.slice(colonIdx + 1).trim() : '';
    const existingChildren = Object.values(props.doc.notes).filter((n) => n.parentId === parentNoteId);
    const childX = 10;
    const childY = 80 + existingChildren.length * 40;
    const childW = Math.max(parentNote.w - 20, 120);
    const childH = 100;
    const tempId = `temp-${Date.now()}`;

    props.setDoc('current', produce((d) => {
      if (!d) return;
      const newChild: Note = { id: tempId, type: 'note', title, body, parentId: parentNoteId, x: childX, y: childY, w: childW, h: childH };
      const parentBody = (d.notes[parentNoteId] as any).body as string;
      const updatedParentBody = parentBody.slice(0, selectionFrom) + parentBody.slice(selectionTo);
      d.notes[tempId] = newChild;
      (d.notes[parentNoteId] as any).body = updatedParentBody;
    }));

    postAction('note/create', { path: props.documentPath, title, body, x: childX, y: childY, w: childW, h: childH })
      .then((result) => {
        if (!result.ok || !result.id) throw new Error('create failed');
        const realId = result.id;
        const updatedParentBody = (props.doc.notes[parentNoteId] as any).body as string;
        return Promise.all([
          postAction('nest', { path: props.documentPath, parentId: parentNoteId, childId: realId }),
          postAction('node/move', { path: props.documentPath, id: realId, x: childX, y: childY }),
          postAction('note/update', { path: props.documentPath, id: parentNoteId, body: updatedParentBody }),
        ]).then(() => realId);
      })
      .then((realId) => {
        props.setDoc('current', produce((d) => {
          if (!d) return;
          const tempNote = d.notes[tempId];
          delete d.notes[tempId];
          d.notes[realId] = { ...tempNote, id: realId };
        }));
        autoResizeParent(parentNoteId);
      })
      .catch(() => props.loadDoc());
  };

  const handleDeleteNote = (noteId: string) => deleteNotes([noteId]);

  // Build children map
  const childrenMap = () => {
    const map: Record<string, Node[]> = {};
    for (const note of Object.values(props.doc.notes)) {
      if (note.parentId) {
        if (!map[note.parentId]) map[note.parentId] = [];
        map[note.parentId].push(note);
      }
    }
    return map;
  };

  function renderNote(note: Node): any {
    const nestedChildren = childrenMap()[note.id] ?? [];

    if (note.type === 'portal') {
      return (
        <PortalNode
          node={note as PortalNodeType}
          mergedNotes={props.mergedNotes}
          onDragPointerDown={onDragPointerDown}
          onResizePointerDown={onResizePointerDown}
          onDelete={handleDeleteNote}
        >
          <For each={nestedChildren}>
            {(child) => renderNote(child)}
          </For>
        </PortalNode>
      );
    }

    return (
      <NoteNode
        note={note as NoteNodeType}
        mergedNotes={props.mergedNotes}
        onDragPointerDown={onDragPointerDown}
        onResizePointerDown={onResizePointerDown}
        onUpdateTitle={handleUpdateTitle}
        onUpdateBody={handleUpdateBody}
        onDelete={handleDeleteNote}
        onExtract={handleExtract}
      >
        <For each={nestedChildren}>
          {(child) => renderNote(child)}
        </For>
      </NoteNode>
    );
  }

  const topLevelNotes = () => Object.values(props.doc.notes).filter((n) => !n.parentId);

  return (
    <For each={topLevelNotes()}>
      {(note) => renderNote(note)}
    </For>
  );
}

// ---------------------------------------------------------------------------
// CanvasView — outer component
// ---------------------------------------------------------------------------

export function CanvasView(props: CanvasViewProps) {
  const [doc, setDoc] = createStore<{ current: Document | null }>({ current: null });
  const [live, setLive] = createStore<{
    positions: Record<string, { x: number; y: number }>;
    sizes: Record<string, { w: number; h: number }>;
  }>({ positions: {}, sizes: {} });
  const [loading, setLoading] = createSignal(true);
  const [error, setError] = createSignal<string | null>(null);

  const mergedNotes = createMemo(() => {
    const d = doc.current;
    if (!d) return {} as Record<string, Note>;
    const notes: Record<string, Note> = {};
    for (const [id, note] of Object.entries(d.notes)) {
      const livePos = live.positions[id];
      const liveSize = live.sizes[id];
      if (livePos || liveSize) {
        notes[id] = { ...note, ...livePos, ...liveSize };
      } else {
        notes[id] = note;
      }
    }
    return notes;
  });

  let clearSelectionFn: () => void = () => {};
  let createNoteFn: () => void = () => {};
  let canvasRef: CanvasRef | undefined;

  let loadDocTimer: ReturnType<typeof setTimeout> | null = null;
  const loadDoc = () => {
    // Debounce: coalesce rapid calls (e.g. fs.watch firing multiple times)
    if (loadDocTimer !== null) return;
    const isInitial = !doc.current;
    if (isInitial) setLoading(true);
    setError(null);
    // For initial load, fire immediately. For subsequent, debounce 300ms.
    const delay = isInitial ? 0 : 300;
    loadDocTimer = setTimeout(() => {
      loadDocTimer = null;
      getDocument(props.documentPath)
        .then((d) => {
          setDoc('current', reconcile(d));
          if (isInitial) setLoading(false);
        })
        .catch((err) => {
          console.error('[CanvasView] failed to load document:', props.documentPath, err);
          if (isInitial) {
            setError('Failed to load document');
            setLoading(false);
          }
        });
    }, delay);
  };

  onMount(() => {
    loadDoc();

    // WebSocket watch — reload when an external process edits this file
    const wsUrl = `ws://${location.host}/ws/watch`;
    let ws: WebSocket;
    let reconnectTimer: ReturnType<typeof setTimeout> | null = null;

    function connect() {
      ws = new WebSocket(wsUrl);
      ws.onmessage = (e) => {
        try {
          const data = JSON.parse(e.data as string);
          if (data.event === 'changed' && data.path === props.documentPath) {
            loadDoc();
          }
        } catch {
          // ignore malformed frames
        }
      };
      ws.onclose = () => {
        reconnectTimer = setTimeout(connect, 2000);
      };
    }
    connect();

    onCleanup(() => {
      if (reconnectTimer !== null) clearTimeout(reconnectTimer);
      if (loadDocTimer !== null) clearTimeout(loadDocTimer);
      ws?.close();
    });
  });

  const handleConnect = ({ source, target }: { source: string; target: string }) => {
    if (source === target) return;
    const tempId = `edge-temp-${Date.now()}`;
    setDoc('current', produce((d) => {
      if (!d) return;
      d.edges[tempId] = { id: tempId, fromId: source, toId: target, label: null };
    }));
    postAction('edge/connect', { path: props.documentPath, fromId: source, toId: target })
      .then((result) => { if (result.ok) loadDoc(); })
      .catch(() => loadDoc());
  };

  const handleUpdateEdgeLabel = (edgeId: string, label: string | null) => {
    setDoc('current', produce((d) => {
      if (!d) return;
      d.edges[edgeId].label = label;
    }));
    postAction('edge/relabel', { path: props.documentPath, id: edgeId, label }).catch(() => loadDoc());
  };

  const edgeList = createMemo(() => {
    const d = doc.current;
    return d ? Object.values(d.edges) : [];
  });

  const renderEdges = () => {
    return (
      <For each={edgeList()}>
        {(edge) => (
          <FreeformEdge
            edge={edge}
            notes={mergedNotes()}
            onUpdateLabel={handleUpdateEdgeLabel}
          />
        )}
      </For>
    );
  };

  const getNodeRects = () => {
    const d = doc.current;
    if (!d) return [];
    return Object.values(d.notes)
      .filter((n) => !n.parentId)
      .map((n) => ({ id: n.id, x: n.x, y: n.y, width: n.w, height: n.h }));
  };

  const arrangeForceLayout = () => {
    const d = doc.current;
    if (!d) return;

    const layoutNodes = Object.values(d.notes)
      .filter((n) => !n.parentId)
      .map((n) => ({ id: n.id, x: n.x, y: n.y, width: n.w, height: n.h }));

    const layoutEdges = Object.values(d.edges).map((e) => ({ source: e.fromId, target: e.toId }));

    const result = forceDirectedLayout(layoutNodes, layoutEdges);

    for (const [id, pos] of result) {
      setDoc('current', produce((d) => {
        if (!d) return;
        d.notes[id].x = pos.x;
        d.notes[id].y = pos.y;
      }));
      postAction('node/move', { path: props.documentPath, id, x: pos.x, y: pos.y }).catch(() => loadDoc());
    }
  };

  const arrangeTreeLayout = () => {
    const d = doc.current;
    if (!d) return;

    const layoutNodes = Object.values(d.notes)
      .filter((n) => !n.parentId)
      .map((n) => ({ id: n.id, x: n.x, y: n.y, width: n.w, height: n.h }));

    const layoutEdges = Object.values(d.edges).map((e) => ({ source: e.fromId, target: e.toId }));

    const result = treeLayout(layoutNodes, layoutEdges);

    for (const [id, pos] of result) {
      setDoc('current', produce((d) => {
        if (!d) return;
        d.notes[id].x = pos.x;
        d.notes[id].y = pos.y;
      }));
      postAction('node/move', { path: props.documentPath, id, x: pos.x, y: pos.y }).catch(() => loadDoc());
    }
  };

  return (
    <div class="flex h-screen flex-col" style={{ background: 'var(--bg-canvas)' }}>
      <div class="flex items-center gap-3 border-b border-[var(--border-default)] bg-[var(--bg-surface)] px-4 py-2 shrink-0">
        <button
          onClick={props.onBack}
          class="rounded-md border border-[var(--border-default)] px-3 py-1 text-sm font-medium text-[var(--text-primary)] hover:bg-[var(--bg-surface-alt)]"
        >
          ← Back
        </button>
        <span class="text-sm text-[var(--text-secondary)]">{props.documentPath}</span>
        <div class="flex-1" />
        <button
          onClick={toggleTheme}
          class="rounded-md border border-[var(--border-default)] px-3 py-1 text-sm font-medium text-[var(--text-primary)] hover:bg-[var(--bg-surface-alt)]"
        >
          {theme() === 'light' ? '☀' : '☾'}
        </button>
        <button
          onClick={() => createNoteFn()}
          class="rounded-md bg-[var(--color-accent)] px-3 py-1 text-sm font-medium text-[var(--text-on-accent)] hover:bg-[var(--color-accent-hover)]"
        >
          + New Note
        </button>
      </div>

      <div class="flex-1 overflow-hidden relative">
        <Show when={loading()}>
          <div class="flex h-full items-center justify-center text-sm text-[var(--text-secondary)]">
            Loading…
          </div>
        </Show>
        <Show when={error()}>
          <div class="flex h-full items-center justify-center text-sm text-red-500">
            {error()}
          </div>
        </Show>
        <Show when={!loading() && !error() && doc.current}>
          {(currentDoc) => (
            <>
              <Canvas
                ref={(ref) => { canvasRef = ref; }}
                class="w-full h-full"
                connectionDrag={{ onConnect: handleConnect }}
                renderEdges={renderEdges}
                renderConnectionPreview={(coords) => (
                  <line
                    x1={coords.startX} y1={coords.startY}
                    x2={coords.currentX} y2={coords.currentY}
                    stroke="var(--color-edge)" stroke-width={2}
                    stroke-dasharray="6 3" stroke-linecap="round"
                  />
                )}
                boxSelect={{ getNodeRects }}
                onBackgroundPointerDown={() => clearSelectionFn()}
              >
                <CanvasContent
                  doc={currentDoc()}
                  setDoc={setDoc}
                  documentPath={props.documentPath}
                  loadDoc={loadDoc}
                  onClearSelectionReady={(fn) => (clearSelectionFn = fn)}
                  onCreateNoteReady={(fn) => (createNoteFn = fn)}
                  mergedNotes={mergedNotes}
                  setLive={setLive}
                />
              </Canvas>
              <CanvasToolbar
                onZoomIn={() => canvasRef?.zoomIn()}
                onZoomOut={() => canvasRef?.zoomOut()}
                onFitView={() => canvasRef?.fitView(getNodeRects())}
                onTreeLayout={arrangeTreeLayout}
                onForceLayout={arrangeForceLayout}
              />
            </>
          )}
        </Show>
      </div>
    </div>
  );
}
