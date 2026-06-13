export function interpolate(template: string, scope: Record<string, unknown>): string {
  return template.replace(/\{content\.([^}]+)\}/g, (_, expr: string) => {
    const joinMatch = (expr as string).match(/^(.+?)\s*\|\s*join:'([^']*)'\s*$/);
    if (joinMatch) {
      const path = joinMatch[1]!.trim();
      const sep = joinMatch[2]!;
      const val = resolvePath(scope, path);
      if (Array.isArray(val)) return val.join(sep);
      return val == null ? '' : String(val);
    }
    const val = resolvePath(scope, (expr as string).trim());
    return val == null ? '' : String(val);
  });
}

export function evalCondition(expr: string, scope: Record<string, unknown>): boolean {
  const trimmed = expr.trim();

  // content.x === 'literal'
  const eqMatch = trimmed.match(/^content\.(.+?)\s*===\s*'([^']*)'\s*$/);
  if (eqMatch) {
    return resolvePath(scope, eqMatch[1]!) === eqMatch[2];
  }

  // content.x.length > N
  const lengthGtMatch = trimmed.match(/^content\.(.+?)\.length\s*>\s*(\d+)\s*$/);
  if (lengthGtMatch) {
    const val = resolvePath(scope, lengthGtMatch[1]!);
    if (Array.isArray(val) || typeof val === 'string') return val.length > Number(lengthGtMatch[2]);
    return false;
  }

  // !content.x
  const negMatch = trimmed.match(/^!content\.(.+)$/);
  if (negMatch) {
    return !resolvePath(scope, negMatch[1]!);
  }

  // content.x (truthy)
  const truthyMatch = trimmed.match(/^content\.(.+)$/);
  if (truthyMatch) {
    return Boolean(resolvePath(scope, truthyMatch[1]!));
  }

  return false;
}

function resolvePath(scope: Record<string, unknown>, path: string): unknown {
  const parts = path.split('.');
  let current: unknown = scope;
  for (const part of parts) {
    if (current == null || typeof current !== 'object') return undefined;
    current = (current as Record<string, unknown>)[part];
  }
  return current;
}
