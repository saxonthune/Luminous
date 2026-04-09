import type { Schema } from '../api'

export const containerSchema: Schema = {
  name: 'container',
  label: 'Container',
  primitives: [
    { type: 'drag-bar' },
    { type: 'title', bind: 'label' },
  ],
}
