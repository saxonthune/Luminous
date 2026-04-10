import { MarkdownEditor } from '../MarkdownEditor'
import type { PrimitiveRenderer } from './types'

export const MarkdownRenderer: PrimitiveRenderer = (props) => {
  return (
    <div
      class="mx-2 mb-2 rounded border border-[var(--border-subtle)] bg-[var(--bg-surface-alt)] overflow-hidden"
      style={{ opacity: 0.85 }}
    >
      <MarkdownEditor
        value={String(props.value ?? '')}
        onChange={(v) => props.onChange?.(v)}
        minHeight={60}
      />
    </div>
  )
}
