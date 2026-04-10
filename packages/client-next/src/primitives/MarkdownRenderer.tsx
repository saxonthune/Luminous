import { lazy, Suspense } from 'solid-js'
import type { PrimitiveRenderer } from './types'

const LazyMarkdownEditor = lazy(() => import('../MarkdownEditor'))

export const MarkdownRenderer: PrimitiveRenderer = (props) => {
  return (
    <div
      class="mx-2 mb-2 rounded border border-[var(--border-subtle)] bg-[var(--bg-surface-alt)] overflow-hidden"
      style={{ opacity: 0.85 }}
    >
      <Suspense>
        <LazyMarkdownEditor
          value={String(props.value ?? '')}
          onChange={(v) => props.onChange?.(v)}
          minHeight={60}
        />
      </Suspense>
    </div>
  )
}
