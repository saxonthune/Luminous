import type { NodeKind, EdgeKind } from '../types.ts';
import type { RenderNode } from './types.ts';

export function generateFallbackRender(
  kind: NodeKind | EdgeKind | undefined,
  content: Record<string, unknown>,
): RenderNode {
  const entries = Object.entries(content);

  let heading: string = 'Unknown';
  let headingKey: string | undefined;
  for (const [k, v] of entries) {
    if (typeof v === 'string') {
      heading = v;
      headingKey = k;
      break;
    }
  }
  if (headingKey === undefined) {
    heading = kind != null ? kind.label : 'Unknown';
  }

  const restEntries = entries.filter(([k]) => k !== headingKey);

  const kvItems = restEntries.map(([k, v]) => ({
    key: k,
    value: Array.isArray(v) ? (v as unknown[]).join(', ') : String(v ?? ''),
  }));

  const bodyNodes: RenderNode[] = kvItems.length > 0
    ? [{ type: 'kv-list', items: kvItems }]
    : [];

  return {
    type: 'card',
    children: [
      {
        type: 'vstack',
        gap: '4',
        children: [
          { type: 'text', value: heading, style: 'heading' },
          ...bodyNodes,
        ],
      },
    ],
  };
}
