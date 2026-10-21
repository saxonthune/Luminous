export interface CanvasSource {
  id: string;
  label: string;
  /** Grouping key — which workspace/repo this canvas belongs to. */
  root: string;
  /** Resolved absolute directory of the root, shown under the group header. */
  rootDir?: string;
  /** Resolved absolute path of the document itself, shown on row hover. */
  absPath?: string;
  load: () => Promise<string>;
  /** Binary document support, used by app-owned SQLite files. */
  loadBytes?: () => Promise<LoadedBinaryDocument>;
  saveBytes?: (bytes: Uint8Array, revision: string) => Promise<string>;
}

export interface LoadedBinaryDocument {
  bytes: Uint8Array;
  revision: string;
}

export class SourceConflictError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SourceConflictError';
  }
}
