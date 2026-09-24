import { expect, it } from "vitest";
import { functionResources, type FunctionInfo, type FunctionPart } from "@luminous/core/hemp";

it("places exclusive resources in branches and deduplicates shared resources at function level", () => {
  const part = (id: string, kind: string, children: FunctionPart[] = []): FunctionPart => ({
    id,
    kind,
    label: id,
    start: { line: 1, column: 1 },
    end: { line: 2, column: 1 },
    children,
  });
  const body = [
    part("match", "match", [
      part("a", "arm", [part("call-a", "call")]),
      part("b", "arm"),
      part("c", "arm"),
    ]),
  ];
  const connections = [
    ["call-a", "unique"],
    ["call-a", "unique"],
    ["call-a", "shared"],
    ["b", "shared"],
    ["match", "condition"],
  ].map(([partId, targetId]) => ({
    partId,
    targetId,
    kind: "reference" as const,
    line: 1,
    column: 1,
  }));
  const info: FunctionInfo = {
    itemId: "fn",
    name: "fn",
    namespace: "",
    signature: "fn()",
    definitionLine: 1,
    lineCount: 2,
    body,
    connections,
  };
  const groups = functionResources(info);
  expect(groups.get("a")).toEqual(["unique"]);
  expect(groups.get("fn")).toEqual(["shared", "condition"]);
  expect(groups.has("b")).toBe(false);
  expect(groups.has("c")).toBe(false);
});
