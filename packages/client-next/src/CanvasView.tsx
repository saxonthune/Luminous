import { createSignal, createEffect, createMemo, onMount, onCleanup, Show, For } from 'solid-js';
import {
  Canvas,
  useNodeDrag,
  useNodeResize,
  useCanvasContext,
  forceDirectedLayout,
  type CanvasRef,
  type ResizeDirection,
} from '@luminous/cactus';
import { getDocument, postAction, type Document, type Note } from './api';
import { NoteNode } from './NoteNode';
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
  setDoc: (fn: (prev: Document | null) => Document | null) => void;
  documentPath: string;
  loadDoc: () => void;
  onClearSelectionReady: (fn: () => void) => void;
  onCreateNoteReady: (fn: () => void) => void;
  mergedNotes: () => Record<string, Note>;
  setLivePositions: (fn: (prev: Map<string, { x: number; y: number }>) => Map<string, { x: number; y: number }>) => void;
  setLiveSizes: (fn: (prev: Map<string, { w: number; h: number }>) => Map<string, { w: number; h: number }>) => void;
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
    const newNote: Note = { id: tempId, title: 'New Note', body: '', parentId: null, x, y, w: 200, h: 150 };

    props.setDoc((prev) =>
      prev ? { ...prev, notes: { ...prev.notes, [tempId]: newNote } } : prev
    );

    postAction('note/create', { path: props.documentPath, title: 'New Note', x, y, w: 200, h: 150 })
      .then((result) => {
        if (result.ok && result.id) {
          props.setDoc((prev) => {
            if (!prev) return prev;
            const { [tempId]: _, ...rest } = prev.notes;
            return { ...prev, notes: { ...rest, [result.id!]: { ...newNote, id: result.id! } } };
          });
        } else {
          props.setDoc((prev) => {
            if (!prev) return prev;
            const { [tempId]: _, ...rest } = prev.notes;
            return { ...prev, notes: rest };
          });
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

    props.setDoc((prev) => {
      if (!prev) return prev;
      const notes = { ...prev.notes };
      const edges = { ...prev.edges };
      for (const id of toDelete) {
        delete notes[id];
        for (const edgeId of Object.keys(edges)) {
          if (edges[edgeId].fromId === id || edges[edgeId].toId === id) delete edges[edgeId];
        }
        for (const note of Object.values(notes)) {
          if (note.parentId === id) notes[note.id] = { ...note, parentId: null };
        }
      }
      return { ...prev, notes, edges };
    });

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
      props.setLivePositions((prev) => new Map(prev).set(nodeId, pos));
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
      props.setLivePositions((prev) => {
        const next = new Map(prev);
        next.delete(nodeId);
        return next;
      });

      if (ctrlHeld()) {
        const pointer = lastPointer;
        const dropTargetId = findDropTarget(pointer.x, pointer.y, nodeId);

        if (dropTargetId && dropTargetId !== note.parentId) {
          const targetAbsPos = getAbsolutePos(dropTargetId, props.doc.notes);
          const relPos = { x: finalAbsPos.x - targetAbsPos.x, y: finalAbsPos.y - targetAbsPos.y };

          props.setDoc((prev) =>
            prev
              ? { ...prev, notes: { ...prev.notes, [nodeId]: { ...prev.notes[nodeId], parentId: dropTargetId, x: relPos.x, y: relPos.y } } }
              : prev
          );
          Promise.all([
            postAction('nest', { path: props.documentPath, parentId: dropTargetId, childId: nodeId }),
            postAction('node/move', { path: props.documentPath, id: nodeId, x: relPos.x, y: relPos.y }),
          ]).catch(() => props.loadDoc());
        } else if (!dropTargetId && note.parentId) {
          props.setDoc((prev) =>
            prev
              ? { ...prev, notes: { ...prev.notes, [nodeId]: { ...prev.notes[nodeId], parentId: null, x: finalAbsPos.x, y: finalAbsPos.y } } }
              : prev
          );
          Promise.all([
            postAction('unnest', { path: props.documentPath, childId: nodeId }),
            postAction('node/move', { path: props.documentPath, id: nodeId, x: finalAbsPos.x, y: finalAbsPos.y }),
          ]).catch(() => props.loadDoc());
        } else {
          props.setDoc((prev) =>
            prev
              ? { ...prev, notes: { ...prev.notes, [nodeId]: { ...prev.notes[nodeId], x: finalLocalPos.x, y: finalLocalPos.y } } }
              : prev
          );
          postAction('node/move', { path: props.documentPath, id: nodeId, x: finalLocalPos.x, y: finalLocalPos.y }).catch(() => props.loadDoc());
        }
      } else {
        props.setDoc((prev) =>
          prev
            ? { ...prev, notes: { ...prev.notes, [nodeId]: { ...prev.notes[nodeId], x: finalLocalPos.x, y: finalLocalPos.y } } }
            : prev
        );
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
      props.setLiveSizes((prev) => new Map(prev).set(nodeId, size));
    },
    onResizeEnd(nodeId: string) {
      const liveSize = liveSizeMap.get(nodeId);
      const note = props.doc.notes[nodeId];
      if (!note) return;
      const finalSize = liveSize ?? { w: note.w, h: note.h };
      liveSizeMap.delete(nodeId);
      resizeBaseMap.delete(nodeId);
      props.setLiveSizes((prev) => {
        const next = new Map(prev);
        next.delete(nodeId);
        return next;
      });
      props.setDoc((prev) =>
        prev
          ? { ...prev, notes: { ...prev.notes, [nodeId]: { ...prev.notes[nodeId], w: finalSize.w, h: finalSize.h } } }
          : prev
      );
      postAction('node/resize', { path: props.documentPath, id: nodeId, w: finalSize.w, h: finalSize.h }).catch(() => props.loadDoc());
    },
  };

  const { onResizePointerDown } = useNodeResize({
    zoomScale: () => transform().k,
    callbacks: resizeCallbacks,
  });

  const handleUpdateTitle = (id: string, title: string) => {
    props.setDoc((prev) =>
      prev ? { ...prev, notes: { ...prev.notes, [id]: { ...prev.notes[id], title } } } : prev
    );
    postAction('note/update', { path: props.documentPath, id, title }).catch(() => props.loadDoc());
  };

  const handleUpdateBody = (id: string, body: string) => {
    props.setDoc((prev) =>
      prev ? { ...prev, notes: { ...prev.notes, [id]: { ...prev.notes[id], body } } } : prev
    );
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
      props.setDoc((prev) => {
        if (!prev) return prev;
        return { ...prev, notes: { ...prev.notes, [parentId]: { ...prev.notes[parentId], w: newW, h: newH } } };
      });
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

    props.setDoc((prev) => {
      if (!prev) return prev;
      const newChild: Note = { id: tempId, title, body, parentId: parentNoteId, x: childX, y: childY, w: childW, h: childH };
      const parentBody = prev.notes[parentNoteId].body;
      const updatedParentBody = parentBody.slice(0, selectionFrom) + parentBody.slice(selectionTo);
      return {
        ...prev,
        notes: {
          ...prev.notes,
          [tempId]: newChild,
          [parentNoteId]: { ...prev.notes[parentNoteId], body: updatedParentBody },
        },
      };
    });

    postAction('note/create', { path: props.documentPath, title, body, x: childX, y: childY, w: childW, h: childH })
      .then((result) => {
        if (!result.ok || !result.id) throw new Error('create failed');
        const realId = result.id;
        const updatedParentBody = props.doc.notes[parentNoteId].body;
        return Promise.all([
          postAction('nest', { path: props.documentPath, parentId: parentNoteId, childId: realId }),
          postAction('node/move', { path: props.documentPath, id: realId, x: childX, y: childY }),
          postAction('note/update', { path: props.documentPath, id: parentNoteId, body: updatedParentBody }),
        ]).then(() => realId);
      })
      .then((realId) => {
        props.setDoc((prev) => {
          if (!prev) return prev;
          const { [tempId]: tempNote, ...rest } = prev.notes;
          return { ...prev, notes: { ...rest, [realId]: { ...tempNote, id: realId } } };
        });
        autoResizeParent(parentNoteId);
      })
      .catch(() => props.loadDoc());
  };

  const handleDeleteNote = (noteId: string) => deleteNotes([noteId]);

  // Build children map
  const childrenMap = () => {
    const map: Record<string, Note[]> = {};
    for (const note of Object.values(props.doc.notes)) {
      if (note.parentId) {
        if (!map[note.parentId]) map[note.parentId] = [];
        map[note.parentId].push(note);
      }
    }
    return map;
  };

  function renderNote(note: Note): any {
    const merged = props.mergedNotes()[note.id];
    const x = merged?.x ?? note.x;
    const y = merged?.y ?? note.y;
    const w = merged?.w ?? note.w;
    const h = merged?.h ?? note.h;
    const nestedChildren = childrenMap()[note.id] ?? [];

    return (
      <NoteNode
        note={note}
        x={x} y={y} w={w} h={h}
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
  const [doc, setDoc] = createSignal<Document | null>(null);
  const [loading, setLoading] = createSignal(true);
  const [error, setError] = createSignal<string | null>(null);
  const [livePositions, setLivePositions] = createSignal<Map<string, { x: number; y: number }>>(new Map());
  const [liveSizes, setLiveSizes] = createSignal<Map<string, { w: number; h: number }>>(new Map());

  const mergedNotes = createMemo(() => {
    const d = doc();
    if (!d) return {} as Record<string, Note>;
    const notes = { ...d.notes };
    for (const [id, pos] of livePositions()) {
      if (notes[id]) notes[id] = { ...notes[id], ...pos };
    }
    for (const [id, size] of liveSizes()) {
      if (notes[id]) notes[id] = { ...notes[id], ...size };
    }
    return notes;
  });

  let clearSelectionFn: () => void = () => {};
  let createNoteFn: () => void = () => {};
  let canvasRef: CanvasRef | undefined;

  const loadDoc = () => {
    setLoading(true);
    setError(null);
    getDocument(props.documentPath)
      .then((d) => {
        setDoc(d);
        setLoading(false);
      })
      .catch((err) => {
        console.error('[CanvasView] failed to load document:', props.documentPath, err);
        setError('Failed to load document');
        setLoading(false);
      });
  };

  onMount(() => loadDoc());

  const handleConnect = ({ source, target }: { source: string; target: string }) => {
    if (source === target) return;
    setDoc((prev) => {
      if (!prev) return prev;
      const tempId = `edge-temp-${Date.now()}`;
      return { ...prev, edges: { ...prev.edges, [tempId]: { id: tempId, fromId: source, toId: target, label: null } } };
    });
    postAction('edge/connect', { path: props.documentPath, fromId: source, toId: target })
      .then((result) => { if (result.ok) loadDoc(); })
      .catch(() => loadDoc());
  };

  const handleUpdateEdgeLabel = (edgeId: string, label: string | null) => {
    setDoc((prev) => {
      if (!prev) return prev;
      return { ...prev, edges: { ...prev.edges, [edgeId]: { ...prev.edges[edgeId], label } } };
    });
    postAction('edge/relabel', { path: props.documentPath, id: edgeId, label }).catch(() => loadDoc());
  };

  const renderEdges = () => {
    const d = doc();
    if (!d) return null;
    return (
      <For each={Object.values(d.edges)}>
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
    const d = doc();
    if (!d) return [];
    return Object.values(d.notes)
      .filter((n) => !n.parentId)
      .map((n) => ({ id: n.id, x: n.x, y: n.y, width: n.w, height: n.h }));
  };

  const untangle = () => {
    const d = doc();
    if (!d) return;

    const layoutNodes = Object.values(d.notes)
      .filter((n) => !n.parentId)
      .map((n) => ({ id: n.id, x: n.x, y: n.y, width: n.w, height: n.h }));

    const layoutEdges = Object.values(d.edges).map((e) => ({ source: e.fromId, target: e.toId }));

    const result = forceDirectedLayout(layoutNodes, layoutEdges);

    for (const [id, pos] of result) {
      setDoc((prev) =>
        prev
          ? { ...prev, notes: { ...prev.notes, [id]: { ...prev.notes[id], x: pos.x, y: pos.y } } }
          : prev
      );
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
        <Show when={!loading() && !error() && doc()}>
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
                  setLivePositions={setLivePositions}
                  setLiveSizes={setLiveSizes}
                />
              </Canvas>
              <CanvasToolbar
                onZoomIn={() => canvasRef?.zoomIn()}
                onZoomOut={() => canvasRef?.zoomOut()}
                onFitView={() => canvasRef?.fitView(getNodeRects())}
                onUntangle={untangle}
              />
            </>
          )}
        </Show>
      </div>
    </div>
  );
}
