import React, { useEffect, useState, useRef, useCallback, useMemo } from 'react'
import {
  Canvas,
  useNodeDrag,
  useNodeResize,
  useCanvasContext,
  type CanvasRef,
  type ResizeDirection,
} from '@luminous/cactus'
import { getDocument, postAction, type Document, type Note } from './api'
import { NoteNode } from './NoteNode'
import { FreeformEdge } from './FreeformEdge'

interface CanvasViewProps {
  documentPath: string
  onBack: () => void
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Compute absolute canvas top-left of a note, walking the parent chain. */
function getAbsolutePos(
  noteId: string,
  notes: Record<string, Note>
): { x: number; y: number } {
  const note = notes[noteId]
  if (!note) return { x: 0, y: 0 }
  if (!note.parentId) return { x: note.x, y: note.y }
  const parentAbs = getAbsolutePos(note.parentId, notes)
  return { x: parentAbs.x + note.x, y: parentAbs.y + note.y }
}

/**
 * Hit-test for drop targets at a screen position, excluding a specific node.
 * Reads data-drop-target + data-container-id DOM attributes.
 */
function findDropTarget(screenX: number, screenY: number, excludeId: string): string | null {
  const elements = document.elementsFromPoint(screenX, screenY)
  for (const el of elements) {
    if (el.getAttribute('data-drop-target') === 'true') {
      const containerId = el.getAttribute('data-container-id')
      if (containerId && containerId !== excludeId) {
        return containerId
      }
    }
  }
  return null
}

// ---------------------------------------------------------------------------
// CanvasContent — rendered inside <Canvas>, can use useCanvasContext()
// ---------------------------------------------------------------------------

interface CanvasContentProps {
  doc: Document
  setDoc: React.Dispatch<React.SetStateAction<Document | null>>
  documentPath: string
  loadDoc: () => void
  /** Ref populated by CanvasContent so the outer Canvas can trigger clearSelection */
  clearSelectionRef: React.MutableRefObject<() => void>
  /** Ref populated by CanvasContent so the toolbar can trigger note creation */
  createNoteRef: React.MutableRefObject<() => void>
  /** Live positions lifted to CanvasView so renderEdges can see them */
  livePositions: Map<string, { x: number; y: number }>
  setLivePositions: React.Dispatch<React.SetStateAction<Map<string, { x: number; y: number }>>>
  liveSizes: Map<string, { w: number; h: number }>
  setLiveSizes: React.Dispatch<React.SetStateAction<Map<string, { w: number; h: number }>>>
}

function CanvasContent({
  doc,
  setDoc,
  documentPath,
  loadDoc,
  clearSelectionRef,
  createNoteRef,
  livePositions,
  setLivePositions,
  liveSizes,
  setLiveSizes,
}: CanvasContentProps) {
  const {
    transform,
    ctrlHeld,
    clearSelection,
    isSelected,
    onNodePointerDown,
    selectedIds,
    screenToCanvas,
  } = useCanvasContext()

  // Make clearSelection available to the outer Canvas component
  clearSelectionRef.current = clearSelection

  // Register the "create note" action so the header button can call it
  createNoteRef.current = useCallback(() => {
    // Place new note at approximate canvas center
    const center = screenToCanvas(window.innerWidth / 2, window.innerHeight / 2)
    const x = Math.round(center.x - 100)
    const y = Math.round(center.y - 75)

    const tempId = `temp-${Date.now()}`
    const newNote: Note = {
      id: tempId,
      title: 'New Note',
      body: '',
      parentId: null,
      x,
      y,
      w: 200,
      h: 150,
    }

    setDoc((prev) =>
      prev ? { ...prev, notes: { ...prev.notes, [tempId]: newNote } } : prev
    )

    postAction('note/create', { path: documentPath, title: 'New Note', x, y, w: 200, h: 150 })
      .then((result) => {
        if (result.ok && result.id) {
          setDoc((prev) => {
            if (!prev) return prev
            const { [tempId]: _, ...rest } = prev.notes
            return { ...prev, notes: { ...rest, [result.id!]: { ...newNote, id: result.id! } } }
          })
        } else {
          // Remove the temp note on failure
          setDoc((prev) => {
            if (!prev) return prev
            const { [tempId]: _, ...rest } = prev.notes
            return { ...prev, notes: rest }
          })
        }
      })
      .catch(() => loadDoc())
  }, [screenToCanvas, documentPath, setDoc, loadDoc])

  // ---- Live drag/resize tracking ----
  // livePositions/liveSizes are lifted to CanvasView so renderEdges can see them.
  // Refs hold the same values for synchronous reads inside callbacks
  const livePositionRef = useRef<Map<string, { x: number; y: number }>>(new Map())
  const liveSizeRef = useRef<Map<string, { w: number; h: number }>>(new Map())
  const dragBaseRef = useRef<Map<string, { x: number; y: number }>>(new Map())
  const resizeBaseRef = useRef<Map<string, { w: number; h: number }>>(new Map())
  const ctrlHeldRef = useRef(ctrlHeld)
  const lastPointerRef = useRef<{ x: number; y: number }>({ x: 0, y: 0 })
  const docRef = useRef(doc)

  useEffect(() => {
    ctrlHeldRef.current = ctrlHeld
  }, [ctrlHeld])
  useEffect(() => {
    docRef.current = doc
  }, [doc])

  // Track last pointer position for drop detection at drag end
  useEffect(() => {
    const handler = (e: PointerEvent) => {
      lastPointerRef.current = { x: e.clientX, y: e.clientY }
    }
    window.addEventListener('pointermove', handler)
    return () => window.removeEventListener('pointermove', handler)
  }, [])

  // ---- Delete key handler ----
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key !== 'Delete' && e.key !== 'Backspace') return
      // selectedIds from context closure — always fresh since this effect re-runs when selectedIds changes
      if (selectedIds.length === 0) return

      const toDelete = [...selectedIds]
      clearSelection()

      // Optimistic: remove all selected notes + cascade edges
      setDoc((prev) => {
        if (!prev) return prev
        const notes = { ...prev.notes }
        const edges = { ...prev.edges }
        for (const id of toDelete) {
          delete notes[id]
          // Remove edges referencing the deleted note
          for (const edgeId of Object.keys(edges)) {
            if (edges[edgeId].fromId === id || edges[edgeId].toId === id) {
              delete edges[edgeId]
            }
          }
          // Unnest children
          for (const note of Object.values(notes)) {
            if (note.parentId === id) {
              notes[note.id] = { ...note, parentId: null }
            }
          }
        }
        return { ...prev, notes, edges }
      })

      // Fire server actions; refetch on any failure
      Promise.all(
        toDelete.map((id) => postAction('note/delete', { path: documentPath, id }))
      ).catch(() => loadDoc())
    }

    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [selectedIds, clearSelection, documentPath, setDoc, loadDoc])

  // ---- Drag callbacks ----
  const dragCallbacks = useMemo(
    () => ({
      onDragStart(nodeId: string) {
        const note = docRef.current.notes[nodeId]
        if (note) {
          dragBaseRef.current.set(nodeId, { x: note.x, y: note.y })
        }
      },
      onDrag(nodeId: string, dx: number, dy: number) {
        const base = dragBaseRef.current.get(nodeId)
        if (!base) return
        const pos = { x: base.x + dx, y: base.y + dy }
        livePositionRef.current.set(nodeId, pos)
        setLivePositions((prev) => new Map(prev).set(nodeId, pos))
      },
      onDragEnd(nodeId: string) {
        const livePos = livePositionRef.current.get(nodeId)
        const note = docRef.current.notes[nodeId]
        if (!note) return

        // finalLocalPos: in the same coord space as note.x/y
        // (relative to parent if nested, absolute if top-level)
        const finalLocalPos = livePos ?? { x: note.x, y: note.y }

        // Compute absolute canvas position for drop detection
        const parentAbsPos = note.parentId
          ? getAbsolutePos(note.parentId, docRef.current.notes)
          : { x: 0, y: 0 }
        const finalAbsPos = note.parentId
          ? { x: parentAbsPos.x + finalLocalPos.x, y: parentAbsPos.y + finalLocalPos.y }
          : finalLocalPos

        // Clear live tracking
        livePositionRef.current.delete(nodeId)
        dragBaseRef.current.delete(nodeId)
        setLivePositions((prev) => {
          const next = new Map(prev)
          next.delete(nodeId)
          return next
        })

        if (ctrlHeldRef.current) {
          // Nesting / unnesting via Ctrl+drag
          const pointer = lastPointerRef.current
          const dropTargetId = findDropTarget(pointer.x, pointer.y, nodeId)

          if (dropTargetId && dropTargetId !== note.parentId) {
            // Nest into a different container
            const targetAbsPos = getAbsolutePos(dropTargetId, docRef.current.notes)
            const relPos = {
              x: finalAbsPos.x - targetAbsPos.x,
              y: finalAbsPos.y - targetAbsPos.y,
            }

            setDoc((prev) =>
              prev
                ? {
                    ...prev,
                    notes: {
                      ...prev.notes,
                      [nodeId]: { ...prev.notes[nodeId], parentId: dropTargetId, x: relPos.x, y: relPos.y },
                    },
                  }
                : prev
            )

            Promise.all([
              postAction('nest', { path: documentPath, parentId: dropTargetId, childId: nodeId }),
              postAction('node/move', { path: documentPath, id: nodeId, x: relPos.x, y: relPos.y }),
            ]).catch(() => loadDoc())
          } else if (!dropTargetId && note.parentId) {
            // Unnest — move to absolute position in canvas
            setDoc((prev) =>
              prev
                ? {
                    ...prev,
                    notes: {
                      ...prev.notes,
                      [nodeId]: { ...prev.notes[nodeId], parentId: null, x: finalAbsPos.x, y: finalAbsPos.y },
                    },
                  }
                : prev
            )

            Promise.all([
              postAction('unnest', { path: documentPath, childId: nodeId }),
              postAction('node/move', { path: documentPath, id: nodeId, x: finalAbsPos.x, y: finalAbsPos.y }),
            ]).catch(() => loadDoc())
          } else {
            // Ctrl held but no target change — treat as regular move
            setDoc((prev) =>
              prev
                ? {
                    ...prev,
                    notes: {
                      ...prev.notes,
                      [nodeId]: { ...prev.notes[nodeId], x: finalLocalPos.x, y: finalLocalPos.y },
                    },
                  }
                : prev
            )
            postAction('node/move', {
              path: documentPath,
              id: nodeId,
              x: finalLocalPos.x,
              y: finalLocalPos.y,
            }).catch(() => loadDoc())
          }
        } else {
          // Regular move — update local pos in its own coordinate space
          setDoc((prev) =>
            prev
              ? {
                  ...prev,
                  notes: {
                    ...prev.notes,
                    [nodeId]: { ...prev.notes[nodeId], x: finalLocalPos.x, y: finalLocalPos.y },
                  },
                }
              : prev
          )
          postAction('node/move', {
            path: documentPath,
            id: nodeId,
            x: finalLocalPos.x,
            y: finalLocalPos.y,
          }).catch(() => loadDoc())
        }
      },
    }),
    [documentPath, setDoc, loadDoc]
  )

  const { onPointerDown: onDragPointerDown } = useNodeDrag({
    zoomScale: transform.k,
    handleSelector: '[data-drag-handle]',
    callbacks: dragCallbacks,
  })

  // ---- Resize callbacks ----
  const resizeCallbacks = useMemo(
    () => ({
      onResizeStart(nodeId: string) {
        const note = docRef.current.notes[nodeId]
        if (note) {
          resizeBaseRef.current.set(nodeId, { w: note.w, h: note.h })
        }
      },
      onResize(nodeId: string, dw: number, dh: number) {
        const base = resizeBaseRef.current.get(nodeId)
        if (!base) return
        const size = {
          w: Math.max(120, base.w + dw),
          h: Math.max(80, base.h + dh),
        }
        liveSizeRef.current.set(nodeId, size)
        setLiveSizes((prev) => new Map(prev).set(nodeId, size))
      },
      onResizeEnd(nodeId: string) {
        const liveSize = liveSizeRef.current.get(nodeId)
        const note = docRef.current.notes[nodeId]
        if (!note) return

        const finalSize = liveSize ?? { w: note.w, h: note.h }

        liveSizeRef.current.delete(nodeId)
        resizeBaseRef.current.delete(nodeId)
        setLiveSizes((prev) => {
          const next = new Map(prev)
          next.delete(nodeId)
          return next
        })

        setDoc((prev) =>
          prev
            ? {
                ...prev,
                notes: {
                  ...prev.notes,
                  [nodeId]: { ...prev.notes[nodeId], w: finalSize.w, h: finalSize.h },
                },
              }
            : prev
        )

        postAction('node/resize', {
          path: documentPath,
          id: nodeId,
          w: finalSize.w,
          h: finalSize.h,
        }).catch(() => loadDoc())
      },
    }),
    [documentPath, setDoc, loadDoc]
  )

  const { onResizePointerDown } = useNodeResize({
    zoomScale: transform.k,
    callbacks: resizeCallbacks,
  })

  // ---- Note update handlers ----
  const handleUpdateTitle = useCallback(
    (id: string, title: string) => {
      setDoc((prev) =>
        prev
          ? { ...prev, notes: { ...prev.notes, [id]: { ...prev.notes[id], title } } }
          : prev
      )
      postAction('note/update', { path: documentPath, id, title }).catch(() => loadDoc())
    },
    [documentPath, setDoc, loadDoc]
  )

  const handleUpdateBody = useCallback(
    (id: string, body: string) => {
      setDoc((prev) =>
        prev
          ? { ...prev, notes: { ...prev.notes, [id]: { ...prev.notes[id], body } } }
          : prev
      )
      postAction('note/update', { path: documentPath, id, body }).catch(() => loadDoc())
    },
    [documentPath, setDoc, loadDoc]
  )

  // ---- Render helpers ----

  // Build children map once per render
  const childrenMap = useMemo(() => {
    const map: Record<string, Note[]> = {}
    for (const note of Object.values(doc.notes)) {
      if (note.parentId) {
        if (!map[note.parentId]) map[note.parentId] = []
        map[note.parentId].push(note)
      }
    }
    return map
  }, [doc.notes])

  /** Recursively render a note and its nested children */
  function renderNote(note: Note): React.ReactNode {
    const livePos = livePositions.get(note.id)
    const liveSize = liveSizes.get(note.id)
    const x = livePos?.x ?? note.x
    const y = livePos?.y ?? note.y
    const w = liveSize?.w ?? note.w
    const h = liveSize?.h ?? note.h

    const nestedChildren = childrenMap[note.id] ?? []

    return (
      <NoteNode
        key={note.id}
        note={note}
        x={x}
        y={y}
        w={w}
        h={h}
        onDragPointerDown={onDragPointerDown}
        onResizePointerDown={onResizePointerDown}
        onUpdateTitle={handleUpdateTitle}
        onUpdateBody={handleUpdateBody}
      >
        {nestedChildren.map((child) => renderNote(child))}
      </NoteNode>
    )
  }

  // Top-level notes only (nested ones are rendered by their parents)
  const topLevelNotes = useMemo(
    () => Object.values(doc.notes).filter((n) => !n.parentId),
    [doc.notes]
  )

  return <>{topLevelNotes.map((note) => renderNote(note))}</>
}

// ---------------------------------------------------------------------------
// CanvasView — outer component
// ---------------------------------------------------------------------------

export function CanvasView({ documentPath, onBack }: CanvasViewProps) {
  const [doc, setDoc] = useState<Document | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const canvasRef = useRef<CanvasRef>(null)

  // Lifted live position/size state so renderEdges can see drag updates in real-time
  const [livePositions, setLivePositions] = useState<Map<string, { x: number; y: number }>>(
    new Map()
  )
  const [liveSizes, setLiveSizes] = useState<Map<string, { w: number; h: number }>>(new Map())

  // Refs for cross-boundary communication with CanvasContent
  const clearSelectionRef = useRef<() => void>(() => {})
  const createNoteRef = useRef<() => void>(() => {})
  const docRef = useRef<Document | null>(null)

  useEffect(() => {
    docRef.current = doc
  }, [doc])

  const loadDoc = useCallback(() => {
    setLoading(true)
    setError(null)
    getDocument(documentPath)
      .then((d) => {
        setDoc(d)
        setLoading(false)
      })
      .catch(() => {
        setError('Failed to load document')
        setLoading(false)
      })
  }, [documentPath])

  useEffect(() => {
    loadDoc()
  }, [loadDoc])

  const handleConnect = useCallback(
    ({ source, target }: { source: string; target: string }) => {
      if (source === target) return
      setDoc((prev) => {
        if (!prev) return prev
        const tempId = `edge-temp-${Date.now()}`
        return {
          ...prev,
          edges: {
            ...prev.edges,
            [tempId]: { id: tempId, fromId: source, toId: target, label: null },
          },
        }
      })
      postAction('edge/connect', { path: documentPath, fromId: source, toId: target })
        .then((result) => {
          if (result.ok) {
            // Refetch to get the real edge id
            loadDoc()
          }
        })
        .catch(() => loadDoc())
    },
    [documentPath, loadDoc]
  )

  const handleUpdateEdgeLabel = useCallback(
    (edgeId: string, label: string | null) => {
      setDoc((prev) => {
        if (!prev) return prev
        return {
          ...prev,
          edges: {
            ...prev.edges,
            [edgeId]: { ...prev.edges[edgeId], label },
          },
        }
      })
      postAction('edge/relabel', { path: documentPath, id: edgeId, label }).catch(() => loadDoc())
    },
    [documentPath, loadDoc]
  )

  // renderEdges merges live drag positions/sizes into notes so edges track nodes in real-time.
  // Depends on edges, doc.notes, livePositions, and liveSizes.
  const edges = doc?.edges
  const docNotes = doc?.notes
  const renderEdges = useMemo(
    () => () => {
      const d = docRef.current
      if (!d) return null

      // Merge live overrides onto stored notes
      const mergedNotes = { ...d.notes }
      for (const [id, pos] of livePositions) {
        if (mergedNotes[id]) {
          mergedNotes[id] = { ...mergedNotes[id], ...pos }
        }
      }
      for (const [id, size] of liveSizes) {
        if (mergedNotes[id]) {
          mergedNotes[id] = { ...mergedNotes[id], ...size }
        }
      }

      return (
        <>
          {Object.values(d.edges).map((edge) => (
            <FreeformEdge
              key={edge.id}
              edge={edge}
              notes={mergedNotes}
              onUpdateLabel={handleUpdateEdgeLabel}
            />
          ))}
        </>
      )
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [edges, docNotes, livePositions, liveSizes, handleUpdateEdgeLabel]
  )

  const getNodeRects = useCallback(() => {
    const d = docRef.current
    if (!d) return []
    return Object.values(d.notes)
      .filter((n) => !n.parentId)
      .map((n) => ({ id: n.id, x: n.x, y: n.y, width: n.w, height: n.h }))
  }, [])

  return (
    <div className="flex h-screen flex-col">
      {/* Header toolbar */}
      <div className="flex items-center gap-3 border-b border-gray-200 bg-white px-4 py-2 shrink-0">
        <button
          onClick={onBack}
          className="rounded-md border border-gray-300 px-3 py-1 text-sm font-medium text-gray-700 hover:bg-gray-50"
        >
          ← Back
        </button>
        <span className="text-sm text-gray-500">{documentPath}</span>
        <div className="flex-1" />
        <button
          onClick={() => createNoteRef.current()}
          className="rounded-md bg-blue-600 px-3 py-1 text-sm font-medium text-white hover:bg-blue-700"
        >
          + New Note
        </button>
      </div>

      {/* Canvas area */}
      <div className="flex-1 overflow-hidden">
        {loading && (
          <div className="flex h-full items-center justify-center text-sm text-gray-500">
            Loading…
          </div>
        )}
        {error && (
          <div className="flex h-full items-center justify-center text-sm text-red-500">
            {error}
          </div>
        )}
        {!loading && !error && doc !== null && (
          <Canvas
            ref={canvasRef}
            className="w-full h-full"
            connectionDrag={{ onConnect: handleConnect }}
            renderEdges={renderEdges}
            renderConnectionPreview={(coords) => (
              <line
                x1={coords.startX}
                y1={coords.startY}
                x2={coords.currentX}
                y2={coords.currentY}
                stroke="#94a3b8"
                strokeWidth={2}
                strokeDasharray="6 3"
                strokeLinecap="round"
              />
            )}
            boxSelect={{ getNodeRects }}
            onBackgroundPointerDown={() => clearSelectionRef.current()}
          >
            <CanvasContent
              doc={doc}
              setDoc={setDoc}
              documentPath={documentPath}
              loadDoc={loadDoc}
              clearSelectionRef={clearSelectionRef}
              createNoteRef={createNoteRef}
              livePositions={livePositions}
              setLivePositions={setLivePositions}
              liveSizes={liveSizes}
              setLiveSizes={setLiveSizes}
            />
          </Canvas>
        )}
      </div>
    </div>
  )
}
