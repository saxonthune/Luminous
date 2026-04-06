import { randomUUID } from "node:crypto"
import type { Document } from "./types.js"

type ActionResult = { ok: true; id?: string } | { ok: false; error: string }

export function applyActionToDoc(
  doc: Document,
  action: string,
  params: Record<string, unknown>
): ActionResult {
  switch (action) {
    case "note/create": {
      const id = randomUUID()
      doc.notes[id] = {
        id,
        title: (params.title as string) ?? "",
        body: (params.body as string) ?? "",
        parentId: (params.parentId as string | null) ?? null,
        x: (params.x as number) ?? 0,
        y: (params.y as number) ?? 0,
        w: (params.w as number) ?? 200,
        h: (params.h as number) ?? 150,
      }
      return { ok: true, id }
    }

    case "note/update": {
      const id = params.id as string
      const note = doc.notes[id]
      if (!note) return { ok: false, error: "not found" }
      if (params.title !== undefined) note.title = params.title as string
      if (params.body !== undefined) note.body = params.body as string
      return { ok: true }
    }

    case "note/delete": {
      const id = params.id as string
      if (!doc.notes[id]) return { ok: false, error: "not found" }
      delete doc.notes[id]
      // Remove all edges referencing this note
      for (const edgeId of Object.keys(doc.edges)) {
        const edge = doc.edges[edgeId]
        if (edge.fromId === id || edge.toId === id) {
          delete doc.edges[edgeId]
        }
      }
      // Unnest any children
      for (const note of Object.values(doc.notes)) {
        if (note.parentId === id) {
          note.parentId = null
        }
      }
      return { ok: true }
    }

    case "edge/connect": {
      const fromId = params.fromId as string
      const toId = params.toId as string
      if (!doc.notes[fromId]) return { ok: false, error: "not found" }
      if (!doc.notes[toId]) return { ok: false, error: "not found" }
      const id = randomUUID()
      doc.edges[id] = {
        id,
        fromId,
        toId,
        label: (params.label as string | null) ?? null,
      }
      return { ok: true, id }
    }

    case "edge/disconnect": {
      const id = params.id as string
      if (!doc.edges[id]) return { ok: false, error: "not found" }
      delete doc.edges[id]
      return { ok: true }
    }

    case "edge/relabel": {
      const id = params.id as string
      const edge = doc.edges[id]
      if (!edge) return { ok: false, error: "not found" }
      edge.label = (params.label as string | null) ?? null
      return { ok: true }
    }

    case "nest": {
      const childId = params.childId as string
      const parentId = params.parentId as string
      if (!doc.notes[childId]) return { ok: false, error: "not found" }
      if (!doc.notes[parentId]) return { ok: false, error: "not found" }
      doc.notes[childId].parentId = parentId
      return { ok: true }
    }

    case "unnest": {
      const childId = params.childId as string
      if (!doc.notes[childId]) return { ok: false, error: "not found" }
      doc.notes[childId].parentId = null
      return { ok: true }
    }

    case "node/move": {
      const id = params.id as string
      const note = doc.notes[id]
      if (!note) return { ok: false, error: "not found" }
      note.x = params.x as number
      note.y = params.y as number
      return { ok: true }
    }

    case "node/resize": {
      const id = params.id as string
      const note = doc.notes[id]
      if (!note) return { ok: false, error: "not found" }
      note.w = params.w as number
      note.h = params.h as number
      return { ok: true }
    }

    default:
      return { ok: false, error: `unknown action: ${action}` }
  }
}
