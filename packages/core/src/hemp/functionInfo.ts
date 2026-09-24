/** Experimental per-function extraction. Source order, not an execution trace. */
export interface FunctionPart {
  id: string;
  kind: string;
  label: string;
  start: { line: number; column: number };
  end: { line: number; column: number };
  children: FunctionPart[];
}

export interface FunctionInfo {
  itemId: string;
  name: string;
  namespace: string;
  signature: string;
  lineCount: number;
  definitionLine: number;
  body: FunctionPart[];
  connections: {
    partId: string;
    targetId: string;
    kind: "reference" | "call";
    line: number;
    column: number;
  }[];
}

export function functionParts(parts: FunctionPart[]): FunctionPart[] {
  return parts.flatMap((part) => [part, ...functionParts(part.children)]);
}

export function validateFunctionInfo(info: FunctionInfo, itemIds: Set<string>) {
  if (
    !info ||
    !itemIds.has(info.itemId) ||
    typeof info.name !== "string" ||
    typeof info.namespace !== "string" ||
    typeof info.signature !== "string" ||
    !Number.isInteger(info.lineCount) ||
    info.lineCount < 1 ||
    !Number.isInteger(info.definitionLine) ||
    !Array.isArray(info.body) ||
    !Array.isArray(info.connections)
  )
    throw new Error("Invalid FunctionInfo");
  const ids = new Set<string>();
  function check(parts: FunctionPart[]) {
    for (const part of parts) {
      if (
        !part ||
        typeof part.id !== "string" ||
        ids.has(part.id) ||
        typeof part.kind !== "string" ||
        typeof part.label !== "string" ||
        !Array.isArray(part.children) ||
        ![part.start?.line, part.start?.column, part.end?.line, part.end?.column].every(
          (n) => Number.isInteger(n) && n > 0,
        )
      )
        throw new Error("Invalid FunctionInfo part");
      ids.add(part.id);
      check(part.children);
    }
  }
  check(info.body);
  for (const connection of info.connections)
    if (
      !ids.has(connection.partId) ||
      !itemIds.has(connection.targetId) ||
      !["reference", "call"].includes(connection.kind) ||
      !Number.isInteger(connection.line) ||
      !Number.isInteger(connection.column)
    )
      throw new Error("Invalid FunctionInfo connection");
}
