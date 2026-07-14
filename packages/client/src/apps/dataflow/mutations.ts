import type { DataflowDocument, DataflowBox, DataflowAction, ContractBlock } from '@luminous/core/dataflow';
import { connect, disconnect } from '@luminous/core/dataflow';

/** Appends `-2`, `-3`, … to `base` until it is absent from `taken`. */
export function uniqueId(base: string, taken: ReadonlySet<string>): string {
  if (!taken.has(base)) return base;
  let suffix = 2;
  while (taken.has(`${base}-${suffix}`)) suffix++;
  return `${base}-${suffix}`;
}

/**
 * Core's `addBox` derives the id from the name, so it cannot produce the
 * `<id>-copy` / `new-box` ids the canvas gestures need. Building the box
 * directly on the doc shape is the documented escape hatch for that case.
 */
export function appendBox(doc: DataflowDocument, id: string, name: string): DataflowDocument {
  const box: DataflowBox = { id, name };
  return { ...doc, boxes: [...doc.boxes, box] };
}

/**
 * Duplicate `ids` as new boxes (same name/description/contract/group).
 * When `withFlows`, flows touching an original are rewired onto its copy —
 * a flow between two duplicated boxes connects the two copies, a flow to a
 * non-duplicated box connects copy → original endpoint.
 */
export function duplicateBoxes(doc: DataflowDocument, ids: string[], withFlows: boolean): DataflowDocument {
  const existingIds = new Set(doc.boxes.map((b) => b.id));
  const mapping = new Map<string, string>();
  const copies: DataflowBox[] = [];
  for (const id of ids) {
    const box = doc.boxes.find((b) => b.id === id);
    if (!box) continue;
    const newId = uniqueId(`${id}-copy`, existingIds);
    existingIds.add(newId);
    mapping.set(id, newId);
    copies.push({ ...box, id: newId });
  }
  let next: DataflowDocument = { ...doc, boxes: [...doc.boxes, ...copies] };
  if (!withFlows) return next;
  for (const flow of doc.flows) {
    const fromDup = mapping.get(flow.from);
    const toDup = mapping.get(flow.to);
    if (!fromDup && !toDup) continue;
    const result = connect(next, fromDup ?? flow.from, toDup ?? flow.to);
    if (result.ok) next = result.doc;
  }
  return next;
}

/** Insert a new box onto an existing flow: from->to becomes from->new->to. */
export function insertBoxOnFlow(doc: DataflowDocument, from: string, to: string): DataflowDocument {
  const existingIds = new Set(doc.boxes.map((b) => b.id));
  const newId = uniqueId('new-box', existingIds);
  let next = appendBox(doc, newId, 'New Box');
  const disc = disconnect(next, from, to);
  if (disc.ok) next = disc.doc;
  const c1 = connect(next, from, newId);
  if (c1.ok) next = c1.doc;
  const c2 = connect(next, newId, to);
  if (c2.ok) next = c2.doc;
  return next;
}

/** `set` actions moving every box in `oldGroup` into `newGroup` — a merge if `newGroup` already exists. */
export function groupRenameBatch(doc: DataflowDocument, oldGroup: string, newGroup: string): DataflowAction[] {
  return doc.boxes
    .filter((b) => b.group === oldGroup)
    .map((b): DataflowAction => ({ type: 'set', id: b.id, group: newGroup }));
}

/** `set` actions applying (or clearing, via `group: null`) a group over `ids`. */
export function setGroupBatch(ids: string[], group: string | null): DataflowAction[] {
  return ids.map((id): DataflowAction => ({ type: 'set', id, group }));
}

/** `removeBox` actions (cascading their flows) over `ids`. */
export function deleteBatch(ids: string[]): DataflowAction[] {
  return ids.map((id): DataflowAction => ({ type: 'removeBox', id, cascade: true }));
}

/** Raw values collected from the Box edit form. */
export interface BoxEditForm {
  name: string;
  description: string;
  contractFormat: string;
  contractText: string;
}

/**
 * Builds the `setBox` patch from a submitted edit form. An empty name falls
 * back to `previousName` (a Box always has a Name, glossary doc01.05.03); a
 * contract with both fields empty is omitted so `setBox` leaves any existing
 * contract untouched.
 */
export function buildBoxPatch(
  form: BoxEditForm,
  previousName: string,
): { name: string; description: string; contract?: ContractBlock } {
  const patch: { name: string; description: string; contract?: ContractBlock } = {
    name: form.name.trim() === '' ? previousName : form.name,
    description: form.description,
  };
  if (form.contractFormat.trim() !== '' || form.contractText.trim() !== '') {
    patch.contract = { format: form.contractFormat, text: form.contractText };
  }
  return patch;
}
