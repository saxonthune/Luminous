#!/usr/bin/env tsx
/**
 * Generates .claude/skills/luminous-pipeline/primitives-reference.md from
 * the typed descriptor catalog in packages/core/src/render/primitive-descriptors.ts.
 *
 * Usage: pnpm exec tsx scripts/gen-primitives-reference.ts
 *        (or: just gen-skill-reference)
 */

import { writeFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { join, dirname } from 'path';
import type { PrimitiveDescriptor, PropDescriptor } from '../packages/core/src/render/primitive-descriptors.ts';
import { PRIMITIVE_DESCRIPTORS } from '../packages/core/src/render/primitive-descriptors.ts';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = join(ROOT, '.claude/skills/luminous-pipeline/primitives-reference.md');

// ── Fixed trailing sections ───────────────────────────────────────────────────

const BIND_SECTION = `### \`bind\`

Implicit — content interpolation is written as \`"{content.fieldName}"\` directly in any \`value\` prop. The interpreter resolves it at render time. No explicit \`bind\` primitive is needed.`;

const STYLE_SECTION = `## Style References

Use theme-token names rather than literal CSS values for colors and spacing. Theme switching cascades automatically.

Common tokens:
- Tones: \`default\`, \`muted\`, \`subtle\`, \`accent\`, \`danger\`
- Backgrounds: \`surface\`, \`surface-alt\`, \`surface-raised\`
- Foregrounds: \`fg\`, \`fg-muted\`, \`fg-subtle\``;

const EVENTS_SECTION = `## Events

\`onClick\` takes a string. The interpreter handles exactly one value today: **\`"INSPECT"\`**, which opens the node in the inspector (the node's id is passed automatically).

\`\`\`json
{ "type": "card", "onClick": "INSPECT" }
\`\`\`

Any other string is accepted but currently does nothing — a future dispatch bus will route them. Do not invent event names; use \`"INSPECT"\` or omit \`onClick\`.`;

const WORKED_EXAMPLE_SECTION = `## Worked Example — a complete nodeKind render

Note that \`render\` is a **map keyed by disclosure level** (\`peek\` / \`card\` / \`open\` / \`deep\`).
Each level's value is a RenderNode tree. This example authors two levels:

\`\`\`json
{
  "id": "solid.component",
  "label": "Component",
  "props": {
    "type": "object",
    "properties": {
      "name":     { "type": "string" },
      "filePath": { "type": "string" },
      "props":    { "type": "array", "items": { "type": "string" } }
    }
  },
  "render": {
    "peek": { "type": "text", "value": "{content.name}", "style": "heading" },
    "card": {
      "type": "card", "shape": "rectangle", "padding": 12,
      "children": [
        {
          "type": "hstack", "gap": 6, "justify": "space-between",
          "children": [
            { "type": "text", "value": "{content.name}", "style": "heading" },
            { "type": "badge", "value": "component", "tone": "muted" }
          ]
        },
        { "type": "text", "value": "{content.filePath}", "style": "caption", "tone": "muted" },
        {
          "type": "if",
          "when": "content.props.length > 0",
          "then": {
            "type": "for-each",
            "items": "content.props",
            "as": "prop",
            "template": { "type": "chip", "value": "{prop}", "tone": "default" }
          }
        }
      ]
    }
  }
}
\`\`\``;

// ── Rendering helpers ─────────────────────────────────────────────────────────

function renderPropTable(props: PropDescriptor[]): string {
  const header = '| Prop | Type | Values / Notes |\n|------|------|----------------|';
  const rows = props.map(p => {
    const valuesStr = p.values ? p.values.join(' · ') : '';
    const notesStr = p.notes ?? '';
    const cell = [valuesStr, notesStr].filter(Boolean).join(' — ');
    return `| \`${p.name}\` | ${p.type} | ${cell} |`;
  });
  return [header, ...rows].join('\n');
}

function renderPrimitive(d: PrimitiveDescriptor): string {
  const parts: string[] = [];
  parts.push(`### \`${d.name}\``);
  parts.push('');
  parts.push(d.description);
  parts.push('');
  parts.push('```json');
  parts.push(d.example);
  parts.push('```');
  if (d.props.length > 0) {
    parts.push('');
    parts.push(renderPropTable(d.props));
  }
  if (d.notes) {
    parts.push('');
    parts.push(d.notes);
  }
  return parts.join('\n');
}

// ── Main ──────────────────────────────────────────────────────────────────────

const BANNER =
  '<!-- GENERATED FILE — do not edit by hand. ' +
  'Source: packages/core/src/render/primitive-descriptors.ts. ' +
  'Regenerate with `just gen-skill-reference`. -->';

const INTRO = `# Primitive Vocabulary Reference

Source of truth: \`.carta/02-design/16-renderer-engine.md\` (doc02.16). This file is a condensed agent-facing catalog. If the two diverge, the source doc wins.

The primitive vocabulary is the fixed set of building blocks a pack author composes in each kind's \`render\` field. The interpreter in \`@luminous/core\` executes these; pack authors only write JSON.`;

const CATEGORY_INTROS: Record<string, string> = {
  atom: 'Atoms are leaf nodes in the render tree — they paint content directly.',
  layout: 'Layout primitives are containers. They have `children` arrays of other primitives.',
  'control-flow': '',
};

const CATEGORY_HEADINGS: Record<string, string> = {
  atom: '## Atoms',
  layout: '## Layout',
  'control-flow': '## Control Flow',
};

function generate(): string {
  const sections: string[] = [BANNER, '', INTRO];

  const byCategory = new Map<string, PrimitiveDescriptor[]>();
  for (const d of PRIMITIVE_DESCRIPTORS) {
    const list = byCategory.get(d.category) ?? [];
    list.push(d);
    byCategory.set(d.category, list);
  }

  const categoryOrder: Array<'atom' | 'layout' | 'control-flow'> = ['atom', 'layout', 'control-flow'];

  for (const cat of categoryOrder) {
    const primitives = byCategory.get(cat) ?? [];
    if (primitives.length === 0) continue;

    sections.push('');
    sections.push('---');
    sections.push('');
    sections.push(CATEGORY_HEADINGS[cat]);
    const intro = CATEGORY_INTROS[cat];
    if (intro) {
      sections.push('');
      sections.push(intro);
    }
    for (const d of primitives) {
      sections.push('');
      sections.push(renderPrimitive(d));
    }
  }

  // Fixed trailing: bind note (appended to control-flow), then remaining sections
  sections.push('');
  sections.push(BIND_SECTION);
  sections.push('');
  sections.push('---');
  sections.push('');
  sections.push(STYLE_SECTION);
  sections.push('');
  sections.push('---');
  sections.push('');
  sections.push(EVENTS_SECTION);
  sections.push('');
  sections.push('---');
  sections.push('');
  sections.push(WORKED_EXAMPLE_SECTION);
  sections.push('');

  return sections.join('\n');
}

writeFileSync(OUT, generate(), 'utf-8');
console.log(`Written: ${OUT}`);
