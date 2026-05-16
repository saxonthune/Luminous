import type { Primitive } from './types.ts';

const primitives = new Map<string, Primitive>();

export function registerPrimitive(name: string, prim: Primitive): void {
  if (primitives.has(name)) throw new Error(`Primitive "${name}" already registered`);
  primitives.set(name, prim);
}

export function getPrimitive(name: string): Primitive | undefined {
  return primitives.get(name);
}

export function resetPrimitives(): void {
  primitives.clear();
}
