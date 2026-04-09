import { noteSchema } from './note'
import { containerSchema } from './container'
import { portalSchema } from './portal'
import type { Schema } from '../api'

export { noteSchema, containerSchema, portalSchema }

export const defaultSchemas: Record<string, Schema> = {
  note: noteSchema,
  container: containerSchema,
  portal: portalSchema,
}
