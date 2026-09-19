import type {
  AddContractOptions,
  AddTransformationOptions,
  DifferentiateOptions,
  InsertArcOptions,
  NylonDocument,
  NylonBatchOperation,
  NylonResult,
  UpdateNylonNodeOptions,
} from './types.ts';
import { checkNylonDocument } from './check.ts';
import { parseNylonDocument } from './document.ts';

function uniqueId(doc: NylonDocument, base: string): string {
  const ids = new Set([
    ...doc.transformations.map((item) => item.id),
    ...doc.contracts.map((item) => item.id),
  ]);
  if (!ids.has(base)) return base;
  let suffix = 2;
  while (ids.has(`${base}-${suffix}`)) suffix += 1;
  return `${base}-${suffix}`;
}

function nodeExists(doc: NylonDocument, id: string): boolean {
  return doc.transformations.some((item) => item.id === id) || doc.contracts.some((item) => item.id === id);
}

function normalizedParent(parent: string | null | undefined): string | undefined {
  return parent === null ? undefined : parent;
}

function validateParent(doc: NylonDocument, parent: string | undefined): string | null {
  if (parent === undefined) return null;
  return doc.transformations.some((item) => item.id === parent)
    ? null
    : `Parent Transformation "${parent}" not found`;
}

function validateCoordinates(x: number | undefined, y: number | undefined): string | null {
  if (x !== undefined && !Number.isFinite(x)) return 'Node x coordinate must be a finite number';
  if (y !== undefined && !Number.isFinite(y)) return 'Node y coordinate must be a finite number';
  return null;
}

/** Replace P→T→P with P→Tₐ₁→Pₐ→Tₐ₂→P. The original
 * Transformation remains as the parent container and ceases to be an Arc endpoint. */
export function differentiateTransformation(
  doc: NylonDocument,
  id: string,
  options: DifferentiateOptions = {},
): NylonResult {
  const parent = doc.transformations.find((item) => item.id === id);
  if (parent === undefined) return { ok: false, error: `Transformation "${id}" not found` };
  const hasChildren = [...doc.transformations, ...doc.contracts].some((item) => item.parent === id);
  if (hasChildren) return { ok: false, error: `Transformation "${id}" is already differentiated` };

  const firstId = uniqueId(doc, `${id}-a1`);
  const middleId = uniqueId(doc, `${id}-a`);
  const secondId = uniqueId(doc, `${id}-a2`);
  const incoming = doc.arcs.filter((arc) => arc.kind !== 'control' && arc.to === id);
  const outgoing = doc.arcs.filter((arc) => arc.kind !== 'control' && arc.from === id);
  const kept = doc.arcs.filter((arc) => arc.kind === 'control' || (arc.from !== id && arc.to !== id));

  return {
    ok: true,
    doc: {
      ...doc,
      transformations: [
        ...doc.transformations,
        {
          id: firstId,
          name: options.firstName ?? `${parent.name} · first part`,
          prose: '',
          needs: [],
          parent: id,
          x: 42,
          y: 80,
        },
        {
          id: secondId,
          name: options.secondName ?? `${parent.name} · second part`,
          prose: '',
          needs: [],
          parent: id,
          x: 462,
          y: 80,
        },
      ],
      contracts: [
        ...doc.contracts,
        {
          id: middleId,
          name: options.contractName ?? `${parent.name} intermediate`,
          text: '',
          parent: id,
          x: 262,
          y: 115,
        },
      ],
      arcs: [
        ...kept,
        ...incoming.map((arc) => ({ ...arc, to: firstId })),
        { from: firstId, to: middleId },
        { from: middleId, to: secondId },
        ...outgoing.map((arc) => ({ ...arc, from: secondId })),
      ],
    },
  };
}

export function addNylonTransformation(doc: NylonDocument, options: AddTransformationOptions): NylonResult {
  if (nodeExists(doc, options.id)) return { ok: false, error: `Node "${options.id}" already exists` };
  const coordinateError = validateCoordinates(options.x, options.y);
  if (coordinateError) return { ok: false, error: coordinateError };
  const parent = normalizedParent(options.parent);
  const parentError = validateParent(doc, parent);
  if (parentError) return { ok: false, error: parentError };
  return {
    ok: true,
    doc: {
      ...doc,
      transformations: [...doc.transformations, {
        id: options.id,
        name: options.name,
        ...(options.prose === undefined ? {} : { prose: options.prose }),
        ...(options.needs === undefined ? {} : { needs: options.needs }),
        ...(parent === undefined ? {} : { parent }),
        ...(options.x === undefined ? {} : { x: options.x }),
        ...(options.y === undefined ? {} : { y: options.y }),
      }],
    },
  };
}

export function addNylonContract(doc: NylonDocument, options: AddContractOptions): NylonResult {
  if (nodeExists(doc, options.id)) return { ok: false, error: `Node "${options.id}" already exists` };
  const coordinateError = validateCoordinates(options.x, options.y);
  if (coordinateError) return { ok: false, error: coordinateError };
  const parent = normalizedParent(options.parent);
  const parentError = validateParent(doc, parent);
  if (parentError) return { ok: false, error: parentError };
  return {
    ok: true,
    doc: {
      ...doc,
      contracts: [...doc.contracts, {
        id: options.id,
        name: options.name,
        ...(options.kind === undefined ? {} : { kind: options.kind }),
        ...(options.text === undefined ? {} : { text: options.text }),
        ...(parent === undefined ? {} : { parent }),
        ...(options.x === undefined ? {} : { x: options.x }),
        ...(options.y === undefined ? {} : { y: options.y }),
      }],
    },
  };
}

export function updateNylonNode(doc: NylonDocument, id: string, patch: UpdateNylonNodeOptions): NylonResult {
  const transformation = doc.transformations.find((item) => item.id === id);
  const contract = doc.contracts.find((item) => item.id === id);
  if (!transformation && !contract) return { ok: false, error: `Node "${id}" not found` };
  if (transformation && (patch.text !== undefined || patch.kind !== undefined)) {
    return { ok: false, error: 'A Transformation cannot carry Contract text or kind' };
  }
  if (contract && (patch.prose !== undefined || patch.needs !== undefined)) {
    return { ok: false, error: 'A Contract cannot carry Transformation prose or needs' };
  }
  return {
    ok: true,
    doc: {
      ...doc,
      transformations: doc.transformations.map((item) => item.id === id ? {
        ...item,
        ...(patch.name === undefined ? {} : { name: patch.name }),
        ...(patch.prose === undefined ? {} : { prose: patch.prose }),
        ...(patch.needs === undefined ? {} : { needs: patch.needs }),
      } : item),
      contracts: doc.contracts.map((item) => item.id === id ? {
        ...item,
        ...(patch.name === undefined ? {} : { name: patch.name }),
        ...(patch.kind === undefined ? {} : { kind: patch.kind }),
        ...(patch.text === undefined ? {} : { text: patch.text }),
      } : item),
    },
  };
}

export function reparentNylonNode(doc: NylonDocument, id: string, parentOption: string | null): NylonResult {
  if (!nodeExists(doc, id)) return { ok: false, error: `Node "${id}" not found` };
  const parent = normalizedParent(parentOption);
  const parentError = validateParent(doc, parent);
  if (parentError) return { ok: false, error: parentError };
  const candidate = {
    ...doc,
    transformations: doc.transformations.map((item) => item.id === id ? { ...item, parent } : item),
    contracts: doc.contracts.map((item) => item.id === id ? { ...item, parent } : item),
  };
  const errors = checkNylonDocument(candidate).filter((issue) => issue.severity === 'error');
  if (errors.length) return { ok: false, error: errors.map((issue) => issue.message).join('; ') };

  const allItems = new Map<string, NylonDocument['transformations'][number] | NylonDocument['contracts'][number]>([
    ...doc.transformations.map((item) => [item.id, item] as const),
    ...doc.contracts.map((item) => [item.id, item] as const),
  ]);
  const absolutePosition = (nodeId: string): { x: number; y: number } => {
    let x = 0;
    let y = 0;
    let item = allItems.get(nodeId);
    const seen = new Set<string>();
    while (item !== undefined && !seen.has(item.id)) {
      seen.add(item.id);
      x += item.x ?? 0;
      y += item.y ?? 0;
      item = item.parent === undefined ? undefined : allItems.get(item.parent);
    }
    return { x, y };
  };
  const before = absolutePosition(id);
  const parentPosition = parent === undefined ? { x: 0, y: 0 } : absolutePosition(parent);
  const withParent = <T extends { parent?: string; x?: number; y?: number }>(item: T): T => {
    const { parent: _oldParent, ...rest } = item;
    return {
      ...rest,
      ...(parent === undefined ? {} : { parent }),
      x: before.x - parentPosition.x,
      y: before.y - parentPosition.y,
    } as T;
  };
  return {
    ok: true,
    doc: {
      ...doc,
      transformations: doc.transformations.map((item) => item.id === id ? withParent(item) : item),
      contracts: doc.contracts.map((item) => item.id === id ? withParent(item) : item),
    },
  };
}

function nodeKind(doc: NylonDocument, id: string): 'transformation' | 'contract' | null {
  if (doc.transformations.some((item) => item.id === id)) return 'transformation';
  if (doc.contracts.some((item) => item.id === id)) return 'contract';
  return null;
}

export function addNylonArc(doc: NylonDocument, from: string, to: string): NylonResult {
  // Graph validity is diagnosed by the shared catalog after the action/batch.
  // Keep incomplete or semantically questionable connections editable like JSON.
  return { ok: true, doc: { ...doc, arcs: [...doc.arcs, { from, to }] } };
}

export function removeNylonArc(doc: NylonDocument, from: string, to: string): NylonResult {
  const matches = doc.arcs.filter((arc) => arc.from === from && arc.to === to).length;
  if (matches === 0) return { ok: false, error: `Arc "${from}" -> "${to}" not found` };
  if (matches > 1) return { ok: false, error: `Arc "${from}" -> "${to}" is ambiguous` };
  return { ok: true, doc: { ...doc, arcs: doc.arcs.filter((arc) => arc.from !== from || arc.to !== to) } };
}

export function replaceNylonArc(
  doc: NylonDocument,
  oldFrom: string,
  oldTo: string,
  newFrom: string,
  newTo: string,
): NylonResult {
  if (doc.arcs.some((arc) => arc.from === oldFrom && arc.to === oldTo && arc.kind === 'control')) {
    return { ok: false, error: 'Edit Control Arc endpoints in JSON; endpoint-pair replacement is only for Data Arcs' };
  }
  const removed = removeNylonArc(doc, oldFrom, oldTo);
  return removed.ok ? addNylonArc(removed.doc, newFrom, newTo) : removed;
}

function depthAndParent(doc: NylonDocument, id: string): { depth: number; parent: string | undefined } | null {
  const node = [...doc.transformations, ...doc.contracts].find((item) => item.id === id);
  if (!node) return null;
  const transformations = new Map(doc.transformations.map((item) => [item.id, item]));
  let depth = 0;
  let current = node.parent;
  const seen = new Set<string>();
  while (current !== undefined && !seen.has(current)) {
    seen.add(current);
    depth += 1;
    current = transformations.get(current)?.parent;
  }
  return { depth, parent: node.parent };
}

export function insertNylonArc(
  doc: NylonDocument,
  from: string,
  to: string,
  options: InsertArcOptions,
): NylonResult {
  if (doc.arcs.some((arc) => arc.from === from && arc.to === to && arc.kind === 'control')) {
    return { ok: false, error: 'Edit Control Arcs in JSON; alternating-path insertion is only for Data Arcs' };
  }
  if (!doc.arcs.some((arc) => arc.from === from && arc.to === to)) {
    return { ok: false, error: `Arc "${from}" -> "${to}" not found` };
  }
  const fromInfo = depthAndParent(doc, from);
  const toInfo = depthAndParent(doc, to);
  if (!fromInfo || !toInfo) return { ok: false, error: 'Arc endpoint not found' };

  let parent: string | undefined;
  if (options.parent !== undefined) {
    parent = normalizedParent(options.parent);
  } else if (fromInfo.depth > toInfo.depth) {
    parent = fromInfo.parent;
  } else if (toInfo.depth > fromInfo.depth) {
    parent = toInfo.parent;
  } else if (fromInfo.parent === toInfo.parent) {
    parent = fromInfo.parent;
  } else {
    return { ok: false, error: 'Arc endpoints have the same depth and different parents; supply --parent' };
  }
  const parentError = validateParent(doc, parent);
  if (parentError) return { ok: false, error: parentError };

  const withTransformation = addNylonTransformation(doc, { ...options.transformation, parent });
  if (!withTransformation.ok) return withTransformation;
  const withContract = addNylonContract(withTransformation.doc, { ...options.contract, parent });
  if (!withContract.ok) return withContract;
  const withoutArc = removeNylonArc(withContract.doc, from, to);
  if (!withoutArc.ok) return withoutArc;

  const fromKind = nodeKind(doc, from);
  const insertedArcs = fromKind === 'contract'
    ? [
        { from, to: options.transformation.id },
        { from: options.transformation.id, to: options.contract.id },
        { from: options.contract.id, to },
      ]
    : [
        { from, to: options.contract.id },
        { from: options.contract.id, to: options.transformation.id },
        { from: options.transformation.id, to },
      ];
  return { ok: true, doc: { ...withoutArc.doc, arcs: [...withoutArc.doc.arcs, ...insertedArcs] } };
}

export function setNylonContractPair(
  doc: NylonDocument,
  transformationId: string,
  input: string,
  output: string,
): NylonResult {
  if (!doc.transformations.some((item) => item.id === transformationId)) {
    return { ok: false, error: `Transformation "${transformationId}" not found` };
  }
  return {
    ok: true,
    doc: {
      ...doc,
      transformations: doc.transformations.map((item) => item.id === transformationId
        ? { ...item, contractPair: { input, output } }
        : item),
    },
  };
}

export function clearNylonContractPair(doc: NylonDocument, transformationId: string): NylonResult {
  const transformation = doc.transformations.find((item) => item.id === transformationId);
  if (!transformation) return { ok: false, error: `Transformation "${transformationId}" not found` };
  if (!transformation.contractPair) return { ok: false, error: `Transformation "${transformationId}" has no Contract Pair` };
  return {
    ok: true,
    doc: {
      ...doc,
      transformations: doc.transformations.map((item) => {
        if (item.id !== transformationId) return item;
        const { contractPair: _pair, ...rest } = item;
        return rest;
      }),
    },
  };
}

export function deleteNylonNode(doc: NylonDocument, id: string, cascade = false): NylonResult {
  if (!nodeExists(doc, id)) return { ok: false, error: `Node "${id}" not found` };
  const removed = new Set<string>([id]);
  if (cascade) {
    let changed = true;
    while (changed) {
      changed = false;
      for (const item of [...doc.transformations, ...doc.contracts]) {
        if (item.parent && removed.has(item.parent) && !removed.has(item.id)) {
          removed.add(item.id);
          changed = true;
        }
      }
    }
  } else {
    if ([...doc.transformations, ...doc.contracts].some((item) => item.parent === id)) {
      return { ok: false, error: `Node "${id}" has Children; use --cascade` };
    }
    if (doc.arcs.some((arc) => arc.from === id || arc.to === id)) {
      return { ok: false, error: `Node "${id}" has Arcs; use --cascade` };
    }
    if (doc.transformations.some((item) => item.contractPair?.input === id || item.contractPair?.output === id)) {
      return { ok: false, error: `Node "${id}" belongs to a Contract Pair; use --cascade` };
    }
  }
  return {
    ok: true,
    doc: {
      ...doc,
      transformations: doc.transformations.filter((item) => !removed.has(item.id)).map((item) => {
        if (!item.contractPair || (!removed.has(item.contractPair.input) && !removed.has(item.contractPair.output))) return item;
        const { contractPair: _pair, ...rest } = item;
        return rest;
      }),
      contracts: doc.contracts.filter((item) => !removed.has(item.id)),
      arcs: doc.arcs.filter((arc) => !removed.has(arc.from) && !removed.has(arc.to)),
    },
  };
}

/** Translate one item in its stored coordinate frame. Descendants of a Parent
 * Transformation follow through parent-relative projection without writes. */
export function translateNylonItem(
  doc: NylonDocument,
  id: string,
  dx: number,
  dy: number,
): NylonResult {
  if (!Number.isFinite(dx) || !Number.isFinite(dy)) {
    return { ok: false, error: 'Translation must use finite numbers' };
  }

  const exists = doc.transformations.some((item) => item.id === id)
    || doc.contracts.some((item) => item.id === id);
  if (!exists) return { ok: false, error: `Item "${id}" not found` };

  return {
    ok: true,
    doc: {
      ...doc,
      transformations: doc.transformations.map((item) => item.id === id
        ? { ...item, x: (item.x ?? 0) + dx, y: (item.y ?? 0) + dy }
        : item),
      contracts: doc.contracts.map((item) => item.id === id
        ? { ...item, x: (item.x ?? 0) + dx, y: (item.y ?? 0) + dy }
        : item),
    },
  };
}

/** Translate both halves of one Transformation's Contract Pair. */
export function translateNylonContractPair(
  doc: NylonDocument,
  transformationId: string,
  dx: number,
  dy: number,
): NylonResult {
  if (!Number.isFinite(dx) || !Number.isFinite(dy)) {
    return { ok: false, error: 'Translation must use finite numbers' };
  }
  const transformation = doc.transformations.find((item) => item.id === transformationId);
  if (!transformation) return { ok: false, error: `Transformation "${transformationId}" not found` };
  if (!transformation.contractPair) {
    return { ok: false, error: `Transformation "${transformationId}" has no Contract Pair` };
  }
  const ids = new Set([transformation.contractPair.input, transformation.contractPair.output]);
  return {
    ok: true,
    doc: {
      ...doc,
      contracts: doc.contracts.map((item) => ids.has(item.id)
        ? { ...item, x: (item.x ?? 0) + dx, y: (item.y ?? 0) + dy }
        : item),
    },
  };
}

/** Apply an ordered operation list as one transaction. Intermediate Documents
 * may be structurally invalid; only the final Document must parse and check. */
export function applyNylonBatch(
  doc: NylonDocument,
  operations: readonly NylonBatchOperation[],
): NylonResult {
  let current = doc;
  for (const [index, operation] of operations.entries()) {
    let result: NylonResult;
    try {
      switch (operation.op) {
        case 'node.add':
          if (!['transformation', 'contract'].includes(operation.nodeKind)) throw new Error('Invalid nodeKind');
          result = operation.nodeKind === 'transformation'
            ? addNylonTransformation(current, operation.node)
            : addNylonContract(current, operation.node);
          break;
        case 'node.update':
          result = updateNylonNode(current, operation.id, operation.patch);
          break;
        case 'node.reparent':
          if (operation.parent !== null && typeof operation.parent !== 'string') throw new Error('parent must be an ID or null');
          result = reparentNylonNode(current, operation.id, operation.parent);
          break;
        case 'node.move':
          result = translateNylonItem(current, operation.id, operation.dx, operation.dy);
          break;
        case 'node.delete':
          if (operation.cascade !== undefined && typeof operation.cascade !== 'boolean') throw new Error('cascade must be a boolean');
          result = deleteNylonNode(current, operation.id, operation.cascade ?? false);
          break;
        case 'arc.add':
          result = addNylonArc(current, operation.from, operation.to);
          break;
        case 'arc.remove':
          result = removeNylonArc(current, operation.from, operation.to);
          break;
        case 'arc.replace':
          result = replaceNylonArc(current, operation.oldFrom, operation.oldTo, operation.newFrom, operation.newTo);
          break;
        case 'arc.insert':
          result = insertNylonArc(current, operation.from, operation.to, operation.options);
          break;
        case 'contract-pair.set':
          result = setNylonContractPair(current, operation.transformationId, operation.input, operation.output);
          break;
        case 'contract-pair.clear':
          result = clearNylonContractPair(current, operation.transformationId);
          break;
        case 'contract-pair.move':
          result = translateNylonContractPair(current, operation.transformationId, operation.dx, operation.dy);
          break;
        case 'differentiate':
          result = differentiateTransformation(current, operation.id, operation.options);
          break;
        default: {
          const unknownOperation: never = operation;
          return { ok: false, error: `Batch operation ${index + 1} has unknown op "${String((unknownOperation as { op?: unknown }).op)}"` };
        }
      }
    } catch (error) {
      return {
        ok: false,
        error: `Batch operation ${index + 1} (${operation?.op ?? 'unknown'}) is malformed: ${error instanceof Error ? error.message : String(error)}`,
      };
    }
    if (!result.ok) {
      return { ok: false, error: `Batch operation ${index + 1} (${operation.op}) failed: ${result.error}` };
    }
    current = result.doc;
  }

  const parsed = parseNylonDocument(JSON.stringify(current));
  if (!parsed.ok) return { ok: false, error: `Batch produced an invalid Document: ${parsed.issues.join('; ')}` };
  const errors = checkNylonDocument(parsed.doc).filter((issue) => issue.severity === 'error');
  if (errors.length > 0) {
    return { ok: false, error: `Batch produced an invalid Document: ${errors.map((issue) => issue.message).join('; ')}` };
  }
  return { ok: true, doc: parsed.doc };
}
