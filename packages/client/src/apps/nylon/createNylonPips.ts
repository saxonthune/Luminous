import { createMemo, createSignal, type Accessor } from 'solid-js';
import { computeBounds, placeAdjacent, directRectRoute, type EdgeDeclaration, type RegisteredNodeRect, type CandidatePlacementRect } from '@luminous/cactus/layout';
import { projectNylon, EDGE_VISUAL_BAND, type NylonProjection } from '@luminous/core/nylon/projection';
import type { NylonDocument } from '@luminous/core/nylon';
import { pipFrameId, pipNodeId, type NylonPip, type NylonPipSession } from './pipSession.ts';

const rects = (projection: NylonProjection) => [...projection.nodes, ...projection.contractFrames]
  .map((n) => ({ x: n.x, y: n.y, width: n.w, height: n.h }));

function projectPip(doc: NylonDocument, pip: NylonPip) {
  const exists = doc.transformations.some((n) => n.id === pip.focusId);
  const full = exists ? projectNylon(doc, undefined, undefined, undefined, undefined,
    { kind: 'standard', focusId: pip.focusId }) : { nodes: [], contractFrames: [], edges: [] };
  const nodes = full.nodes.filter((n) => pip.showContext || !n.context);
  const visible = new Set(nodes.map((n) => n.renderId));
  const local: NylonProjection = { nodes,
    contractFrames: full.contractFrames.filter((f) => visible.has(f.inputRenderId) && visible.has(f.outputRenderId)),
    edges: full.edges.filter((e) => visible.has(e.sourceId) && visible.has(e.targetId)),
  };
  const bounds = computeBounds(rects(local), { padding: 24, minWidth: 380, minHeight: 160 });
  const frame = { x: bounds.x + pip.x, y: bounds.y + pip.y - 40, width: bounds.width, height: bounds.height + 40 };
  const id = (node: string) => pipNodeId(pip.id, node);
  const projection: NylonProjection = {
    nodes: local.nodes.map((n) => ({ ...n, renderId: id(n.renderId), x: n.x + pip.x, y: n.y + pip.y })),
    contractFrames: local.contractFrames.map((f) => ({ ...f, id: id(f.id),
      transformationId: id(f.transformationId), inputRenderId: id(f.inputRenderId), outputRenderId: id(f.outputRenderId),
      x: f.x + pip.x, y: f.y + pip.y })),
    edges: local.edges.map((edge) => ({ ...edge, id: id(edge.id), sourceId: id(edge.sourceId), targetId: id(edge.targetId),
      routeBuilder: edge.routeBuilder ? (registered) => edge.routeBuilder!(new Map(local.nodes.flatMap((n) => {
        const rect = registered.get(id(n.renderId));
        return rect ? [[n.renderId, rect] as const] : [];
      }))) : undefined })),
  };
  return { pip, frame, projection, exists, full };
}

/** Workspace navigation only; document edits remain in the shared action path. */
export function createNylonPips(doc: Accessor<NylonDocument>, main: Accessor<NylonProjection>,
  initial: NylonPipSession | undefined, reveal: (rect: CandidatePlacementRect) => void, selection: Accessor<readonly string[]> = () => []) {
  const [session, setSession] = createSignal<NylonPipSession>(initial ?? { open: [], closed: [] });
  const views = createMemo(() => session().open.map((pip) => projectPip(doc(), pip)));
  const selectionEdges = createMemo<EdgeDeclaration[]>(() => {
    const selected = new Set(selection());
    return views().flatMap((view) => {
      if (view.pip.showContext) return [];
      const nodes = new Map(view.full.nodes.map((n) => [n.renderId, n]));
      return view.full.edges.flatMap((edge) => {
        const a = nodes.get(edge.sourceId), b = nodes.get(edge.targetId);
        if (!a || !b || !!a.context === !!b.context) return [];
        const external = a.context ? a : b;
        const internal = a.context ? b : a;
        if (external.kind !== 'contract' || !selected.has(pipNodeId(view.pip.id, internal.renderId))) return [];
        const target = main().nodes.find((n) => n.kind === 'contract' && n.item.id === external.item.id);
        if (!target) return [];
        const sourceId = pipNodeId(view.pip.id, internal.renderId), targetId = target.renderId;
        return [{ id: JSON.stringify(['pip-selection', view.pip.id, edge.id]), sourceId, targetId,
          styling: { dash: 'dotted' as const, curve: 'straight' as const, width: 3, colorToken: 'fg-muted' },
          routeBuilder: (rects: ReadonlyMap<string, RegisteredNodeRect>) => {
            const source = rects.get(sourceId), dest = rects.get(targetId);
            return source && dest ? directRectRoute(source, dest, EDGE_VISUAL_BAND) : null;
          } }];
      });
    });
  });
  const projection = createMemo<NylonProjection>(() => ({
    nodes: [...main().nodes, ...views().flatMap((v) => v.projection.nodes)],
    contractFrames: [...main().contractFrames, ...views().flatMap((v) => v.projection.contractFrames)],
    edges: [...main().edges, ...selectionEdges(), ...views().flatMap((v) => v.projection.edges), ...views().map((v) => ({
      id: pipFrameId(v.pip.id), sourceId: pipNodeId(v.pip.sourceView, v.pip.sourceNode), targetId: pipFrameId(v.pip.id),
      styling: { dash: 'dotted' as const, curve: 'bezier' as const, width: 5, colorToken: 'fg-muted' },
      routeBuilder: (rects: ReadonlyMap<string, RegisteredNodeRect>) => {
        const source = rects.get(pipNodeId(v.pip.sourceView, v.pip.sourceNode));
        const target = rects.get(pipFrameId(v.pip.id));
        return source && target ? directRectRoute(source, target, EDGE_VISUAL_BAND) : null;
      },
    }))],
  }));
  function owner(renderId: string): string {
    return views().find((v) => v.projection.nodes.some((n) => n.renderId === renderId))?.pip.id ?? 'main';
  }
  function open(focusId: string, sourceRenderId: string) {
    const sourceView = owner(sourceRenderId);
    const sourceNode = sourceView === 'main' ? sourceRenderId
      : JSON.parse(sourceRenderId)[2] as string;
    const existing = views().find((v) => v.pip.sourceView === sourceView && v.pip.sourceNode === sourceNode && v.pip.focusId === focusId);
    if (existing) { reveal(existing.frame); return; }
    const pip: NylonPip = { id: crypto.randomUUID(), focusId, sourceView, sourceNode, x: 0, y: 0 };
    const view = projectPip(doc(), pip);
    const source = projection().nodes.find((n) => n.renderId === sourceRenderId);
    const preferred = source ? { x: source.x + source.w / 2 - view.frame.width / 2,
      y: source.y + source.h / 2 - view.frame.height / 2 } : { x: 0, y: 0 };
    const placed = placeAdjacent(view.frame, preferred, [...rects(main()), ...views().map((v) => v.frame)], 40);
    pip.x = placed.x - view.frame.x;
    pip.y = placed.y - view.frame.y;
    setSession((s) => ({ ...s, open: [...s.open, pip] }));
    reveal(placed);
  }
  function close(id: string) {
    const removed = new Set([id]);
    for (const p of session().open) if (removed.has(p.sourceView)) removed.add(p.id);
    setSession((s) => ({ open: s.open.filter((p) => !removed.has(p.id)),
      closed: [...s.closed, s.open.filter((p) => removed.has(p.id))] }));
  }
  function reopen() {
    const group = session().closed.at(-1);
    if (!group) return;
    setSession((s) => ({ open: [...s.open, ...group], closed: s.closed.slice(0, -1) }));
    const restored = views().find((v) => v.pip.id === group[0].id);
    if (restored) reveal(restored.frame);
  }
  function move(id: string, x: number, y: number) {
    setSession((s) => ({ ...s, open: s.open.map((p) => p.id === id ? { ...p, x, y } : p) }));
  }
  function toggleContext(id: string) {
    setSession((s) => ({ ...s, open: s.open.map((p) => p.id === id ? { ...p, showContext: !p.showContext } : p) }));
  }
  const ids = createMemo(() => session().open.map((p) => p.id));
  return { session, views, projection, owner, open, close, reopen, move, ids, toggleContext };
}
