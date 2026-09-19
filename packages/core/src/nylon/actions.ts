import type { NylonBatchOperation, NylonDocument, NylonResult } from './types.ts';
import { applyNylonBatch } from './operations.ts';
import { parseNylonDocument } from './document.ts';
import { checkNylonDocument } from './check.ts';
import { doctorNylonDocument } from './doctor.ts';
import { projectNylon } from './projection.ts';
import { arrangeNylonContainer, type NylonDagDirection } from './dagArrange.ts';
import { spaceNylonContainer } from './spaceArrange.ts';
import { makeRoomForExpansion } from './makeRoom.ts';
import { nylonSelectionRoots } from './dragSelection.ts';
import { arrangeNylonStandardView } from './standardLayout.ts';

export interface NylonLayoutContext {
  collapsed?: string[];
  covered?: string[];
}

export type NylonAction = NylonBatchOperation
  | { op: 'batch'; operations: NylonBatchOperation[] }
  | { op: 'selection.move'; ids: string[]; dx: number; dy: number }
  | { op: 'layout.dag'; id: string; direction: NylonDagDirection; context?: NylonLayoutContext }
  | { op: 'layout.space'; id: string; context?: NylonLayoutContext }
  | { op: 'layout.standard'; focusId: string | null }
  | { op: 'container.expand'; id: string; context: NylonLayoutContext }
  | { op: 'document.replace'; document: NylonDocument }
  | { op: 'doctor' }
  | { op: 'undo' }
  | { op: 'redo' };

export function actionLabel(action: NylonAction): string {
  const names: Partial<Record<NylonAction['op'], string>> = {
    'layout.dag': 'DAG layout', 'layout.space': 'Space children',
    'layout.standard': 'Arrange children',
    'container.expand': 'Make room for expansion', 'selection.move': 'Move selection',
    'node.reparent': 'Reparent Node', 'node.add': 'Add Node', 'node.delete': 'Delete Node',
    differentiate: 'Differentiate', batch: 'Batch', doctor: 'Diagnose Document',
    'document.replace': 'Replace Document',
  };
  return names[action.op] ?? action.op;
}

/** Pure, environment-independent action execution. History handles undo/redo. */
export function executeNylonAction(doc: NylonDocument, action: NylonAction): NylonResult {
  try {
    if (!action || typeof action.op !== 'string') throw new Error('missing action op');
    if (!['doctor', 'document.replace', 'batch'].includes(action.op)) {
      const errors = checkNylonDocument(doc).filter((issue) => issue.severity === 'error');
      if (errors.length) return { ok: false, error: `Resolve structural issues first: ${errors.map((issue) => issue.message).join('; ')}` };
    }
    let result: NylonResult;
    switch (action.op) {
      case 'undo': case 'redo':
        throw new Error('Undo and redo require a history session');
      case 'batch':
        if (!Array.isArray(action.operations)) throw new Error('operations must be an array');
        result = applyNylonBatch(doc, action.operations);
        break;
      case 'selection.move': {
        if (!Array.isArray(action.ids) || action.ids.some((id) => typeof id !== 'string')) throw new Error('ids must be strings');
        const ids = nylonSelectionRoots(doc, [...new Set(action.ids)]);
        result = applyNylonBatch(doc, ids.map((id) => ({ op: 'node.move', id, dx: action.dx, dy: action.dy })));
        break;
      }
      case 'layout.standard':
        if (action.focusId !== null && typeof action.focusId !== 'string') throw new Error('focusId must be an ID or null');
        result = arrangeNylonStandardView(doc, action.focusId);
        break;
      case 'layout.dag': case 'layout.space': case 'container.expand': {
        const context = action.context ?? {};
        for (const values of [context.collapsed, context.covered]) {
          if (values !== undefined && (!Array.isArray(values) || values.some((id) => typeof id !== 'string'))) {
            throw new Error('container states must be arrays of IDs');
          }
        }
        const collapsed = new Set(context.collapsed);
        const covered = new Set(context.covered);
        if ([...collapsed].some((id) => covered.has(id))) throw new Error('A container cannot be covered and collapsed');
        const projection = projectNylon(doc, collapsed, undefined, undefined, covered);
        const container = projection.nodes.find((node) => node.renderId === action.id);
        if (container?.kind !== 'container') throw new Error('Parent Transformation is not visible');
        if (action.op === 'container.expand') {
          result = { ok: true, doc: makeRoomForExpansion(doc, action.id, collapsed, covered) };
        } else {
          if (!container.expanded) throw new Error('Expand the Parent Transformation before arranging its children');
          if (action.op === 'layout.dag') {
            if (!['LR', 'TD', 'RL', 'DT'].includes(action.direction)) throw new Error('Invalid DAG direction');
            result = arrangeNylonContainer(doc, projection, action.id, action.direction);
          } else result = spaceNylonContainer(doc, projection, action.id, collapsed, covered);
        }
        break;
      }
      case 'document.replace': result = { ok: true, doc: action.document }; break;
      case 'doctor': return doctorNylonDocument(doc);
      default: result = applyNylonBatch(doc, [action]);
    }
    if (!result.ok) return result;
    const parsed = parseNylonDocument(JSON.stringify(result.doc));
    if (!parsed.ok) return { ok: false, error: parsed.issues.join('; ') };
    const errors = checkNylonDocument(parsed.doc).filter((issue) => issue.severity === 'error');
    if (errors.length) return { ok: false, error: errors.map((issue) => issue.message).join('; ') };
    return { ok: true, doc: parsed.doc };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : String(error) };
  }
}
