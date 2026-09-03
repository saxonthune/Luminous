import type { ClusterDeclaration, EdgeDeclaration } from '@luminous/cactus';
import type { RayonImpulseFrame, RayonRuntimeView } from './runtime.ts';

export type RayonNodeKind = 'instruction' | 'data' | 'output' | 'boundary' | 'browser';

export interface RayonRenderNode {
  id: string;
  kind: RayonNodeKind;
  title: string;
  detail: string;
  x: number;
  y: number;
  w: number;
  h: number;
  sourceLine?: number;
  active?: boolean;
  changed?: boolean;
}

export interface RayonProjection {
  nodes: RayonRenderNode[];
  edges: EdgeDeclaration[];
  clusters: ClusterDeclaration[];
}

type NodeTemplate = Omit<RayonRenderNode, 'active' | 'changed'>;

const NETWORK_NODES: NodeTemplate[] = [
  node('output:primaryButton:1', 'output', 'Primary button', 'Primary · 0', 40, 100, 6),
  node('instruction:dispatch-primary', 'browser', 'dispatch click', 'EventTarget listener lookup', 270, 100, 8),
  node('instruction:primary-handler', 'instruction', 'call pressPrimary', 'function + lexical environment', 500, 100, 10),
  node('instruction:read-primary', 'instruction', 'read property', 'state.primaryPresses', 730, 100, 11),
  node('instruction:increment-primary', 'instruction', 'add one', 'before + 1', 960, 100, 12),
  node('instruction:write-primary', 'instruction', 'assign property', 'state.primaryPresses = after', 960, 300, 13),
  node('instruction:update-primary-output', 'instruction', 'update DOM text', 'primaryButton.textContent = …', 730, 300, 14),
  node('instruction:test-secondary', 'boundary', 'test threshold', 'after === 5', 500, 300, 16),
  node('instruction:no-secondary', 'boundary', 'skip branch', 'return to browser', 270, 300, 16),
  node('data:primaryPresses', 'data', 'state.primaryPresses', 'number: 0', 1190, 300, 1),
  node('instruction:create-secondary', 'instruction', 'create element', "document.createElement('button')", 500, 500, 17),
  node('instruction:configure-secondary', 'instruction', 'configure element', 'textContent + click listener', 730, 500, 19),
  node('instruction:append-secondary', 'instruction', 'insert element', 'output.append(button)', 960, 500, 20),
  node('instruction:dispatch-secondary', 'browser', 'dispatch click', 'EventTarget listener lookup', 1190, 700, 19),
  node('instruction:secondary-handler', 'instruction', 'call pressSecondary', 'function + lexical environment', 960, 700, 24),
  node('instruction:read-secondary', 'instruction', 'read property', 'state.secondaryCount', 730, 700, 25),
  node('instruction:increment-secondary', 'instruction', 'add one', 'secondaryCount + 1', 500, 700, 25),
  node('instruction:write-secondary', 'instruction', 'assign property', 'state.secondaryCount += 1', 500, 900, 25),
  node('instruction:update-secondary-output', 'instruction', 'update DOM text', 'event.currentTarget.textContent = …', 730, 900, 26),
  node('data:secondaryCount', 'data', 'state.secondaryCount', 'number: 0', 270, 900, 3),
];

const NETWORK_EDGES: Array<[string, string, string, string]> = [
  ['primary-native-event', 'output:primaryButton:1', 'instruction:dispatch-primary', 'native click event'],
  ['dispatch-primary-handler', 'instruction:dispatch-primary', 'instruction:primary-handler', 'calls listener'],
  ['primary-handler-read', 'instruction:primary-handler', 'instruction:read-primary', 'next instruction'],
  ['primary-state-read', 'data:primaryPresses', 'instruction:read-primary', 'supplies value'],
  ['primary-read-increment', 'instruction:read-primary', 'instruction:increment-primary', 'number'],
  ['primary-increment-write', 'instruction:increment-primary', 'instruction:write-primary', 'number'],
  ['write-primary-state', 'instruction:write-primary', 'data:primaryPresses', 'mutates'],
  ['primary-write-update', 'instruction:write-primary', 'instruction:update-primary-output', 'next instruction'],
  ['update-primary-dom', 'instruction:update-primary-output', 'output:primaryButton:1', 'mutates text'],
  ['primary-update-test', 'instruction:update-primary-output', 'instruction:test-secondary', 'next instruction'],
  ['test-stop', 'instruction:test-secondary', 'instruction:no-secondary', 'false'],
  ['test-create', 'instruction:test-secondary', 'instruction:create-secondary', 'true'],
  ['create-configure', 'instruction:create-secondary', 'instruction:configure-secondary', 'detached element'],
  ['configure-append', 'instruction:configure-secondary', 'instruction:append-secondary', 'configured element'],
  ['append-secondary-output', 'instruction:append-secondary', 'output:secondaryButton:1', 'inserts'],
  ['secondary-native-event', 'output:secondaryButton:1', 'instruction:dispatch-secondary', 'native click event'],
  ['dispatch-secondary-handler', 'instruction:dispatch-secondary', 'instruction:secondary-handler', 'calls listener'],
  ['secondary-handler-read', 'instruction:secondary-handler', 'instruction:read-secondary', 'next instruction'],
  ['secondary-state-read', 'data:secondaryCount', 'instruction:read-secondary', 'supplies value'],
  ['secondary-read-increment', 'instruction:read-secondary', 'instruction:increment-secondary', 'number'],
  ['secondary-increment-write', 'instruction:increment-secondary', 'instruction:write-secondary', 'number'],
  ['write-secondary-state', 'instruction:write-secondary', 'data:secondaryCount', 'mutates'],
  ['secondary-write-update', 'instruction:write-secondary', 'instruction:update-secondary-output', 'next instruction'],
  ['update-secondary-dom', 'instruction:update-secondary-output', 'output:secondaryButton:1', 'mutates text'],
];

export function projectRayon(view: RayonRuntimeView, activeFrame: RayonImpulseFrame | null): RayonProjection {
  const nodes: RayonRenderNode[] = NETWORK_NODES.map((template) => {
    let detail = template.detail;
    let changed = false;
    if (template.id === 'data:primaryPresses') {
      detail = `number: ${view.primaryPresses}`;
      changed = activeFrame?.patch?.primaryPresses !== undefined;
    } else if (template.id === 'data:secondaryCount') {
      detail = `number: ${view.secondaryCount}`;
      changed = activeFrame?.patch?.secondaryCount !== undefined;
    } else if (template.id === 'output:primaryButton:1') {
      detail = `Primary · ${view.primaryOutputCount}`;
      changed = activeFrame?.patch?.primaryOutputCount !== undefined;
    } else if (template.id === 'instruction:dispatch-secondary') {
      detail = view.secondaryVisible ? 'listener: pressSecondary' : 'no EventTarget yet';
    }
    return { ...template, detail, changed, active: activeFrame?.nodeId === template.id };
  });

  if (view.secondaryVisible) {
    nodes.push({
      ...node('output:secondaryButton:1', 'output', 'Secondary button', `Secondary · ${view.secondaryOutputCount}`, 1190, 500, 20),
      active: activeFrame?.nodeId === 'output:secondaryButton:1',
      changed: activeFrame?.patch?.secondaryVisible === true || activeFrame?.patch?.secondaryOutputCount !== undefined,
    });
  }

  const visibleIds = new Set(nodes.map((renderNode) => renderNode.id));
  const activeEdges = new Set([activeFrame?.viaEdgeId, activeFrame?.effectEdgeId]);
  const edges = NETWORK_EDGES
    .filter(([, sourceId, targetId]) => visibleIds.has(sourceId) && visibleIds.has(targetId))
    .filter(([id]) => id !== 'dispatch-secondary-handler' || view.secondaryVisible)
    .map(([id, sourceId, targetId, label]) => edge(id, sourceId, targetId, label, activeEdges.has(id)));

  return {
    nodes,
    edges,
    clusters: [{
      id: 'javascript-environment',
      memberIds: nodes.map((renderNode) => renderNode.id),
      label: 'browser + JavaScript runtime environment',
      tint: 'var(--color-kind-component-bg)',
    }],
  };
}

function node(
  id: string,
  kind: RayonNodeKind,
  title: string,
  detail: string,
  x: number,
  y: number,
  sourceLine: number,
): NodeTemplate {
  return { id, kind, title, detail, x, y, w: 190, h: 76, sourceLine };
}

function edge(id: string, sourceId: string, targetId: string, labelText: string, active: boolean): EdgeDeclaration {
  return {
    id,
    sourceId,
    targetId,
    labelText,
    styling: {
      arrowHead: true,
      width: active ? 3.2 : 1.35,
      colorToken: active ? 'accent' : 'edge',
    },
  };
}
