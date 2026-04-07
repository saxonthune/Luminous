import React, { useEffect, useRef, useImperativeHandle, forwardRef } from 'react'
import { EditorView, keymap } from '@codemirror/view'
import { EditorState } from '@codemirror/state'
import { markdown } from '@codemirror/lang-markdown'
import { history, historyKeymap, defaultKeymap } from '@codemirror/commands'
import { livePreviewExtension } from './livePreview'
import { markdownTheme } from './markdownTheme'

export interface MarkdownEditorHandle {
  getSelection(): { text: string; from: number; to: number } | null
  replaceRange(from: number, to: number, text: string): void
}

interface MarkdownEditorProps {
  value: string
  onChange: (value: string) => void
  minHeight: number
}

export const MarkdownEditor = forwardRef<MarkdownEditorHandle, MarkdownEditorProps>(
  function MarkdownEditor({ value, onChange, minHeight }, ref) {
    const containerRef = useRef<HTMLDivElement>(null)
    const viewRef = useRef<EditorView | null>(null)
    const onChangeRef = useRef(onChange)
    const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

    // Keep onChange ref fresh
    useEffect(() => {
      onChangeRef.current = onChange
    }, [onChange])

    useImperativeHandle(ref, () => ({
      getSelection() {
        const view = viewRef.current
        if (!view) return null
        const sel = view.state.selection.main
        if (sel.from === sel.to) return null
        return { text: view.state.sliceDoc(sel.from, sel.to), from: sel.from, to: sel.to }
      },
      replaceRange(from: number, to: number, text: string) {
        const view = viewRef.current
        if (!view) return
        view.dispatch({ changes: { from, to, insert: text } })
      },
    }), [])

    // Create EditorView once
    useEffect(() => {
      if (!containerRef.current) return

      const state = EditorState.create({
        doc: value,
        extensions: [
          markdown(),
          livePreviewExtension(),
          markdownTheme,
          history(),
          keymap.of([...defaultKeymap, ...historyKeymap]),
          EditorView.lineWrapping,
          EditorView.updateListener.of((update) => {
            if (!update.docChanged) return
            const newValue = update.state.doc.toString()
            if (debounceRef.current) clearTimeout(debounceRef.current)
            debounceRef.current = setTimeout(() => {
              onChangeRef.current(newValue)
            }, 500)
          }),
          EditorView.domEventHandlers({
            blur: () => {
              if (debounceRef.current) {
                clearTimeout(debounceRef.current)
                debounceRef.current = null
              }
              if (viewRef.current) {
                onChangeRef.current(viewRef.current.state.doc.toString())
              }
            },
          }),
        ],
      })

      const view = new EditorView({ state, parent: containerRef.current })
      viewRef.current = view

      return () => {
        if (debounceRef.current) clearTimeout(debounceRef.current)
        view.destroy()
        viewRef.current = null
      }
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [])

    // Sync external value changes (e.g. server push)
    useEffect(() => {
      const view = viewRef.current
      if (!view) return
      const current = view.state.doc.toString()
      if (value !== current) {
        view.dispatch({
          changes: { from: 0, to: current.length, insert: value },
        })
      }
    }, [value])

    return (
      <div
        ref={containerRef}
        data-no-pan="true"
        style={{ minHeight }}
        onKeyDown={(e) => e.stopPropagation()}
      />
    )
  }
)
