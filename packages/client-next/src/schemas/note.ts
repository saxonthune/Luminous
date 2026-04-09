import type { Schema } from '../api'

export const noteSchema: Schema = {
  name: 'note',
  label: 'Note',
  primitives: [
    { type: 'drag-bar' },
    { type: 'title',    bind: 'title' },
    { type: 'markdown', bind: 'body' },
  ],
}
