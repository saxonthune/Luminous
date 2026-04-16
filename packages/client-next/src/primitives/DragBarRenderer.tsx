import type { PrimitiveRenderer } from './types'

export const DragBarRenderer: PrimitiveRenderer = (props) => {
  return (
    <div
      data-drag-handle="true"
      class="relative h-5 bg-surface-alt rounded-t-lg cursor-grab active:cursor-grabbing border-b border-border-subtle flex items-center justify-center shrink-0"
    >
      <span
        class="absolute left-2 text-[10px] font-mono text-fg-subtle opacity-70 pointer-events-none"
        title={props.schemaName}
      >
        {props.schemaName}
      </span>
      <div class="w-8 h-0.5 bg-fg-subtle rounded-full" />
      <span
        class="absolute right-2 text-[10px] font-mono text-fg-subtle opacity-70 pointer-events-none"
        title={props.nodeId}
      >
        {props.nodeId.slice(0, 8)}
      </span>
    </div>
  )
}
