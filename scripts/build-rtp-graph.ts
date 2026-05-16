// Pipeline: RTP navigation statechart + concept catalog → .canvases/rtp-statechart.graph.json
import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';

// Inline ID derivation functions — mirrors rtp-statechart.pack.json idTemplate fields.
const regionKind   = { idDerivation: ({ name }: { name: string }) => `region.${name}` };
const compositeKind = { idDerivation: ({ path }: { path: string }) => `composite.${path}` };
const stateKind    = { idDerivation: ({ path }: { path: string }) => `state.${path}` };
const transitionNodeKind = { idDerivation: ({ sourceStateId, event }: { sourceStateId: string; event: string }) => `transition.${sourceStateId}.${event}` };
const conceptKind  = { idDerivation: ({ normalizedName }: { normalizedName: string }) => `concept.${normalizedName}` };
const actionKind   = { idDerivation: ({ conceptId, actionName }: { conceptId: string; actionName: string }) => `action.${conceptId}.${actionName}` };

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');

// ── Types ─────────────────────────────────────────────────────────────────────

interface ActionEntry {
  name: string;
  signature: string;
  description: string;
}

interface ConceptEntry {
  name: string;
  normalizedName: string;
  purpose: string;
  state: string;
  operationalPrinciple: string;
  actions: ActionEntry[];
}

interface ConceptsJson {
  concepts: ConceptEntry[];
}

interface CanvasNode {
  id: string;
  kind: string;
  props: Record<string, unknown>;
  tags: string[];
}

interface CanvasEdge {
  id: string;
  kind: string;
  from: string;
  to: string;
  props: Record<string, unknown>;
  tags: string[];
}

interface XStateTransition {
  target?: string;
  description: string;
  actions?: string[];
}

interface XStateNode {
  description?: string;
  type?: string;
  initial?: string;
  tags?: string[];
  meta?: { surface?: string; reads?: string[] };
  on?: Record<string, XStateTransition>;
  states?: Record<string, XStateNode>;
}

// ── Step 1: Markdown → JSON ───────────────────────────────────────────────────

const MARKDOWN_PATH = path.join(ROOT, '.carta/02-design/10-examples/03-concepts.markdown');
const JSON_PATH = path.join(ROOT, '.carta/02-design/10-examples/03-concepts.json');

function parseConceptsMarkdown(text: string): ConceptsJson {
  const sections = text.split(/^(?=## \d+\. )/m).filter(s => /^## \d+\. /.test(s));

  const concepts: ConceptEntry[] = sections.map(block => {
    const name = block.split('\n')[0].replace(/^## \d+\. /, '').trim();
    const normalizedName = name.replace(/\s+/g, '');

    const between = (start: string, end: string): string => {
      const si = block.indexOf(start);
      if (si === -1) return '';
      const content = block.slice(si + start.length);
      const ei = end ? content.indexOf(end) : content.length;
      return (ei === -1 ? content : content.slice(0, ei)).trim();
    };

    const purpose = between('**Purpose.**', '**State.**');
    const state = between('**State.**', '**Actions.**');
    const operationalPrinciple = between('**Operational principle.**', '**Notes.**')
      || between('**Operational principle.**', '\n---');

    const actionsBlock = between('**Actions.**', '**Operational principle.**');
    const actions: ActionEntry[] = [];
    for (const line of actionsBlock.split('\n')) {
      if (!line.match(/^-\s+`/)) continue;
      const sepIdx = line.search(/\s+[—–]\s+/);
      if (sepIdx === -1) continue;
      const sigPart = line.slice(0, sepIdx);
      const description = line.slice(sepIdx).replace(/^\s+[—–]\s+/, '').trim();
      const sigRe = /`([^`]+)`/g;
      let sm;
      while ((sm = sigRe.exec(sigPart)) !== null) {
        const signature = sm[1];
        const actionName = signature.replace(/\(.*\)$/, '');
        actions.push({ name: actionName, signature, description });
      }
    }

    return { name, normalizedName, purpose, state, operationalPrinciple, actions };
  });

  return { concepts };
}

function ensureConceptsJson(): ConceptsJson {
  const markdownStat = fs.statSync(MARKDOWN_PATH);

  if (fs.existsSync(JSON_PATH)) {
    const jsonStat = fs.statSync(JSON_PATH);
    if (jsonStat.mtimeMs >= markdownStat.mtimeMs) {
      return JSON.parse(fs.readFileSync(JSON_PATH, 'utf8')) as ConceptsJson;
    }
  }

  const text = fs.readFileSync(MARKDOWN_PATH, 'utf8');
  const result = parseConceptsMarkdown(text);

  if (result.concepts.length !== 4) {
    process.stderr.write(`error: expected 4 concepts, got ${result.concepts.length}\n`);
    process.exit(1);
  }
  for (const c of result.concepts) {
    if (!c.purpose || !c.state || !c.operationalPrinciple) {
      process.stderr.write(`error: empty field on concept "${c.name}"\n`);
      process.exit(1);
    }
  }

  fs.writeFileSync(JSON_PATH, JSON.stringify(result, null, 2) + '\n', 'utf8');
  process.stderr.write(`[info] wrote ${path.relative(ROOT, JSON_PATH)}\n`);

  return result;
}

// ── Steps 2–3: Walk XState tree ───────────────────────────────────────────────

function buildStatechartGraph(
  statechart: XStateNode,
  nodes: CanvasNode[],
  edges: CanvasEdge[],
): void {
  // First pass: collect path → id for target resolution
  const pathToId = new Map<string, string>();

  function collectPaths(states: Record<string, XStateNode>, prefix: string): void {
    for (const [name, node] of Object.entries(states)) {
      const p = prefix ? `${prefix}.${name}` : name;
      const isRegion = !prefix;
      const hasChildren = !!node.states && Object.keys(node.states).length > 0;

      let id: string;
      if (isRegion) {
        id = regionKind.idDerivation({ name: p });
      } else if (hasChildren) {
        id = compositeKind.idDerivation({ path: p });
      } else {
        id = stateKind.idDerivation({ path: p });
      }
      pathToId.set(p, id);

      if (node.states) collectPaths(node.states, p);
    }
  }

  collectPaths(statechart.states!, '');

  function resolveTarget(target: string, siblingPath: string): string | undefined {
    const fullPath = target.startsWith('#rtp-navigation.')
      ? target.slice('#rtp-navigation.'.length)
      : siblingPath ? `${siblingPath}.${target}` : target;
    return pathToId.get(fullPath);
  }

  function walkStates(
    states: Record<string, XStateNode>,
    parentId: string,
    siblingPath: string,
    isRegionLevel: boolean,
  ): void {
    for (const [name, node] of Object.entries(states)) {
      const p = siblingPath ? `${siblingPath}.${name}` : name;
      const hasChildren = !!node.states && Object.keys(node.states).length > 0;

      let nodeId: string;

      if (isRegionLevel) {
        nodeId = regionKind.idDerivation({ name: p });
        nodes.push({
          id: nodeId,
          kind: 'statechart.region',
          props: {
            description: node.description ?? '',
            ...(node.initial !== undefined ? { initial: node.initial } : {}),
          },
          tags: node.tags ?? [],
        });
      } else if (hasChildren) {
        nodeId = compositeKind.idDerivation({ path: p });
        nodes.push({
          id: nodeId,
          kind: 'statechart.composite',
          props: {
            description: node.description ?? '',
            tags: node.tags ?? [],
            ...(node.initial !== undefined ? { initial: node.initial } : {}),
            parallel: node.type === 'parallel',
          },
          tags: node.tags ?? [],
        });
      } else {
        nodeId = stateKind.idDerivation({ path: p });
        nodes.push({
          id: nodeId,
          kind: 'statechart.state',
          props: {
            description: node.description ?? '',
            tags: node.tags ?? [],
            ...(node.meta?.surface !== undefined ? { surface: node.meta.surface } : {}),
            ...(node.meta?.reads !== undefined ? { reads: node.meta.reads } : {}),
          },
          tags: node.tags ?? [],
        });
      }

      // Substate-of edge (regions have no parent — root is skipped)
      if (parentId) {
        edges.push({
          id: `edge.substate-of.${nodeId}`,
          kind: 'statechart.substate-of',
          from: nodeId,
          to: parentId,
          props: {},
          tags: [],
        });
      }

      // Transition nodes + edges
      if (node.on) {
        for (const [event, transition] of Object.entries(node.on)) {
          const transNodeId = transitionNodeKind.idDerivation({ sourceStateId: nodeId, event });
          nodes.push({
            id: transNodeId,
            kind: 'statechart.transition',
            props: {
              event,
              description: transition.description ?? '',
              actions: transition.actions ?? [],
            },
            tags: [],
          });

          if (transition.target) {
            const targetId = resolveTarget(transition.target, siblingPath);
            if (!targetId) {
              process.stderr.write(
                `[warn] unresolved target "${transition.target}" from ${p}.on.${event}\n`,
              );
            } else {
              edges.push({
                id: `edge.transition.${nodeId}.${targetId}.${event}`,
                kind: 'statechart.transition',
                from: nodeId,
                to: targetId,
                props: {},
                tags: [],
              });
            }
          }
        }
      }

      if (node.states) {
        walkStates(node.states, nodeId, p, false);
      }
    }
  }

  // Top-level states of root (nav, overlay) are regions; root itself is skipped
  walkStates(statechart.states!, '', '', true);
}

// ── Step 4: Emit concepts and actions ─────────────────────────────────────────

function buildConceptGraph(
  concepts: ConceptEntry[],
  nodes: CanvasNode[],
  edges: CanvasEdge[],
): void {
  for (const concept of concepts) {
    const cid = conceptKind.idDerivation({ normalizedName: concept.normalizedName });
    nodes.push({
      id: cid,
      kind: 'rtp.concept',
      props: {
        name: concept.name,
        purpose: concept.purpose,
        state: concept.state,
        operationalPrinciple: concept.operationalPrinciple,
      },
      tags: [],
    });

    for (const action of concept.actions) {
      const aid = actionKind.idDerivation({ conceptId: cid, actionName: action.name });
      nodes.push({
        id: aid,
        kind: 'rtp.action',
        props: {
          name: action.name,
          signature: action.signature,
          description: action.description,
          conceptId: cid,
        },
        tags: [],
      });
      edges.push({
        id: `edge.belongs-to-concept.${aid}`,
        kind: 'rtp.belongs-to-concept',
        from: aid,
        to: cid,
        props: {},
        tags: [],
      });
    }
  }
}

// ── Step 5: Wire invokes-action edges ─────────────────────────────────────────

function wireInvokesAction(nodes: CanvasNode[], edges: CanvasEdge[]): void {
  // (normalizedConceptName).(actionName) → action node
  const actionByKey = new Map<string, CanvasNode>();
  for (const n of nodes) {
    if (n.kind !== 'rtp.action') continue;
    const cid = n.props['conceptId'] as string;
    const normalizedName = cid.replace(/^concept\./, '');
    actionByKey.set(`${normalizedName}.${n.props['name'] as string}`, n);
  }

  const conceptByNorm = new Map<string, CanvasNode>();
  for (const n of nodes) {
    if (n.kind !== 'rtp.concept') continue;
    conceptByNorm.set((n.props['name'] as string).replace(/\s+/g, ''), n);
  }

  const synthNodes: CanvasNode[] = [];
  const synthEdges: CanvasEdge[] = [];

  for (const n of nodes) {
    if (n.kind !== 'statechart.transition') continue;
    for (const actionStr of (n.props['actions'] as string[])) {
      const dot = actionStr.indexOf('.');
      if (dot === -1) continue;
      const normalizedName = actionStr.slice(0, dot);
      const actionName = actionStr.slice(dot + 1);
      const key = `${normalizedName}.${actionName}`;

      let actionNode = actionByKey.get(key);

      if (!actionNode) {
        process.stderr.write(`[synthesized] ${actionStr}\n`);

        let conceptNode = conceptByNorm.get(normalizedName);
        if (!conceptNode) {
          const cid = conceptKind.idDerivation({ normalizedName });
          conceptNode = {
            id: cid,
            kind: 'rtp.concept',
            props: { name: normalizedName, purpose: '', state: '', operationalPrinciple: '' },
            tags: [],
          };
          synthNodes.push(conceptNode);
          conceptByNorm.set(normalizedName, conceptNode);
        }

        const cid = conceptNode.id;
        const aid = actionKind.idDerivation({ conceptId: cid, actionName });
        actionNode = {
          id: aid,
          kind: 'rtp.action',
          props: { name: actionName, signature: actionName, description: '', conceptId: cid },
          tags: [],
        };
        synthNodes.push(actionNode);
        actionByKey.set(key, actionNode);
        synthEdges.push({
          id: `edge.belongs-to-concept.${aid}`,
          kind: 'rtp.belongs-to-concept',
          from: aid,
          to: cid,
          props: {},
          tags: [],
        });
      }

      synthEdges.push({
        id: `edge.invokes-action.${n.id}.${actionNode.id}`,
        kind: 'statechart.invokes-action',
        from: n.id,
        to: actionNode.id,
        props: {},
        tags: [],
      });
    }
  }

  nodes.push(...synthNodes);
  edges.push(...synthEdges);
}

// ── Main ──────────────────────────────────────────────────────────────────────

const concepts = ensureConceptsJson();

const statechart = JSON.parse(
  fs.readFileSync(
    path.join(ROOT, '.carta/02-design/10-examples/03-navigation.statechart.json'),
    'utf8',
  ),
) as XStateNode;

const nodes: CanvasNode[] = [];
const edges: CanvasEdge[] = [];

buildStatechartGraph(statechart, nodes, edges);
buildConceptGraph(concepts.concepts, nodes, edges);
wireInvokesAction(nodes, edges);

// Deterministic output
nodes.sort((a, b) => a.id.localeCompare(b.id));
edges.sort((a, b) => a.id.localeCompare(b.id));

const canvas = {
  version: 3,
  pack: 'rtp-statechart',
  nodes,
  edges,
  defaultView: 'statechart',
};

const outDir = path.join(ROOT, '.canvases');
if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });

const outPath = path.join(outDir, 'rtp-statechart.graph.json');
fs.writeFileSync(outPath, JSON.stringify(canvas, null, 2) + '\n', 'utf8');
process.stderr.write(
  `[info] wrote ${path.relative(ROOT, outPath)} (${nodes.length} nodes, ${edges.length} edges)\n`,
);
