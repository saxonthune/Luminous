import type { Schema } from '../api'

export const portalSchema: Schema = {
  name: 'portal',
  label: 'Portal',
  primitives: [
    { type: 'drag-bar' },
    { type: 'title', bind: 'title' },
    // NOTE: content has a `canvasRef` field but there is no canvas-frame primitive yet.
    // For now, the portal renders as a degraded card showing just the title.
    // A follow-up task will add a canvas-frame primitive type and bind it to canvasRef.
  ],
}
