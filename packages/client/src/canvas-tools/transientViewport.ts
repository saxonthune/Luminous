import type { Transform } from '@luminous/cactus';

/**
 * Retain a canvas camera for the life of a browser tab. The key belongs to the
 * caller: it should identify both the app and the open document. This is UI
 * state, not document state, so it deliberately never writes to a document.
 */
export function transientViewportOptions(key: string | undefined): {
  initialTransform?: Transform;
  onTransformChange?: (transform: Transform) => void;
} {
  if (!key) return {};

  return {
    initialTransform: readViewport(key),
    onTransformChange: (transform) => writeViewport(key, transform),
  };
}

function readViewport(key: string): Transform | undefined {
  try {
    const raw = sessionStorage.getItem(key);
    if (raw === null) return undefined;
    const parsed: unknown = JSON.parse(raw);
    return isTransform(parsed) ? parsed : undefined;
  } catch {
    return undefined;
  }
}

function writeViewport(key: string, transform: Transform): void {
  try {
    sessionStorage.setItem(key, JSON.stringify(transform));
  } catch {
    // Browser storage is optional; the canvas remains usable without it.
  }
}

function isTransform(value: unknown): value is Transform {
  if (value === null || typeof value !== 'object') return false;
  const candidate = value as Partial<Transform>;
  return typeof candidate.x === 'number' && Number.isFinite(candidate.x)
    && typeof candidate.y === 'number' && Number.isFinite(candidate.y)
    && typeof candidate.k === 'number' && Number.isFinite(candidate.k) && candidate.k > 0;
}
