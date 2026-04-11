import { Show } from 'solid-js'
import type { PrimitiveRenderer } from './types'

export const ContainerRenderer: PrimitiveRenderer = (props) => {
  const label = () => String(props.value ?? props.primitive.name ?? '')

  return (
    <div class="flex flex-col border-t border-[var(--border-subtle)]">
      <Show when={label()}>
        <div class="px-2 py-1 text-xs font-medium text-[var(--text-secondary)] bg-[var(--bg-surface-alt)]">
          {label()}
        </div>
      </Show>
      <div class="relative flex-1 min-h-[40px] p-2">
        {props.children}
      </div>
    </div>
  )
}
