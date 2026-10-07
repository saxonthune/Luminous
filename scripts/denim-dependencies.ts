#!/usr/bin/env node

import { readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import * as ts from 'typescript6';
import { getDenimGraph, openDenimDatabase } from '../packages/core/src/denim/database.ts';
import { readDenimBoards, type DenimAction } from '../packages/core/src/denim/actions.ts';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const [databasePathArg, boardId, actionContainerId, queryContainerId, ...extra] = process.argv.slice(2);

function fail(message: string): never {
  console.error(message);
  process.exit(1);
}

if (!databasePathArg || !boardId || !actionContainerId || !queryContainerId || extra.length) {
  fail('Usage: pnpm exec tsx scripts/denim-dependencies.ts <database.sqlite> <board-id> <action-api-container-node-id> <query-api-container-node-id>');
}

type ActionCatalogEntry = { op: string; purpose: string };
type PlannedNode = { uniqueKey: string; label: string; text: string; ownerId: string; id: string; api: 'action' | 'database' };

function unwrap(expression: ts.Expression): ts.Expression {
  let result = expression;
  while (ts.isAsExpression(result) || ts.isTypeAssertionExpression(result) || ts.isParenthesizedExpression(result)) {
    result = result.expression;
  }
  return result;
}

function propertyName(node: ts.PropertyName | undefined): string | undefined {
  if (!node) return undefined;
  if (ts.isIdentifier(node) || ts.isStringLiteral(node)) return node.text;
  return undefined;
}

function objectStringProperty(object: ts.ObjectLiteralExpression, key: string): string | undefined {
  for (const property of object.properties) {
    if (ts.isPropertyAssignment(property) && propertyName(property.name) === key
      && ts.isStringLiteral(property.initializer)) return property.initializer.text;
  }
  return undefined;
}

function callName(expression: ts.Expression): string | undefined {
  if (ts.isIdentifier(expression)) return expression.text;
  if (ts.isPropertyAccessExpression(expression)) {
    const parent = callName(expression.expression);
    return parent ? `${parent}.${expression.name.text}` : expression.name.text;
  }
  return undefined;
}

function callsIn(node: ts.Node): Set<string> {
  const calls = new Set<string>();
  const visit = (current: ts.Node): void => {
    if (ts.isCallExpression(current)) {
      const name = callName(current.expression);
      if (name) calls.add(name);
    }
    ts.forEachChild(current, visit);
  };
  visit(node);
  return calls;
}

function parseCatalog(source: ts.SourceFile): ActionCatalogEntry[] {
  for (const statement of source.statements) {
    if (!ts.isVariableStatement(statement)) continue;
    for (const declaration of statement.declarationList.declarations) {
      if (!ts.isIdentifier(declaration.name) || declaration.name.text !== 'DENIM_ACTION_CATALOG' || !declaration.initializer) continue;
      const initializer = unwrap(declaration.initializer);
      if (!ts.isArrayLiteralExpression(initializer)) continue;
      return initializer.elements.flatMap((element) => {
        const value = unwrap(element);
        if (!ts.isObjectLiteralExpression(value)) return [];
        const op = objectStringProperty(value, 'op');
        const purpose = objectStringProperty(value, 'purpose');
        return op && purpose ? [{ op, purpose }] : [];
      });
    }
  }
  throw new Error('Could not find DENIM_ACTION_CATALOG in actions.ts');
}

function parseHandlerMap(source: ts.SourceFile): Map<string, string> {
  const functions = new Map<string, ts.FunctionDeclaration>();
  for (const statement of source.statements) {
    if (ts.isFunctionDeclaration(statement) && statement.name) functions.set(statement.name.text, statement);
  }
  const handlers = new Map<string, string>();
  const apply = functions.get('applyDenimAction');
  if (!apply?.body) throw new Error('Could not find applyDenimAction in actions.ts');
  const visit = (node: ts.Node): void => {
    if (ts.isCaseClause(node) && ts.isStringLiteral(node.expression)) {
      for (const statement of node.statements) {
        if (!ts.isReturnStatement(statement) || !statement.expression || !ts.isCallExpression(statement.expression)) continue;
        const handler = callName(statement.expression.expression);
        if (handler) handlers.set(node.expression.text, handler);
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(apply.body);
  return handlers;
}

function importedDatabaseNames(source: ts.SourceFile): Set<string> {
  for (const statement of source.statements) {
    if (!ts.isImportDeclaration(statement) || !ts.isStringLiteral(statement.moduleSpecifier)
      || statement.moduleSpecifier.text !== './database.ts' || !statement.importClause?.namedBindings
      || !ts.isNamedImports(statement.importClause.namedBindings)) continue;
    return new Set(statement.importClause.namedBindings.elements.map((item) => item.name.text));
  }
  return new Set();
}

function exportedReadHelpers(source: ts.SourceFile): Map<string, ts.FunctionDeclaration> {
  const functions = new Map<string, ts.FunctionDeclaration>();
  for (const statement of source.statements) {
    if (!ts.isFunctionDeclaration(statement) || !statement.name) continue;
    functions.set(statement.name.text, statement);
  }
  const calls = new Map([...functions].map(([name, fn]) => [name, fn.body ? callsIn(fn.body) : new Set<string>()]));
  const mutating = new Set<string>();
  for (const [name, names] of calls) if (names.has('db.run')) mutating.add(name);
  let grew = true;
  while (grew) {
    grew = false;
    for (const [name, names] of calls) {
      if (!mutating.has(name) && [...names].some((called) => mutating.has(called))) {
        mutating.add(name);
        grew = true;
      }
    }
  }
  const reads = new Set<string>();
  for (const [name, names] of calls) if (names.has('rows') || names.has('db.exec')) reads.add(name);
  grew = true;
  while (grew) {
    grew = false;
    for (const [name, names] of calls) {
      if (!reads.has(name) && [...names].some((called) => reads.has(called))) {
        reads.add(name);
        grew = true;
      }
    }
  }
  const result = new Map<string, ts.FunctionDeclaration>();
  for (const statement of source.statements) {
    if (!ts.isFunctionDeclaration(statement) || !statement.name || !statement.modifiers?.some((modifier) => modifier.kind === ts.SyntaxKind.ExportKeyword)) continue;
    const name = statement.name.text;
    if (reads.has(name) && !mutating.has(name)) result.set(name, statement);
  }
  return result;
}

function queryCallsForHandler(
  handlerName: string,
  actionFunctions: Map<string, ts.FunctionDeclaration>,
  databaseImports: Set<string>,
  databaseFunctions: Map<string, ts.FunctionDeclaration>,
  readHelpers: Set<string>,
): Set<string> {
  const result = new Set<string>();
  const visitedActions = new Set<string>();
  const visitedDatabase = new Set<string>();
  const visitDatabase = (name: string): void => {
    if (visitedDatabase.has(name)) return;
    visitedDatabase.add(name);
    if (readHelpers.has(name)) result.add(name);
    const fn = databaseFunctions.get(name);
    if (!fn?.body) return;
    for (const called of callsIn(fn.body)) if (databaseFunctions.has(called)) visitDatabase(called);
  };
  const visitAction = (name: string): void => {
    if (visitedActions.has(name)) return;
    visitedActions.add(name);
    const fn = actionFunctions.get(name);
    if (!fn?.body) return;
    for (const called of callsIn(fn.body)) {
      if (databaseImports.has(called) && databaseFunctions.has(called)) visitDatabase(called);
      else if (actionFunctions.has(called)) visitAction(called);
    }
  };
  visitAction(handlerName);
  return result;
}

function databaseFunctions(source: ts.SourceFile): Map<string, ts.FunctionDeclaration> {
  const functions = new Map<string, ts.FunctionDeclaration>();
  for (const statement of source.statements) {
    if (ts.isFunctionDeclaration(statement) && statement.name) functions.set(statement.name.text, statement);
  }
  return functions;
}

function textLabel(text: string): string {
  return text.split(/\r?\n/, 1)[0]?.trim() ?? '';
}

function conceptForAction(op: string): string {
  const [area] = op.split('.');
  if (area === 'journey') return 'Journey';
  if (area === 'node') return 'Node';
  if (area === 'edge' || area === 'sequence') return 'Edge';
  if (area === 'container') return 'Container';
  if (area === 'board') return 'Board';
  throw new Error(`No concept container mapping for action ${op}`);
}

async function main(): Promise<void> {
  const actionPath = resolve(root, 'packages/core/src/denim/actions.ts');
  const databaseSourcePath = resolve(root, 'packages/core/src/denim/database.ts');
  const [actionText, databaseText, dbBytes] = await Promise.all([
    readFile(actionPath, 'utf8'),
    readFile(databaseSourcePath, 'utf8'),
    readFile(resolve(databasePathArg)),
  ]);
  const actionSource = ts.createSourceFile(actionPath, actionText, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
  const databaseSource = ts.createSourceFile(databaseSourcePath, databaseText, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
  const actionFunctions = new Map<string, ts.FunctionDeclaration>();
  for (const statement of actionSource.statements) {
    if (ts.isFunctionDeclaration(statement) && statement.name) actionFunctions.set(statement.name.text, statement);
  }
  const handlers = parseHandlerMap(actionSource);
  const catalog = parseCatalog(actionSource);
  const helperFunctions = exportedReadHelpers(databaseSource);
  const helperNames = new Set(helperFunctions.keys());
  const allDatabaseFunctions = databaseFunctions(databaseSource);
  const databaseImports = importedDatabaseNames(actionSource);
  const actionDependencies = catalog.map((entry) => {
    const handler = handlers.get(entry.op);
    if (!handler) throw new Error(`No action handler found for ${entry.op}`);
    return { ...entry, uniqueKey: `denim:action:${entry.op}`, handler,
      helpers: queryCallsForHandler(handler, actionFunctions, databaseImports, allDatabaseFunctions, helperNames) };
  });

  const database = await openDenimDatabase(dbBytes);
  try {
    const board = readDenimBoards(database).find((item) => item.id === boardId);
    if (!board) throw new Error(`Board not found: ${boardId}`);
    if (!board.containers[actionContainerId] || !board.containers[queryContainerId]) {
      throw new Error(`Board ${boardId} must have containers owned by both supplied API Nodes`);
    }
    const graph = getDenimGraph(database);
    const nodeById = new Map(graph.nodes.map((node) => [node.id, node]));
    const nodeByKey = new Map(graph.nodes.filter((node) => node.uniqueKey).map((node) => [node.uniqueKey!, node]));
    const containerOwnerByNode = new Map(graph.edges.filter((edge) => edge.type === 'contains').map((edge) => [edge.targetId, edge.sourceId]));
    const memberIds = new Map<string, string[]>();
    for (const [nodeId, ownerId] of containerOwnerByNode) memberIds.set(ownerId, [...(memberIds.get(ownerId) ?? []), nodeId]);

    const planned: PlannedNode[] = [];
    const actionNodeIds = new Map<string, string>();
    const helperNodeIds = new Map<string, string>();
    const conceptOwnerIds = new Map<string, string>();
    for (const edge of graph.edges) {
      if (edge.type !== 'contains' || edge.sourceId !== actionContainerId) continue;
      const child = nodeById.get(edge.targetId);
      if (child) conceptOwnerIds.set(textLabel(child.text), child.id);
    }
    const records = [
      ...actionDependencies.map((item) => {
        const concept = conceptForAction(item.op);
        const ownerId = conceptOwnerIds.get(concept);
        if (!ownerId || !board.containers[ownerId]) throw new Error(`Board ${boardId} has no ${concept} concept container under Action API`);
        return { uniqueKey: item.uniqueKey, label: item.op, text: `${item.op}\n${item.purpose}`, ownerId, api: 'action' as const };
      }),
      ...[...helperFunctions.keys()].sort().map((name) => ({ uniqueKey: `denim:database:${name}`, label: name, text: name, ownerId: queryContainerId, api: 'database' as const })),
    ];
    for (const item of records) {
      const keyed = nodeByKey.get(item.uniqueKey);
      const legacyMatches = (memberIds.get(item.ownerId) ?? []).map((id) => nodeById.get(id)).filter((node) =>
        node?.type === 'Module' && textLabel(node.text) === item.label);
      if (!keyed && legacyMatches.length > 1) throw new Error(`Multiple unkeyed Module nodes match ${item.label} in container ${item.ownerId}`);
      const node = keyed ?? legacyMatches[0];
      const id = node?.id ?? crypto.randomUUID();
      planned.push({ ...item, id });
      if (item.api === 'action') actionNodeIds.set(item.uniqueKey, id);
      else helperNodeIds.set(item.uniqueKey, id);
    }

    const actions: DenimAction[] = [];
    for (const node of planned) {
      actions.push({ op: 'node.upsert', id: node.id, uniqueKey: node.uniqueKey, type: 'Module', text: node.text });
    }
    const boardContainer = board.containers;
    const nextPositionIndex = new Map<string, number>();
    for (const node of planned) {
      if (!nextPositionIndex.has(node.ownerId)) nextPositionIndex.set(node.ownerId, memberIds.get(node.ownerId)?.length ?? 0);
    }
    for (const node of planned) {
      const currentOwner = containerOwnerByNode.get(node.id);
      const needsAttach = currentOwner !== node.ownerId;
      const positionMissing = !board.positions[node.id];
      const isLoaded = board.loadedNodeIds.includes(node.id);
      if (!needsAttach && !positionMissing && isLoaded) continue;
      if (needsAttach) {
        const container = boardContainer[node.ownerId]!;
        const index = nextPositionIndex.get(node.ownerId) ?? 0;
        const columns = Math.max(1, Math.floor((container.width - 24) / 196));
        const position = {
          x: container.x + 12 + (index % columns) * 196,
          y: container.y + 56 + Math.floor(index / columns) * 132,
        };
        nextPositionIndex.set(node.ownerId, index + 1);
        actions.push({ op: 'container.attach', boardId, containerNodeId: node.ownerId, nodeId: node.id, position });
      } else {
        if (positionMissing) {
          const container = boardContainer[node.ownerId]!;
          const index = nextPositionIndex.get(node.ownerId) ?? 0;
          const columns = Math.max(1, Math.floor((container.width - 24) / 196));
          actions.push({ op: 'board.node.move', boardId, nodeId: node.id, position: {
            x: container.x + 12 + (index % columns) * 196,
            y: container.y + 56 + Math.floor(index / columns) * 132,
          } });
          nextPositionIndex.set(node.ownerId, index + 1);
        }
        if (!isLoaded) actions.push({ op: 'board.node.load.set', boardId, nodeId: node.id, loaded: true });
      }
    }

    const edges = new Map<string, { sourceId: string; targetId: string; uniqueKey: string }>();
    for (const action of actionDependencies) {
      const sourceId = actionNodeIds.get(action.uniqueKey)!;
      for (const helper of action.helpers) {
        const uniqueKey = `denim:dependency:${action.uniqueKey}->denim:database:${helper}`;
        edges.set(uniqueKey, { sourceId, targetId: helperNodeIds.get(`denim:database:${helper}`)!, uniqueKey });
      }
    }
    for (const edge of edges.values()) {
      const existing = graph.edges.find((candidate) => candidate.uniqueKey === edge.uniqueKey)
        ?? graph.edges.find((candidate) => candidate.type === 'parent-child' && candidate.sourceId === edge.sourceId && candidate.targetId === edge.targetId);
      actions.push({ op: 'edge.upsert', id: existing?.id ?? crypto.randomUUID(), uniqueKey: edge.uniqueKey,
        type: 'parent-child', sourceId: edge.sourceId, targetId: edge.targetId });
    }

    console.error(`Denim dependency plan: ${planned.length} Module upserts, ${edges.size} dependency Edge upserts, ${actions.filter((action) => action.op === 'container.attach' || action.op === 'board.node.move' || action.op === 'board.node.load.set').length} Board membership/placement actions.`);
    console.log(JSON.stringify(actions, null, 2));
  } finally {
    database.close();
  }
}

void main().catch((cause: unknown) => fail(cause instanceof Error ? cause.message : String(cause)));
