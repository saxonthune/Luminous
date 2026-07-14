import type { ContractBlock, DataflowAction, DataflowDocument } from './types.ts';

export type DataflowResult =
  | { ok: true; doc: DataflowDocument }
  | { ok: false; error: string };

function kebabCase(name: string): string {
  return name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function uniqueId(base: string, existingIds: Set<string>): string {
  if (!existingIds.has(base)) return base;
  let suffix = 2;
  while (existingIds.has(`${base}-${suffix}`)) suffix++;
  return `${base}-${suffix}`;
}

export function addBox(
  doc: DataflowDocument,
  fields: { name: string; description?: string; contract?: ContractBlock; group?: string },
): DataflowResult {
  const existingIds = new Set(doc.boxes.map(b => b.id));
  const base = kebabCase(fields.name);
  const id = uniqueId(base, existingIds);
  const box: DataflowDocument['boxes'][number] = { id, name: fields.name };
  if (fields.description !== undefined) box.description = fields.description;
  if (fields.contract !== undefined) box.contract = fields.contract;
  if (fields.group !== undefined) box.group = fields.group;
  return { ok: true, doc: { ...doc, boxes: [...doc.boxes, box] } };
}

export function setBox(
  doc: DataflowDocument,
  id: string,
  fields: { name?: string; description?: string; contract?: ContractBlock; group?: string | null },
): DataflowResult {
  const index = doc.boxes.findIndex(b => b.id === id);
  if (index === -1) {
    return { ok: false, error: `box "${id}" does not exist` };
  }
  const box = { ...doc.boxes[index] };
  if (fields.name !== undefined) box.name = fields.name;
  if (fields.description !== undefined) box.description = fields.description;
  if (fields.contract !== undefined) box.contract = fields.contract;
  if (fields.group === null) {
    delete box.group;
  } else if (fields.group !== undefined) {
    box.group = fields.group;
  }
  const boxes = [...doc.boxes];
  boxes[index] = box;
  return { ok: true, doc: { ...doc, boxes } };
}

export function connect(doc: DataflowDocument, from: string, to: string): DataflowResult {
  const boxIds = new Set(doc.boxes.map(b => b.id));
  if (!boxIds.has(from)) {
    return { ok: false, error: `box "${from}" does not exist` };
  }
  if (!boxIds.has(to)) {
    return { ok: false, error: `box "${to}" does not exist` };
  }
  if (doc.flows.some(f => f.from === from && f.to === to)) {
    return { ok: false, error: `flow from "${from}" to "${to}" already exists` };
  }
  return { ok: true, doc: { ...doc, flows: [...doc.flows, { from, to }] } };
}

export function disconnect(doc: DataflowDocument, from: string, to: string): DataflowResult {
  const index = doc.flows.findIndex(f => f.from === from && f.to === to);
  if (index === -1) {
    return { ok: false, error: `flow from "${from}" to "${to}" does not exist` };
  }
  const flows = [...doc.flows];
  flows.splice(index, 1);
  return { ok: true, doc: { ...doc, flows } };
}

export function removeBox(
  doc: DataflowDocument,
  id: string,
  opts?: { cascade?: boolean },
): DataflowResult {
  if (!doc.boxes.some(b => b.id === id)) {
    return { ok: false, error: `box "${id}" does not exist` };
  }
  const attachedFlows = doc.flows.filter(f => f.from === id || f.to === id);
  if (attachedFlows.length > 0 && !opts?.cascade) {
    return { ok: false, error: `box "${id}" has attached flows; pass { cascade: true } to remove them` };
  }
  return {
    ok: true,
    doc: {
      ...doc,
      boxes: doc.boxes.filter(b => b.id !== id),
      flows: doc.flows.filter(f => f.from !== id && f.to !== id),
    },
  };
}

export function applyDataflowBatch(doc: DataflowDocument, actions: DataflowAction[]): DataflowResult {
  let current = doc;
  for (const action of actions) {
    let result: DataflowResult;
    switch (action.type) {
      case 'addBox':
        result = addBox(current, {
          name: action.name,
          description: action.description,
          contract: action.contract,
          group: action.group,
        });
        break;
      case 'set':
        result = setBox(current, action.id, {
          name: action.name,
          description: action.description,
          contract: action.contract,
          group: action.group,
        });
        break;
      case 'connect':
        result = connect(current, action.from, action.to);
        break;
      case 'disconnect':
        result = disconnect(current, action.from, action.to);
        break;
      case 'removeBox':
        result = removeBox(current, action.id, { cascade: action.cascade });
        break;
    }
    if (!result.ok) {
      return { ok: false, error: result.error };
    }
    current = result.doc;
  }
  return { ok: true, doc: current };
}
