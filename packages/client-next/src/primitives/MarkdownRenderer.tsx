import { MarkdownEditor } from '../MarkdownEditor'
import type { PrimitiveRenderer } from './types'

export const MarkdownRenderer: PrimitiveRenderer = (props) => {
  return (
    <MarkdownEditor
      value={String(props.value ?? '')}
      onChange={(v) => props.onChange?.(v)}
      minHeight={60}
    />
  )
}
