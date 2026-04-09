import { randomUUID } from "node:crypto"
import type { Document } from "./types.js"

type ActionResult = { ok: true; id?: string } | { ok: false; error: string }

export function applyActionToDoc(
  doc: Document,
  action: string,
  params: Record<string, unknown>
): ActionResult {
  switch (action) {
    case "node/create": {
      const { schemaName, parent, order, geometry, content, id: clientId } = params
      if (schemaName === undefined) return { ok: false, error: "missing param: schemaName" }
      if (order === undefined) return { ok: false, error: "missing param: order" }
      if (geometry === undefined) return { ok: false, error: "missing param: geometry" }
      const id = (clientId as string | undefined) ?? randomUUID()
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
      const { fromId, toId, label, schemaName, id: clientId } = params
      if (fromId === undefined) return { ok: false, error: "missing param: fromId" }
      if (toId === undefined) return { ok: false, error: "missing param: toId" }
      const id = (clientId as string | undefined) ?? randomUUID()
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
      return { ok: false, error: `unknown action: ${action}` }
  }
}
