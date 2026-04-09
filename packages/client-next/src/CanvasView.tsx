import { createSignal, createMemo, onMount, onCleanup, Show, For, type JSX } from 'solid-js';
import { createStore, produce, reconcile, type SetStoreFunction } from 'solid-js/store';
import {
  Canvas,
  useNodeDrag,
  useNodeResize,
  useCanvasContext,
  forceDirectedLayout,
  treeLayout,
  tidyLayout,
  type CanvasRef,
  type ResizeDirection,
} from '@luminous/cactus';
import { getDocument, postAction, type Document, type Note, type Node, type NoteNode as NoteNodeType, type PortalNode as PortalNodeType } from './api';
import { NoteNode } from './NoteNode';
import { PortalNode } from './PortalNode';
import { FreeformEdge } from './FreeformEdge';
import { CanvasToolbar } from './CanvasToolbar';
import { ContextMenu, type MenuItem } from './ContextMenu';
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
  // Multi-source support
  sources: Record<string, Document>;
  setSources: SetStoreFunction<Record<string, Document>>;
  sourceMap: Record<string, string>;
  onSourceLoaded: (path: string, doc: Document) => void;
  onTidyNode: (nodeId: string) => void;
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

  // --- Helpers for multi-source routing ---

  /** Returns the source path that owns a given node or edge id. */
  const getSourcePath = (id: string): string =>
    props.sourceMap[id] ?? props.documentPath;

  /** Update a note's fields in whichever store owns it. */
  const setNoteFields = (nodeId: string, fields: Partial<Note>) => {
    const path = getSourcePath(nodeId);
    if (path === props.documentPath) {
      props.setDoc('current', 'notes', nodeId, fields as any);
    } else {
      props.setSources(path, 'notes', nodeId, fields as any);
    }
  };

  /** Get a note from any loaded source. */
  const getNoteFromAnySource = (nodeId: string): Note | undefined => {
    if (props.doc.notes[nodeId]) return props.doc.notes[nodeId];
    const path = props.sourceMap[nodeId];
    if (path) return props.sources[path]?.notes[nodeId];
    return undefined;
  };

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

    // Group by source path
    const bySource = new Map<string, string[]>();
    for (const id of toDelete) {
      const path = getSourcePath(id);
      if (!bySource.has(path)) bySource.set(path, []);
      bySource.get(path)!.push(id);
    }

    // Remove from main doc store
    const mainIds = bySource.get(props.documentPath);
    if (mainIds && mainIds.length > 0) {
      props.setDoc('current', produce((d) => {
        if (!d) return;
        for (const id of mainIds) {
          delete d.notes[id];
          for (const edgeId of Object.keys(d.edges)) {
            if (d.edges[edgeId].fromId === id || d.edges[edgeId].toId === id) delete d.edges[edgeId];
          }
          for (const note of Object.values(d.notes)) {
            if (note.parentId === id) note.parentId = null;
          }
        }
      }));
    }

    // Remove from source stores
    for (const [path, ids] of bySource) {
      if (path === props.documentPath) continue;
      props.setSources(path, produce((d: Document) => {
        for (const id of ids) {
          delete d.notes[id];
          for (const edgeId of Object.keys(d.edges)) {
            if (d.edges[edgeId].fromId === id || d.edges[edgeId].toId === id) delete d.edges[edgeId];
          }
          for (const note of Object.values(d.notes)) {
            if (note.parentId === id) note.parentId = null;
          }
        }
      }));
    }

    const actions: Promise<any>[] = [];
    for (const [path, ids] of bySource) {
      for (const id of ids) {
        actions.push(postAction('note/delete', { path, id }));
      }
    }
    Promise.all(actions).catch(() => props.loadDoc());
  };

  // Delete key handler
  onMount(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key !== 'Delete' && e.key !== 'Backspace') return;
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
      const note = getNoteFromAnySource(nodeId);
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
      const note = getNoteFromAnySource(nodeId);
      if (!note) return;

      const allNotes = props.mergedNotes();
      const finalLocalPos = livePos ?? { x: note.x, y: note.y };
      const parentAbsPos = note.parentId
        ? getAbsolutePos(note.parentId, allNotes)
        : { x: 0, y: 0 };
      const finalAbsPos = note.parentId
        ? { x: parentAbsPos.x + finalLocalPos.x, y: parentAbsPos.y + finalLocalPos.y }
        : finalLocalPos;

      livePositionMap.delete(nodeId);
      dragBaseMap.delete(nodeId);
      props.setLive(produce((s) => { delete s.positions[nodeId]; }));

      const sourcePath = getSourcePath(nodeId);

      if (ctrlHeld()) {
        const pointer = lastPointer;
        const dropTargetId = findDropTarget(pointer.x, pointer.y, nodeId);

        if (dropTargetId && dropTargetId !== note.parentId) {
          // Cross-source nesting guard
          const targetSource = getSourcePath(dropTargetId);
          if (sourcePath !== targetSource) {
            // Block cross-source nest — treat as a regular move
            setNoteFields(nodeId, { x: finalLocalPos.x, y: finalLocalPos.y });
            postAction('node/move', { path: sourcePath, id: nodeId, x: finalLocalPos.x, y: finalLocalPos.y }).catch(() => props.loadDoc());
            return;
          }

          const targetAbsPos = getAbsolutePos(dropTargetId, allNotes);
          const relPos = { x: finalAbsPos.x - targetAbsPos.x, y: finalAbsPos.y - targetAbsPos.y };

          setNoteFields(nodeId, { parentId: dropTargetId, x: relPos.x, y: relPos.y });
          Promise.all([
            postAction('nest', { path: sourcePath, parentId: dropTargetId, childId: nodeId }),
            postAction('node/move', { path: sourcePath, id: nodeId, x: relPos.x, y: relPos.y }),
          ]).catch(() => props.loadDoc());
        } else if (!dropTargetId && note.parentId) {
          setNoteFields(nodeId, { parentId: null, x: finalAbsPos.x, y: finalAbsPos.y });
          Promise.all([
            postAction('unnest', { path: sourcePath, childId: nodeId }),
            postAction('node/move', { path: sourcePath, id: nodeId, x: finalAbsPos.x, y: finalAbsPos.y }),
          ]).catch(() => props.loadDoc());
        } else {
          setNoteFields(nodeId, { x: finalLocalPos.x, y: finalLocalPos.y });
          postAction('node/move', { path: sourcePath, id: nodeId, x: finalLocalPos.x, y: finalLocalPos.y }).catch(() => props.loadDoc());
        }
      } else {
        setNoteFields(nodeId, { x: finalLocalPos.x, y: finalLocalPos.y });
        postAction('node/move', { path: sourcePath, id: nodeId, x: finalLocalPos.x, y: finalLocalPos.y }).catch(() => props.loadDoc());
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
      const note = getNoteFromAnySource(nodeId);
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
      const note = getNoteFromAnySource(nodeId);
      if (!note) return;
      const finalSize = liveSize ?? { w: note.w, h: note.h };
      liveSizeMap.delete(nodeId);
      resizeBaseMap.delete(nodeId);
      props.setLive(produce((s) => { delete s.sizes[nodeId]; }));
      setNoteFields(nodeId, { w: finalSize.w, h: finalSize.h });
      const sourcePath = getSourcePath(nodeId);
      postAction('node/resize', { path: sourcePath, id: nodeId, w: finalSize.w, h: finalSize.h }).catch(() => props.loadDoc());
    },
  };

  const { onResizePointerDown } = useNodeResize({
    zoomScale: () => transform().k,
    callbacks: resizeCallbacks,
  });

  const handleUpdateTitle = (id: string, title: string) => {
    setNoteFields(id, { title } as any);
    postAction('note/update', { path: getSourcePath(id), id, title }).catch(() => props.loadDoc());
  };

  const handleUpdateBody = (id: string, body: string) => {
    setNoteFields(id, { body } as any);
    postAction('note/update', { path: getSourcePath(id), id, body }).catch(() => props.loadDoc());
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
      setNoteFields(parentId, { w: newW, h: newH });
      postAction('node/resize', { path: getSourcePath(parentId), id: parentId, w: newW, h: newH }).catch(() => props.loadDoc());
    }
  };

  const handleExtract = (parentNoteId: string, selectedText: string, selectionFrom: number, selectionTo: number) => {
    const parentNote = props.doc.notes[parentNoteId];
    if (!parentNote) return;
    const sourcePath = getSourcePath(parentNoteId);
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

    postAction('note/create', { path: sourcePath, title, body, x: childX, y: childY, w: childW, h: childH })
      .then((result) => {
        if (!result.ok || !result.id) throw new Error('create failed');
        const realId = result.id;
        const updatedParentBody = (props.doc.notes[parentNoteId] as any).body as string;
        return Promise.all([
          postAction('nest', { path: sourcePath, parentId: parentNoteId, childId: realId }),
          postAction('node/move', { path: sourcePath, id: realId, x: childX, y: childY }),
          postAction('note/update', { path: sourcePath, id: parentNoteId, body: updatedParentBody }),
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

  // Build children map across all sources
  const childrenMap = () => {
    const map: Record<string, Node[]> = {};
    const addNotes = (notes: Record<string, Node>) => {
      for (const note of Object.values(notes)) {
        if (note.parentId) {
          if (!map[note.parentId]) map[note.parentId] = [];
          map[note.parentId].push(note);
        }
      }
    };
    addNotes(props.doc.notes);
    for (const sourceDoc of Object.values(props.sources)) {
      addNotes(sourceDoc.notes);
    }
    return map;
  };

  // Initial ancestor set for the main document
  const initialAncestors = new Set([props.documentPath]);

  function renderNote(note: Node, sourcePath: string = props.documentPath, ancestors: Set<string> = initialAncestors): JSX.Element {
    const nestedChildren = childrenMap()[note.id] ?? [];

    if (note.type === 'portal') {
      return (
        <PortalNode
          node={note as PortalNodeType}
          mergedNotes={props.mergedNotes}
          onDragPointerDown={onDragPointerDown}
          onResizePointerDown={onResizePointerDown}
          onDelete={handleDeleteNote}
          onTidy={props.onTidyNode}
          sources={props.sources}
          onSourceLoaded={props.onSourceLoaded}
          ancestorSources={ancestors}
          renderNode={renderNote}
        >
          <For each={nestedChildren}>
            {(child) => renderNote(child, sourcePath, ancestors)}
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
        onTidy={props.onTidyNode}
      >
        <For each={nestedChildren}>
          {(child) => renderNote(child, sourcePath, ancestors)}
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

  // Multi-source state
  const [sources, setSources] = createStore<Record<string, Document>>({});
  // Maps nodeId/edgeId → source path (for action routing)
  const [sourceMap, setSourceMap] = createStore<Record<string, string>>({});

  const handleSourceLoaded = (path: string, sourceDoc: Document) => {
    setSources(path, reconcile(sourceDoc));
    setSourceMap(produce((sm: Record<string, string>) => {
      for (const id of Object.keys(sourceDoc.notes)) sm[id] = path;
      for (const id of Object.keys(sourceDoc.edges)) sm[id] = path;
    }));
  };

  const mergedNotes = createMemo(() => {
    const d = doc.current;
    if (!d) return {} as Record<string, Note>;

    const allNotes: Record<string, Note> = {};
    // Main document notes
    for (const [id, note] of Object.entries(d.notes)) {
      allNotes[id] = note;
    }
    // Portal source notes
    for (const sourceDoc of Object.values(sources)) {
      for (const [id, note] of Object.entries(sourceDoc.notes)) {
        allNotes[id] = note;
      }
    }
    // Apply live overlays (drag/resize in progress)
    const notes: Record<string, Note> = {};
    for (const [id, note] of Object.entries(allNotes)) {
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
    if (loadDocTimer !== null) return;
    const isInitial = !doc.current;
    if (isInitial) setLoading(true);
    setError(null);
    const delay = isInitial ? 0 : 300;
    loadDocTimer = setTimeout(() => {
      loadDocTimer = null;
      getDocument(props.documentPath)
        .then((d) => {
          setDoc('current', reconcile(d));
          // Register main doc node/edge ids in sourceMap
          setSourceMap(produce((sm: Record<string, string>) => {
            for (const id of Object.keys(d.notes)) sm[id] = props.documentPath;
            for (const id of Object.keys(d.edges)) sm[id] = props.documentPath;
          }));
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

    // WebSocket watch — reload when an external process edits a watched file
    const wsUrl = `ws://${location.host}/ws/watch`;
    let ws: WebSocket;
    let reconnectTimer: ReturnType<typeof setTimeout> | null = null;

    function connect() {
      ws = new WebSocket(wsUrl);
      ws.onmessage = (e) => {
        try {
          const data = JSON.parse(e.data as string);
          if (data.event === 'changed') {
            if (data.path === props.documentPath) {
              loadDoc();
            } else if (sources[data.path]) {
              // Reload a portal source that changed externally
              getDocument(data.path)
                .then((d) => handleSourceLoaded(data.path, d))
                .catch((err) => console.error('[CanvasView] failed to reload portal source:', data.path, err));
            }
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
    // Cross-source edges are not allowed
    const sourceSourcePath = sourceMap[source] ?? props.documentPath;
    const targetSourcePath = sourceMap[target] ?? props.documentPath;
    if (sourceSourcePath !== targetSourcePath) return;

    const edgePath = sourceSourcePath;
    const tempId = `edge-temp-${Date.now()}`;

    if (edgePath === props.documentPath) {
      setDoc('current', produce((d) => {
        if (!d) return;
        d.edges[tempId] = { id: tempId, fromId: source, toId: target, label: null };
      }));
    } else {
      setSources(edgePath, produce((d: Document) => {
        d.edges[tempId] = { id: tempId, fromId: source, toId: target, label: null };
      }));
    }

    postAction('edge/connect', { path: edgePath, fromId: source, toId: target })
      .then((result) => { if (result.ok) loadDoc(); })
      .catch(() => loadDoc());
  };

  const handleUpdateEdgeLabel = (edgeId: string, label: string | null) => {
    const edgePath = sourceMap[edgeId] ?? props.documentPath;
    if (edgePath === props.documentPath) {
      setDoc('current', produce((d) => {
        if (!d) return;
        d.edges[edgeId].label = label;
      }));
    } else {
      setSources(edgePath, produce((d: Document) => {
        if (d.edges[edgeId]) d.edges[edgeId].label = label;
      }));
    }
    postAction('edge/relabel', { path: edgePath, id: edgeId, label }).catch(() => loadDoc());
  };

  // All edges — main document + all portal sources
  const edgeList = createMemo(() => {
    const d = doc.current;
    const mainEdges = d ? Object.values(d.edges) : [];
    const sourceEdges = Object.values(sources).flatMap((s) => Object.values(s.edges));
    return [...mainEdges, ...sourceEdges];
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

  const arrangeTidyLayout = (rootId?: string) => {
    const d = doc.current;
    if (!d) return;

    const tidyNodes = Object.values(d.notes).map((n) => ({
      id: n.id, w: n.w, h: n.h, parentId: n.parentId ?? null,
    }));

    const result = tidyLayout(tidyNodes, rootId ? { rootId } : undefined);

    for (const [id, rect] of result) {
      // In subtree mode, the root's x/y from tidyLayout are sentinels — only apply w/h.
      const isSubtreeRoot = rootId === id;
      setDoc('current', produce((d) => {
        if (!d) return;
        if (!isSubtreeRoot) {
          d.notes[id].x = rect.x;
          d.notes[id].y = rect.y;
        }
        d.notes[id].w = rect.w;
        d.notes[id].h = rect.h;
      }));
      if (!isSubtreeRoot) {
        postAction('node/move', { path: props.documentPath, id, x: rect.x, y: rect.y }).catch(() => loadDoc());
      }
      postAction('node/resize', { path: props.documentPath, id, w: rect.w, h: rect.h }).catch(() => loadDoc());
    }
  };

  // Background right-click context menu (canvas-level)
  const [bgContextMenu, setBgContextMenu] = createSignal<{ x: number; y: number } | null>(null);

  const bgMenuItems = (): MenuItem[] => [
    { label: 'Tidy canvas', action: () => arrangeTidyLayout() },
  ];

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
                onBackgroundContextMenu={(e) => setBgContextMenu({ x: e.clientX, y: e.clientY })}
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
                  sources={sources}
                  setSources={setSources}
                  sourceMap={sourceMap}
                  onSourceLoaded={handleSourceLoaded}
                  onTidyNode={arrangeTidyLayout}
                />
              </Canvas>
              <CanvasToolbar
                onZoomIn={() => canvasRef?.zoomIn()}
                onZoomOut={() => canvasRef?.zoomOut()}
                onFitView={() => canvasRef?.fitView(getNodeRects())}
                onTreeLayout={arrangeTreeLayout}
                onForceLayout={arrangeForceLayout}
                onTidyLayout={() => arrangeTidyLayout()}
              />
              <Show when={bgContextMenu()}>
                {(menu) => (
                  <ContextMenu
                    x={menu().x}
                    y={menu().y}
                    header={`Canvas · ${props.documentPath}`}
                    items={bgMenuItems()}
                    onClose={() => setBgContextMenu(null)}
                  />
                )}
              </Show>
            </>
          )}
        </Show>
      </div>
    </div>
  );
}
