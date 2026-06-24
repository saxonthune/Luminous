/** Typed descriptor catalog for the built-in render primitives. Plain data — safe to import headless. */

export type PrimitiveCategory = 'atom' | 'layout' | 'control-flow';

export interface PropDescriptor {
  name: string;
  type: string;
  values?: string[];
  notes?: string;
}

export interface PrimitiveDescriptor {
  name: string;
  category: PrimitiveCategory;
  description: string;
  props: PropDescriptor[];
  example: string;
  /** Optional prose that follows the prop table in the generated reference. */
  notes?: string;
}

export const PRIMITIVE_DESCRIPTORS: PrimitiveDescriptor[] = [
  // ── Atoms ─────────────────────────────────────────────────────────────────

  {
    name: 'text',
    category: 'atom',
    description: 'Plain text with optional interpolation.',
    props: [
      { name: 'value', type: 'string', notes: 'Literal or `{content.fieldName}` interpolation' },
      { name: 'style', type: 'enum', values: ['heading', 'body', 'caption', 'mono'], notes: '`body` is default' },
      { name: 'tone', type: 'enum', values: ['default', 'muted', 'subtle'] },
    ],
    example: '{ "type": "text", "value": "{content.name}", "style": "heading", "tone": "default" }',
  },

  {
    name: 'badge',
    category: 'atom',
    description: 'Small inline label, typically for type annotations or status.',
    props: [
      { name: 'value', type: 'string', notes: 'Interpolated string' },
      { name: 'tone', type: 'enum', values: ['default', 'muted', 'accent', 'danger'] },
    ],
    example: '{ "type": "badge", "value": "{content.surface}", "tone": "muted" }',
  },

  {
    name: 'chip',
    category: 'atom',
    description: 'Pill-shaped reference label. Used for summary-edge endpoints — the compact representation of a node that appears on an edge rather than as a standalone card.',
    props: [
      { name: 'value', type: 'string', notes: 'Interpolated string' },
      { name: 'tone', type: 'enum', values: ['default', 'muted', 'accent', 'danger'] },
    ],
    example: '{ "type": "chip", "value": "{content.name}", "tone": "default" }',
  },

  {
    name: 'icon',
    category: 'atom',
    description: 'Named icon from the built-in icon set.',
    props: [
      { name: 'name', type: 'string', notes: 'Icon identifier from the built-in set' },
      { name: 'size', type: 'number', notes: 'Pixel size' },
    ],
    example: '{ "type": "icon", "name": "arrow-right", "size": 16 }',
  },

  {
    name: 'divider',
    category: 'atom',
    description: 'Horizontal rule with no props.',
    props: [],
    example: '{ "type": "divider" }',
  },

  {
    name: 'link',
    category: 'atom',
    description: 'Clickable text. `target` opens an external URL; `onClick: "INSPECT"` opens the node in the inspector.',
    props: [
      { name: 'value', type: 'string', notes: 'Display text' },
      { name: 'target', type: 'string', notes: 'URL opened in a new tab when clicked' },
      { name: 'onClick', type: 'string', values: ['INSPECT'], notes: 'Set to `"INSPECT"` to inspect this node instead of opening a URL' },
    ],
    example:
      '{ "type": "link", "value": "{content.docsUrl}", "target": "{content.docsUrl}" }\n' +
      '{ "type": "link", "value": "{content.name}", "onClick": "INSPECT" }',
  },

  {
    name: 'markdown',
    category: 'atom',
    description: 'Renders markdown-formatted content from a field.',
    props: [
      { name: 'value', type: 'string', notes: 'Interpolated markdown string' },
    ],
    example: '{ "type": "markdown", "value": "{content.description}" }',
  },

  {
    name: 'code-block',
    category: 'atom',
    description: 'Syntax-highlighted code.',
    props: [
      { name: 'value', type: 'string', notes: 'Interpolated code string' },
      { name: 'language', type: 'string', notes: '`typescript` · `rust` · `javascript` · etc.' },
    ],
    example: '{ "type": "code-block", "value": "{content.signature}", "language": "typescript" }',
  },

  {
    name: 'image',
    category: 'atom',
    description: 'Image from a URL field.',
    props: [
      { name: 'src', type: 'string', notes: 'Image URL' },
      { name: 'alt', type: 'string', notes: 'Alt text' },
    ],
    example: '{ "type": "image", "src": "{content.imageUrl}", "alt": "{content.name}" }',
  },

  {
    name: 'kv-list',
    category: 'atom',
    description: 'Key/value rows. Each item is a fixed-key, interpolated-value pair.',
    props: [
      { name: 'items', type: 'array', notes: 'Array of `{ key, value }` objects; values support interpolation' },
    ],
    example:
      '{\n' +
      '  "type": "kv-list",\n' +
      '  "items": [\n' +
      '    { "key": "reads",  "value": "{content.reads | join:\', \'}" },\n' +
      '    { "key": "file",   "value": "{content.filePath}" }\n' +
      '  ]\n' +
      '}',
  },

  // ── Layout ────────────────────────────────────────────────────────────────

  {
    name: 'clamp',
    category: 'layout',
    description:
      'Wraps any content region and limits it to a fixed number of visible lines. When the content overflows, the node shows a CSS ellipsis and becomes click-to-inspect (opens the inspector panel showing the full content). Use this to bound prose-heavy fields so node sizes stay predictable.\n\n' +
      '`text` with `style: "body"` or `style: "caption"` auto-clamps to 4 lines by default — explicit `clamp` wrappers are only needed when you want a different line count or want to clamp non-text content.',
    props: [
      { name: 'lines', type: 'number', notes: 'Max visible lines before ellipsis. Default: 3' },
      { name: 'children', type: 'array', notes: 'Any primitives whose combined text content may overflow' },
    ],
    example:
      '{\n' +
      '  "type": "clamp",\n' +
      '  "lines": 8,\n' +
      '  "children": [\n' +
      '    { "type": "text", "value": "{content.description}", "style": "body" }\n' +
      '  ]\n' +
      '}',
    notes: '**Inspector behaviour:** clicking an overflowed clamp region opens the inspector, which renders at full-expand (no clamp applied). No separate popover or modal is created.',
  },

  {
    name: 'vstack',
    category: 'layout',
    description: 'Vertical stack of children.',
    props: [
      { name: 'gap', type: 'number', notes: 'Spacing between children (px)' },
      { name: 'padding', type: 'number', notes: 'Inner padding (px)' },
      { name: 'align', type: 'enum', values: ['start', 'center', 'end', 'stretch'] },
      { name: 'justify', type: 'enum', values: ['start', 'center', 'end', 'space-between'] },
      { name: 'children', type: 'array', notes: 'Nested primitives' },
    ],
    example:
      '{\n' +
      '  "type": "vstack",\n' +
      '  "gap": 8,\n' +
      '  "padding": 12,\n' +
      '  "align": "start",\n' +
      '  "children": [ ... ]\n' +
      '}',
  },

  {
    name: 'hstack',
    category: 'layout',
    description: 'Horizontal stack. Same props as `vstack`.',
    props: [
      { name: 'gap', type: 'number', notes: 'Spacing between children (px)' },
      { name: 'padding', type: 'number', notes: 'Inner padding (px)' },
      { name: 'align', type: 'enum', values: ['start', 'center', 'end', 'stretch'] },
      { name: 'justify', type: 'enum', values: ['start', 'center', 'end', 'space-between'] },
      { name: 'children', type: 'array', notes: 'Nested primitives' },
    ],
    example:
      '{\n' +
      '  "type": "hstack",\n' +
      '  "gap": 6,\n' +
      '  "justify": "space-between",\n' +
      '  "children": [ ... ]\n' +
      '}',
  },

  {
    name: 'card',
    category: 'layout',
    description: 'Bordered container with optional shape. The outer frame of most node renderers.',
    props: [
      { name: 'shape', type: 'enum', values: ['rectangle', 'pill', 'diamond', 'ellipse', 'hexagon'], notes: '`rectangle` is default' },
      { name: 'padding', type: 'number', notes: 'Inner padding (px)' },
      { name: 'tone', type: 'enum', notes: 'Theme-token tone name' },
      { name: 'onClick', type: 'string', values: ['INSPECT'], notes: 'Set to `"INSPECT"` to open this node in the inspector' },
      { name: 'children', type: 'array', notes: 'Nested primitives' },
    ],
    example:
      '{\n' +
      '  "type": "card",\n' +
      '  "shape": "rectangle",\n' +
      '  "padding": 12,\n' +
      '  "tone": "default",\n' +
      '  "onClick": "INSPECT",\n' +
      '  "children": [ ... ]\n' +
      '}',
    notes: '`shape` covers flowchart-style packs: `diamond` for decisions, `pill` for start/end, `rectangle` for process steps. Shape is an attribute of the container, not a separate primitive.',
  },

  // ── Control Flow ──────────────────────────────────────────────────────────

  {
    name: 'if',
    category: 'control-flow',
    description: 'Conditional branch based on a content expression.',
    props: [
      { name: 'when', type: 'string', notes: 'Expression over `content`; truthy = render `then`' },
      { name: 'then', type: 'primitive', notes: 'Rendered when `when` is truthy' },
      { name: 'else', type: 'primitive', notes: 'Optional; rendered when `when` is falsy' },
    ],
    example:
      '{\n' +
      '  "type": "if",\n' +
      '  "when": "content.reads.length > 0",\n' +
      '  "then": { "type": "kv-list", "items": [ ... ] },\n' +
      '  "else": { "type": "text", "value": "—", "tone": "muted" }\n' +
      '}',
  },

  {
    name: 'for-each',
    category: 'control-flow',
    description: 'Repeat a template over an array field.',
    props: [
      { name: 'items', type: 'string', notes: 'Path into content resolving to an array' },
      { name: 'as', type: 'string', notes: 'Binding name available in `template` via `{as}`' },
      { name: 'template', type: 'primitive', notes: 'Rendered once per item' },
    ],
    example:
      '{\n' +
      '  "type": "for-each",\n' +
      '  "items": "content.tags",\n' +
      '  "as": "tag",\n' +
      '  "template": { "type": "badge", "value": "{tag}", "tone": "muted" }\n' +
      '}',
  },
];
