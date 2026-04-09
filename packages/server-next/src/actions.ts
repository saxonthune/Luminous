import { randomUUID } from "node:crypto"
import type { Document, DocumentV2 } from "./types.js"

type ActionResult = { ok: true; id?: string } | { ok: false; error: string }

/** Replace literal \n and \t escape sequences with real whitespace */
function unescapeText(s: string): string {
  return s.replace(/\\n/g, "\n").replace(/\\t/g, "\t")
}

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
        type: 'note',
        title: (params.title as string) ?? "",
        body: unescapeText((params.body as string) ?? ""),
        parentId: (params.parentId as string | null) ?? null,
        x: (params.x as number) ?? 0,
        y: (params.y as number) ?? 0,
        w: (params.w as number) ?? 200,
        h: (params.h as number) ?? 150,
        kind: (params.kind as string | undefined),
      }
      return { ok: true, id }
    }

    case "portal/create": {
      const id = randomUUID()
      doc.notes[id] = {
        id,
        type: 'portal',
        title: (params.title as string) ?? "",
        canvasRef: (params.canvasRef as string) ?? "",
        parentId: (params.parentId as string | null) ?? null,
        x: (params.x as number) ?? 0,
        y: (params.y as number) ?? 0,
        w: (params.w as number) ?? 400,
        h: (params.h as number) ?? 300,
      }
      return { ok: true, id }
    }

    case "note/update": {
      const id = params.id as string
      const node = doc.notes[id]
      if (!node) return { ok: false, error: "not found" }
      if (node.type === 'note') {
        if (params.title !== undefined) node.title = params.title as string
        if (params.body !== undefined) node.body = unescapeText(params.body as string)
      } else if (node.type === 'portal') {
        if (params.title !== undefined) node.title = params.title as string
        if (params.canvasRef !== undefined) node.canvasRef = params.canvasRef as string
      }
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

export function applyV2ActionToDoc(
  doc: DocumentV2,
  action: string,
  params: Record<string, unknown>
): ActionResult {
  switch (action) {
    case "node/create": {
      const { schemaName, parent, order, geometry, content } = params
      if (schemaName === undefined) return { ok: false, error: "missing param: schemaName" }
      if (order === undefined) return { ok: false, error: "missing param: order" }
      if (geometry === undefined) return { ok: false, error: "missing param: geometry" }
      const id = randomUUID()
      doc.structure[id] = {
        id,
        schemaName: schemaName as string,
        parent: (parent as string | null) ?? null,
        order: order as string,
        geometry: geometry as { x: number; y: number; w: number; h: number },
      }
      doc.content[id] = (content as Record<string, unknown>) ?? {}
      return { ok: true, id }
    }

    case "node/setContent": {
      const { id, fields } = params
      if (id === undefined) return { ok: false, error: "missing param: id" }
      if (fields === undefined) return { ok: false, error: "missing param: fields" }
      if (!doc.structure[id as string]) return { ok: false, error: "not found" }
      doc.content[id as string] = {
        ...(doc.content[id as string] ?? {}),
        ...(fields as Record<string, unknown>),
      }
      return { ok: true }
    }

    case "node/setParent": {
      const { id, parent, order } = params
      if (id === undefined) return { ok: false, error: "missing param: id" }
      if (order === undefined) return { ok: false, error: "missing param: order" }
      const node = doc.structure[id as string]
      if (!node) return { ok: false, error: "not found" }
      node.parent = (parent as string | null) ?? null
      node.order = order as string
      return { ok: true }
    }

    case "node/setOrder": {
      const { id, order } = params
      if (id === undefined) return { ok: false, error: "missing param: id" }
      if (order === undefined) return { ok: false, error: "missing param: order" }
      const node = doc.structure[id as string]
      if (!node) return { ok: false, error: "not found" }
      node.order = order as string
      return { ok: true }
    }

    case "node/setGeometry": {
      const { id, geometry } = params
      if (id === undefined) return { ok: false, error: "missing param: id" }
      if (geometry === undefined) return { ok: false, error: "missing param: geometry" }
      const node = doc.structure[id as string]
      if (!node) return { ok: false, error: "not found" }
      node.geometry = geometry as { x: number; y: number; w: number; h: number }
      return { ok: true }
    }

    case "node/delete": {
      const { id } = params
      if (id === undefined) return { ok: false, error: "missing param: id" }
      if (!doc.structure[id as string]) return { ok: false, error: "not found" }
      delete doc.structure[id as string]
      delete doc.content[id as string]
      // Re-parent any node whose parent === id to null
      for (const node of Object.values(doc.structure)) {
        if (node.parent === id) {
          node.parent = null
        }
      }
      // Remove edges referencing this id
      for (const edgeId of Object.keys(doc.edges)) {
        const edge = doc.edges[edgeId]
        if (edge.fromId === id || edge.toId === id) {
          delete doc.edges[edgeId]
        }
      }
      return { ok: true }
    }

    case "edge/connect": {
      const { fromId, toId, label, schemaName } = params
      if (fromId === undefined) return { ok: false, error: "missing param: fromId" }
      if (toId === undefined) return { ok: false, error: "missing param: toId" }
      const id = randomUUID()
      doc.edges[id] = {
        id,
        fromId: fromId as string,
        toId: toId as string,
        label: (label as string | null) ?? null,
        ...(schemaName !== undefined ? { schemaName: schemaName as string } : {}),
      }
      return { ok: true, id }
    }

    case "edge/disconnect": {
      const { id } = params
      if (id === undefined) return { ok: false, error: "missing param: id" }
      if (!doc.edges[id as string]) return { ok: false, error: "not found" }
      delete doc.edges[id as string]
      return { ok: true }
    }

    case "edge/relabel": {
      const { id, label } = params
      if (id === undefined) return { ok: false, error: "missing param: id" }
      const edge = doc.edges[id as string]
      if (!edge) return { ok: false, error: "not found" }
      edge.label = (label as string | null) ?? null
      return { ok: true }
    }

    case "schema/define": {
      const { schema } = params
      if (schema === undefined) return { ok: false, error: "missing param: schema" }
      const s = schema as { name: string; [key: string]: unknown }
      if (!s.name) return { ok: false, error: "missing param: schema.name" }
      doc.schemas[s.name] = s as unknown as import("./types.js").Schema
      return { ok: true }
    }

    case "schema/delete": {
      const { name } = params
      if (name === undefined) return { ok: false, error: "missing param: name" }
      delete doc.schemas[name as string]
      return { ok: true }
    }

    default:
      return { ok: false, error: `unknown v2 action: ${action}` }
  }
}
