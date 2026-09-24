import { describe, expect, it } from "vitest";
import { hempEditorLink } from "../editorLinks";

describe("source editor links", () => {
  it("encodes paths and uses each editor's native file URL", () => {
    const source = { file: "src/a #b.rs", line: 12, column: 3 };
    expect(hempEditorLink("zed", "/work/my repo", source)).toBe(
      "zed://file/work/my%20repo/src/a%20%23b.rs:12:3",
    );
    expect(hempEditorLink("vscode", "/work/my repo", source)).toBe(
      "vscode://file//work/my%20repo/src/a%20%23b.rs:12:3",
    );
    expect(hempEditorLink("zed", "", source)).toBeUndefined();
    expect(hempEditorLink("zed", "/work", { ...source, file: "../elsewhere" })).toBeUndefined();
  });
});
