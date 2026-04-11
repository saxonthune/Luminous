import { EditorView } from '@codemirror/view'
import { Extension } from '@codemirror/state'

export const markdownTheme: Extension = EditorView.theme({
  '&': {
    border: 'none',
    outline: 'none',
    background: 'transparent',
    fontSize: '0.75rem',
    color: 'var(--cm-text)',
  },
  '&.cm-focused': {
    outline: 'none',
  },
  '.cm-scroller': {
    fontFamily: 'inherit',
    lineHeight: '1.5',
    overflow: 'auto',
  },
  '.cm-content': {
    caretColor: 'var(--cm-text)',
    padding: '4px 8px',
  },
  '.cm-line': {
    padding: '0',
  },
  '.cm-cursor': {
    borderLeftColor: 'var(--cm-text)',
  },
  // Headings
  '.cm-md-h1': {
    fontSize: '1.25em',
    fontWeight: '700',
  },
  '.cm-md-h2': {
    fontSize: '1.1em',
    fontWeight: '700',
  },
  '.cm-md-h3': {
    fontSize: '1em',
    fontWeight: '700',
  },
  '.cm-md-h4': {
    fontSize: '0.9em',
    fontWeight: '700',
  },
  '.cm-md-h5': {
    fontSize: '0.9em',
    fontWeight: '700',
  },
  '.cm-md-h6': {
    fontSize: '0.9em',
    fontWeight: '700',
  },
  // Inline styles
  '.cm-md-bold': {
    fontWeight: '600',
  },
  '.cm-md-italic': {
    fontStyle: 'italic',
  },
  '.cm-md-code': {
    background: 'var(--cm-code-bg)',
    borderRadius: '2px',
    padding: '0 2px',
    fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
  },
  // Checkbox indicators
  '.cm-md-checkbox': {
    color: 'var(--cm-checkbox)',
    marginRight: '2px',
  },
  '.cm-md-checkbox-checked': {
    color: 'var(--cm-checkbox-checked)',
  },
})
