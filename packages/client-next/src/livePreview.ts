import { ViewPlugin, Decoration, DecorationSet, EditorView, ViewUpdate } from '@codemirror/view'
import { Extension, Range } from '@codemirror/state'
import { syntaxTree } from '@codemirror/language'

function buildDecorations(view: EditorView): DecorationSet {
  const { state } = view
  const tree = syntaxTree(state)
  const cursorLine = state.doc.lineAt(state.selection.main.head).number
  const decorations: Range<Decoration>[] = []

  tree.iterate({
    enter(node) {
      const { from, to, name } = node

      // Headings: ATXHeading1..6
      if (/^ATXHeading[1-6]$/.test(name)) {
        const level = parseInt(name.slice(-1))
        const cls = `cm-md-h${level}`
        decorations.push(Decoration.mark({ class: cls }).range(from, to))
        return
      }

      // HeaderMark: hide the `# ` prefix unless on cursor line
      if (name === 'HeaderMark') {
        const line = state.doc.lineAt(from).number
        if (line !== cursorLine) {
          // include the trailing space after #
          const end = to + 1 <= state.doc.length && state.doc.sliceString(to, to + 1) === ' ' ? to + 1 : to
          decorations.push(Decoration.replace({}).range(from, end))
        }
        return
      }

      // StrongEmphasis: bold
      if (name === 'StrongEmphasis') {
        decorations.push(Decoration.mark({ class: 'cm-md-bold' }).range(from, to))
        return
      }

      // Emphasis (italic — but not inside StrongEmphasis)
      if (name === 'Emphasis') {
        decorations.push(Decoration.mark({ class: 'cm-md-italic' }).range(from, to))
        return
      }

      // EmphasisMark: hide *, **, _, __
      if (name === 'EmphasisMark') {
        const line = state.doc.lineAt(from).number
        if (line !== cursorLine) {
          decorations.push(Decoration.replace({}).range(from, to))
        }
        return
      }

      // InlineCode
      if (name === 'InlineCode') {
        decorations.push(Decoration.mark({ class: 'cm-md-code' }).range(from, to))
        return
      }

      // CodeMark: hide backticks
      if (name === 'CodeMark') {
        const line = state.doc.lineAt(from).number
        if (line !== cursorLine) {
          decorations.push(Decoration.replace({}).range(from, to))
        }
        return
      }

      // ListMark: hide `- `, `* `, `1. `, `- [ ] `, `- [x] `
      if (name === 'ListMark') {
        const line = state.doc.lineAt(from).number
        if (line !== cursorLine) {
          // include trailing space
          const end = to + 1 <= state.doc.length && state.doc.sliceString(to, to + 1) === ' ' ? to + 1 : to
          decorations.push(Decoration.replace({}).range(from, end))
        }
        return
      }

      // TaskMarker: `[ ]` or `[x]`
      if (name === 'TaskMarker') {
        const line = state.doc.lineAt(from).number
        const marker = state.doc.sliceString(from, to)
        const checked = marker === '[x]' || marker === '[X]'
        if (line !== cursorLine) {
          decorations.push(
            Decoration.replace({
              widget: new CheckboxWidget(checked),
            }).range(from, to)
          )
        }
        return
      }
    },
  })

  decorations.sort((a, b) => a.from - b.from || a.to - b.to)
  return Decoration.set(decorations, true)
}

import { WidgetType } from '@codemirror/view'

class CheckboxWidget extends WidgetType {
  constructor(readonly checked: boolean) {
    super()
  }
  toDOM(): HTMLElement {
    const span = document.createElement('span')
    span.className = this.checked ? 'cm-md-checkbox cm-md-checkbox-checked' : 'cm-md-checkbox'
    span.textContent = this.checked ? '☑' : '☐'
    return span
  }
  eq(other: CheckboxWidget) {
    return other.checked === this.checked
  }
}

const livePreviewPlugin = ViewPlugin.fromClass(
  class {
    decorations: DecorationSet
    constructor(view: EditorView) {
      this.decorations = buildDecorations(view)
    }
    update(update: ViewUpdate) {
      if (update.docChanged || update.selectionSet || update.viewportChanged) {
        this.decorations = buildDecorations(update.view)
      }
    }
  },
  { decorations: (v) => v.decorations }
)

export function livePreviewExtension(): Extension {
  return livePreviewPlugin
}
