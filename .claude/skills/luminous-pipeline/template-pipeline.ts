/**
 * Template: Pipeline script for producing a Luminous graph.json + pack.json.
 *
 * Replace every <DOMAIN> placeholder with your domain's vocabulary.
 * This template is modelled on scripts/build-rtp-graph.ts in the Luminous repo.
 *
 * Usage (Node.js / tsx):
 *   npx tsx template-pipeline.ts
 *   node --import=tsx/esm template-pipeline.ts
 *
 * Output: .canvases/<DOMAIN>.graph.json  (and .canvases/<DOMAIN>.pack.json if uncommented)
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..'); // adjust to reach your repo root

// ── Types ─────────────────────────────────────────────────────────────────────

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

// ── ID derivation ─────────────────────────────────────────────────────────────
//
// Derive stable IDs from source content so re-running the pipeline produces a
// diffable update, not duplicates. Never use random UUIDs.
//
// Patterns:
//   file-scoped:  `kind.filePath:name`  e.g. "signal.src/App.tsx:count"
//   tree-path:    `kind.parent.child`   e.g. "state.nav.home"
//   edge:         `edge.edgeKind.fromId.toId`

const nodeId = {
  // Replace with your domain's ID derivation functions.
  // Example: a "component" identified by its file path and export name.
  component: (filePath: string, name: string) =>
    `component.${filePath}:${name}`,

  // Example: a "signal" identified by the component that creates it and its variable name.
  signal: (componentId: string, variableName: string) =>
    `signal.${componentId}.${variableName}`,
};

const edgeId = {
  renders: (from: string, to: string) => `edge.renders.${from}.${to}`,
  creates: (from: string, to: string) => `edge.creates.${from}.${to}`,
};

// ── Step 1: Parse source artifacts ────────────────────────────────────────────
//
// Read and parse whatever source the domain provides: AST output, JSON config,
// markdown files, etc. Return typed data structures for downstream steps.
//
// Keep this step pure — no side effects beyond reading files.

interface ParsedComponent {
  name: string;
  filePath: string;
  signals: string[];
  renders: string[]; // names of child components rendered
}

function parseSourceArtifacts(rootDir: string): ParsedComponent[] {
  // Replace with real parsing logic:
  //   - TypeScript compiler API for .tsx files
  //   - JSON.parse for manifest/config files
  //   - markdown parsing for docs
  //
  // Example stub returning hardcoded data:
  void rootDir;
  return [
    {
      name: 'App',
      filePath: 'src/App.tsx',
      signals: ['count', 'user'],
      renders: ['Header', 'Footer'],
    },
    {
      name: 'Header',
      filePath: 'src/Header.tsx',
      signals: [],
      renders: [],
    },
    {
      name: 'Footer',
      filePath: 'src/Footer.tsx',
      signals: [],
      renders: [],
    },
  ];
}

// ── Step 2: Build node array ──────────────────────────────────────────────────
//
// Walk the parsed data and emit one CanvasNode per entity.
// Every node must have a stable id (from nodeId.*), a kind matching the pack,
// props matching the kind's JSON Schema, and a (possibly empty) tags array.

function buildNodes(components: ParsedComponent[]): CanvasNode[] {
  const nodes: CanvasNode[] = [];

  for (const comp of components) {
    const cid = nodeId.component(comp.filePath, comp.name);

    nodes.push({
      id: cid,
      kind: 'domain.component', // replace with your pack's nodeKind id
      props: {
        name: comp.name,
        filePath: comp.filePath,
      },
      tags: [],
    });

    for (const sig of comp.signals) {
      const sid = nodeId.signal(cid, sig);
      nodes.push({
        id: sid,
        kind: 'domain.signal', // replace with your pack's nodeKind id
        props: {
          name: sig,
          componentId: cid,
        },
        tags: [],
      });
    }
  }

  return nodes;
}

// ── Step 3: Build edge array ──────────────────────────────────────────────────
//
// Walk the parsed data and emit one CanvasEdge per relationship.
// Edge ids follow: `edge.edgeKind.fromId.toId`.
// Resolve cross-references (name → node id) using the node array or a lookup map.

function buildEdges(
  components: ParsedComponent[],
  allNodes: CanvasNode[],
): CanvasEdge[] {
  const edges: CanvasEdge[] = [];

  // Build a lookup: component name → component node id
  const componentIdByName = new Map<string, string>();
  for (const node of allNodes) {
    if (node.kind === 'domain.component') {
      componentIdByName.set(node.props['name'] as string, node.id);
    }
  }

  for (const comp of components) {
    const fromId = nodeId.component(comp.filePath, comp.name);

    // renders edges
    for (const childName of comp.renders) {
      const toId = componentIdByName.get(childName);
      if (!toId) {
        process.stderr.write(`[warn] unresolved component "${childName}" rendered by "${comp.name}"\n`);
        continue;
      }
      edges.push({
        id: edgeId.renders(fromId, toId),
        kind: 'domain.renders',
        from: fromId,
        to: toId,
        props: {},
        tags: [],
      });
    }

    // creates edges (component → its signals)
    for (const sig of comp.signals) {
      const toId = nodeId.signal(fromId, sig);
      edges.push({
        id: edgeId.creates(fromId, toId),
        kind: 'domain.creates',
        from: fromId,
        to: toId,
        props: {},
        tags: [],
      });
    }
  }

  return edges;
}

// ── Pack definition ───────────────────────────────────────────────────────────
//
// The pack.json that gives the graph its visual vocabulary.
// Write this to a sibling file sharing the same basename as the graph.
//
// If you only need generic boxes and arrows, delete this and set
// "pack": "primitives" in the graph object below. No pack.json needed.
//
// See primitives-reference.md for the full render vocabulary.

const PACK_ID = 'domain'; // change to your domain name

// Disclosure levels are fixed: 'peek' | 'card' | 'open' | 'deep'.
// `render` is a MAP keyed by those levels — NOT a flat render tree.
const ZOOM_TO_LEVEL = [
  { minZoom: 0,   level: 'peek' },
  { minZoom: 0.4, level: 'card' },
  { minZoom: 1.2, level: 'open' },
  { minZoom: 3.0, level: 'deep' },
];

const pack = {
  id: PACK_ID,
  version: '0.1.0',
  description: 'Replace with a description of this pack.',

  nodeKinds: [
    {
      id: 'domain.component',
      label: 'Component',
      props: {
        type: 'object',
        properties: {
          name:     { type: 'string' },
          filePath: { type: 'string' },
        },
        required: ['name'],
        additionalProperties: false,
      },
      // idTemplate is optional — used only for interactive (MCP) node creation.
      // A pipeline writes node ids directly, so this is irrelevant to pipeline output.
      idTemplate: 'component.{name}',
      // render: map of disclosure level -> RenderNode tree. Author what you need.
      render: {
        card: {
          type: 'card', shape: 'rectangle', padding: 12,
          children: [
            {
              type: 'hstack', gap: 6, justify: 'space-between',
              children: [
                { type: 'text', value: '{content.name}', style: 'heading' },
                { type: 'badge', value: 'component', tone: 'muted' },
              ],
            },
            { type: 'text', value: '{content.filePath}', style: 'caption', tone: 'muted' },
          ],
        },
      },
    },
    {
      id: 'domain.signal',
      label: 'Signal',
      props: {
        type: 'object',
        properties: {
          name: { type: 'string' },
          componentId: { type: 'string' },
        },
        required: ['name'],
        additionalProperties: false,
      },
      idTemplate: 'signal.{name}',
      render: {
        card: {
          type: 'card', shape: 'rectangle', padding: 8,
          children: [
            { type: 'text', value: '{content.name}', style: 'body' },
            { type: 'badge', value: 'signal', tone: 'accent' },
          ],
        },
      },
    },
  ],

  edgeKinds: [
    {
      id: 'domain.renders',
      label: 'renders',
      directed: true,
      props: { type: 'object', additionalProperties: false },
      // Optional endpoint constraints; omit if any node may connect.
      acceptsSource: ['domain.component'],
      acceptsTarget: ['domain.component'],
      // No `render` — edges are drawn from their view role (arrow/contain/summary).
    },
    {
      id: 'domain.creates',
      label: 'creates',
      directed: true,
      props: { type: 'object', additionalProperties: false },
      acceptsSource: ['domain.component'],
      acceptsTarget: ['domain.signal'],
    },
  ],

  views: [
    {
      id: 'component-tree',
      name: 'Component Tree',          // field is `name`, not `label`
      description: 'Components nested by what they render.',
      zoomToLevel: ZOOM_TO_LEVEL,
      nodeRoles: {                     // map of nodeKind id -> role
        'domain.component': 'spatial',
        'domain.signal':    'latent',
      },
      edgeRoles: {                     // map of edgeKind id -> role
        'domain.renders': 'contain',
        'domain.creates': 'hidden',
      },
      layers: {},
      layout: { algorithm: 'elk' },
    },
    {
      id: 'reactivity',
      name: 'Reactivity',
      description: 'Components and the signals they create.',
      zoomToLevel: ZOOM_TO_LEVEL,
      nodeRoles: {
        'domain.component': 'spatial',
        'domain.signal':    'spatial',
      },
      edgeRoles: {
        'domain.renders': 'hidden',
        'domain.creates': 'arrow',
      },
      layers: {},
      layout: { algorithm: 'force' },
    },
  ],

  layers: [],          // toggleable overlays; leave empty for a v1 pack
  disclosure: [        // which props are visible at each level
    {
      kind: 'domain.component',
      peek: ['name'],
      card: ['name', 'filePath'],
      open: ['name', 'filePath'],
      deep: ['name', 'filePath'],
    },
    {
      kind: 'domain.signal',
      peek: ['name'],
      card: ['name'],
      open: ['name', 'componentId'],
      deep: ['name', 'componentId'],
    },
  ],
};

// ── Main ──────────────────────────────────────────────────────────────────────

const components = parseSourceArtifacts(ROOT);

const nodes = buildNodes(components);
const edges = buildEdges(components, nodes);

// Deterministic output — stable diffs across runs
nodes.sort((a, b) => a.id.localeCompare(b.id));
edges.sort((a, b) => a.id.localeCompare(b.id));

const graph = {
  version: 3,
  pack: PACK_ID,       // set to "primitives" if skipping pack authoring
  nodes,
  edges,
  defaultView: 'component-tree',
};

const outDir = path.join(ROOT, '.canvases');
fs.mkdirSync(outDir, { recursive: true });

const graphPath = path.join(outDir, `${PACK_ID}.graph.json`);
fs.writeFileSync(graphPath, JSON.stringify(graph, null, 2) + '\n', 'utf8');
process.stderr.write(
  `[info] wrote ${path.relative(ROOT, graphPath)} (${nodes.length} nodes, ${edges.length} edges)\n`,
);

// Write pack.json — comment this out if using "pack": "primitives"
const packPath = path.join(outDir, `${PACK_ID}.pack.json`);
fs.writeFileSync(packPath, JSON.stringify(pack, null, 2) + '\n', 'utf8');
process.stderr.write(`[info] wrote ${path.relative(ROOT, packPath)}\n`);
