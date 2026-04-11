import { createSignal, createEffect } from 'solid-js'
import type { PrimitiveRenderer } from './types'

export const TitleRenderer: PrimitiveRenderer = (props) => {
  const [local, setLocal] = createSignal(String(props.value ?? ''))

  // Sync external value into local on changes
  createEffect(() => setLocal(String(props.value ?? '')))

  const commit = () => {
    if (props.onChange) props.onChange(local())
  }

  return (
    <input
      data-no-pan="true"
      class="w-full px-2 py-1 font-semibold text-sm outline-none bg-transparent border-b border-[var(--border-subtle)]"
      style={{ 'user-select': 'text' }}
      value={local()}
      onInput={(e) => setLocal(e.currentTarget.value)}
      onBlur={commit}
      onPointerDown={(e) => e.stopPropagation()}
      onKeyDown={(e) => {
        e.stopPropagation()
        if (e.key === 'Enter') (e.target as HTMLInputElement).blur()
      }}
    />
  )
}
