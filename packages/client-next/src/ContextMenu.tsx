import React, { useEffect, useRef } from 'react'

export interface MenuItem {
  label: string
  action: () => void
  disabled?: boolean
  separator?: boolean
}

interface ContextMenuProps {
  x: number
  y: number
  items: MenuItem[]
  onClose: () => void
}

export function ContextMenu({ x, y, items, onClose }: ContextMenuProps) {
  const menuRef = useRef<HTMLDivElement>(null)

  // Close on Escape
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [onClose])

  // Close on click outside
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        onClose()
      }
    }
    // Use capture so we intercept before the click reaches other handlers
    window.addEventListener('mousedown', handler, true)
    return () => window.removeEventListener('mousedown', handler, true)
  }, [onClose])

  // Adjust position to avoid viewport overflow
  const menuWidth = 160
  const menuItemHeight = 28
  const separatorHeight = 9
  const padding = 8
  const itemCount = items.filter((i) => !i.separator).length
  const sepCount = items.filter((i) => i.separator).length
  const estimatedHeight = itemCount * menuItemHeight + sepCount * separatorHeight + padding * 2

  const adjustedX = x + menuWidth > window.innerWidth ? x - menuWidth : x
  const adjustedY = y + estimatedHeight > window.innerHeight ? y - estimatedHeight : y

  return (
    <div
      ref={menuRef}
      style={{
        position: 'fixed',
        left: adjustedX,
        top: adjustedY,
        zIndex: 9999,
        minWidth: menuWidth,
      }}
      className="bg-white rounded-lg shadow-lg border border-gray-200 py-1 text-sm"
    >
      {items.map((item, i) => {
        if (item.separator) {
          return <div key={i} className="my-1 border-t border-gray-100" />
        }
        return (
          <button
            key={i}
            disabled={item.disabled}
            className={`w-full text-left px-3 py-1.5 rounded transition-colors ${
              item.disabled
                ? 'text-gray-300 cursor-not-allowed'
                : 'text-gray-700 hover:bg-gray-100 cursor-pointer'
            }`}
            onMouseDown={(e) => {
              // Prevent the outside-click handler from firing before action
              e.stopPropagation()
            }}
            onClick={() => {
              if (!item.disabled) {
                item.action()
                onClose()
              }
            }}
          >
            {item.label}
          </button>
        )
      })}
    </div>
  )
}
