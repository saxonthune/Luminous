import type { FunctionInfo, FunctionPart } from "./functionInfo.js";

/** A presentation projection of resolved references, not liveness or data flow.
 * A target used in multiple branch scopes is shown once at function level.
 */
export function functionResources(info: FunctionInfo): Map<string, string[]> {
  const scopeOf = new Map<string, string>();
  function visit(parts: FunctionPart[], scope: string) {
    for (const part of parts) {
      const owner = ["arm", "then", "else"].includes(part.kind) ? part.id : scope;
      scopeOf.set(part.id, owner);
      visit(part.children, owner);
    }
  }
  visit(info.body, info.itemId);
  const uses = new Map<string, Set<string>>();
  for (const connection of info.connections) {
    const scopes = uses.get(connection.targetId) ?? new Set<string>();
    scopes.add(scopeOf.get(connection.partId) ?? info.itemId);
    uses.set(connection.targetId, scopes);
  }
  const groups = new Map<string, string[]>();
  for (const [target, scopes] of uses) {
    const owner = scopes.size === 1 ? [...scopes][0] : info.itemId;
    const targets = groups.get(owner) ?? [];
    targets.push(target);
    groups.set(owner, targets);
  }
  return groups;
}
