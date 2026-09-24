import type { HempSource } from "@luminous/core/hemp";

/** Native editor protocol only; no shell commands or remote server execution. */
export function hempEditorLink(editor: "zed" | "vscode", root: string, source: HempSource) {
  if (
    !root.startsWith("/") ||
    source.file.startsWith("/") ||
    source.file.split(/[\\/]/).includes("..")
  )
    return undefined;
  if (!Number.isInteger(source.line) || source.line < 1) return undefined;
  const column = source.column ?? 1;
  if (!Number.isInteger(column) || column < 1) return undefined;
  const path = `${root.replace(/\/+$/, "")}/${source.file}`
    .split("/")
    .map(encodeURIComponent)
    .join("/");
  return `${editor}://file${editor === "vscode" ? "/" : ""}${path}:${source.line}:${column}`;
}
