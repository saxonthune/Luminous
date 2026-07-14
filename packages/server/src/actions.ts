import { randomUUID } from "node:crypto"
import type { Document } from "./types.js"

type ActionResult = { ok: true; id?: string } | { ok: false; error: string }

export function applyActionToDoc(
  doc: Document,
  action: string,
  params: Record<string, unknown>
): ActionResult {
  switch (action) {
    case "node/add": {
      const { kind, props, tags, id: clientId } = params
      if (kind === undefined) return { ok: false, error: "missing param: kind" }
      const id = (clientId as string | undefined) ?? randomUUID()
      doc.nodes.push({
        id,
        kind: kind as string,
        props: (props as Record<string, unknown>) ?? {},
        tags: (tags as string[]) ?? [],
      })
      return { ok: true, id }
    }

    case "node/setProps": {
      const { id, props } = params
      if (id === undefined) return { ok: false, error: "missing param: id" }
      if (props === undefined) return { ok: false, error: "missing param: props" }
      const node = doc.nodes.find(n => n.id === id)
      if (!node) return { ok: false, error: `not found: ${id}` }
      node.props = { ...node.props, ...(props as Record<string, unknown>) }
      return { ok: true }
    }

    case "node/setTags": {
      const { id, tags } = params
      if (id === undefined) return { ok: false, error: "missing param: id" }
      if (tags === undefined) return { ok: false, error: "missing param: tags" }
      const node = doc.nodes.find(n => n.id === id)
      if (!node) return { ok: false, error: `not found: ${id}` }
      node.tags = tags as string[]
      return { ok: true }
    }

    case "node/delete": {
      const { id } = params
      if (id === undefined) return { ok: false, error: "missing param: id" }
      const idx = doc.nodes.findIndex(n => n.id === id)
      if (idx === -1) return { ok: false, error: `not found: ${id}` }
      doc.nodes.splice(idx, 1)
      doc.edges = doc.edges.filter(e => e.from !== id && e.to !== id)
      return { ok: true }
    }

    case "edge/add": {
      const { kind, from, to, props, tags, id: clientId } = params
      if (kind === undefined) return { ok: false, error: "missing param: kind" }
      if (from === undefined) return { ok: false, error: "missing param: from" }
      if (to === undefined) return { ok: false, error: "missing param: to" }
      if (!doc.nodes.find(n => n.id === from)) {
        return { ok: false, error: `edge endpoint not found: ${from}` }
      }
      if (!doc.nodes.find(n => n.id === to)) {
        return { ok: false, error: `edge endpoint not found: ${to}` }
      }
      const id = (clientId as string | undefined) ?? randomUUID()
      doc.edges.push({
        id,
        kind: kind as string,
        from: from as string,
        to: to as string,
        props: (props as Record<string, unknown>) ?? {},
        tags: (tags as string[]) ?? [],
      })
      return { ok: true, id }
    }

    case "edge/setProps": {
      const { id, props } = params
      if (id === undefined) return { ok: false, error: "missing param: id" }
      if (props === undefined) return { ok: false, error: "missing param: props" }
      const edge = doc.edges.find(e => e.id === id)
      if (!edge) return { ok: false, error: `not found: ${id}` }
      edge.props = { ...edge.props, ...(props as Record<string, unknown>) }
      return { ok: true }
    }

    case "edge/setTags": {
      const { id, tags } = params
      if (id === undefined) return { ok: false, error: "missing param: id" }
      if (tags === undefined) return { ok: false, error: "missing param: tags" }
      const edge = doc.edges.find(e => e.id === id)
      if (!edge) return { ok: false, error: `not found: ${id}` }
      edge.tags = tags as string[]
      return { ok: true }
    }

    case "edge/remove": {
      const { id } = params
      if (id === undefined) return { ok: false, error: "missing param: id" }
      const idx = doc.edges.findIndex(e => e.id === id)
      if (idx === -1) return { ok: false, error: `not found: ${id}` }
      doc.edges.splice(idx, 1)
      return { ok: true }
    }

    default:
      return { ok: false, error: `unknown action: ${action}` }
  }
}
