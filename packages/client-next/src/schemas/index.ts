import { noteSchema } from './note'
import { containerSchema } from './container'
import type { Schema } from '../api'

export { noteSchema, containerSchema }

export const defaultSchemas: Record<string, Schema> = {
  note: noteSchema,
  container: containerSchema,
}
