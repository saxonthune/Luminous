import type { JSX } from 'solid-js';
import type { RenderContext } from '../types.ts';
import type { RenderNode } from './types.ts';
import { getPrimitive } from './registry.ts';
import { interpolate, evalCondition } from './interpolate.ts';

const warned = new Set<string>();

export function interpretRender(
  render: RenderNode,
  ctx: RenderContext,
  content: Record<string, unknown>,
): JSX.Element {
  const { type, children, ...props } = render;

  if (type === 'if') {
    const when = props['when'] as string | undefined;
    const thenNode = props['then'] as RenderNode | undefined;
    const elseNode = props['else'] as RenderNode | undefined;
    if (!when || !thenNode) return null;
    return evalCondition(when, content)
      ? interpretRender(thenNode, ctx, content)
      : elseNode
        ? interpretRender(elseNode, ctx, content)
        : null;
  }

  if (type === 'for-each') {
    const itemsExpr = props['items'] as string | undefined;
    const as = props['as'] as string | undefined;
    const template = props['template'] as RenderNode | undefined;
    if (!itemsExpr || !as || !template) return null;
    const path = itemsExpr.startsWith('content.') ? itemsExpr.slice(8) : itemsExpr;
    const items = resolvePath(content, path);
    if (!Array.isArray(items)) return null;
    return (items as unknown[]).map((item) =>
      interpretRender(template, ctx, { ...content, [as]: item })
    ) as unknown as JSX.Element;
  }

  const prim = getPrimitive(type);
  if (!prim) {
    if (!warned.has(type)) {
      console.warn(`[interpretRender] Unknown primitive: "${type}"`);
      warned.add(type);
    }
    return null;
  }

  const resolvedProps: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(props)) {
    if (k === 'onClick') {
      if (v === 'INSPECT') {
        const id = content['id'] as string | undefined;
        resolvedProps[k] = id != null ? () => ctx.inspect(id) : undefined;
      }
      // Other event strings: recognized but unhandled — future dispatch bus
      continue;
    }
    resolvedProps[k] = typeof v === 'string' ? interpolate(v, content) : v;
  }

  const childrenFn = (): JSX.Element => {
    if (!children?.length) return null;
    return children.map((child) =>
      interpretRender(child, ctx, content)
    ) as unknown as JSX.Element;
  };

  return prim(resolvedProps, ctx, childrenFn);
}

function resolvePath(obj: Record<string, unknown>, path: string): unknown {
  const parts = path.split('.');
  let current: unknown = obj;
  for (const part of parts) {
    if (current == null || typeof current !== 'object') return undefined;
    current = (current as Record<string, unknown>)[part];
  }
  return current;
}
