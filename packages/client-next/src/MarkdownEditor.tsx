import { onCleanup } from 'solid-js';
import { createCodeMirror, createEditorControlledValue } from './createCodeMirror';
import { EditorView, keymap } from '@codemirror/view';
import { markdown } from '@codemirror/lang-markdown';
import { history, historyKeymap, defaultKeymap } from '@codemirror/commands';
import { livePreviewExtension } from './livePreview';
import { markdownTheme } from './markdownTheme';

export interface MarkdownEditorHandle {
  getSelection(): { text: string; from: number; to: number } | null;
  replaceRange(from: number, to: number, text: string): void;
}

interface MarkdownEditorProps {
  value: string;
  onChange: (value: string) => void;
  minHeight: number;
  ref?: (handle: MarkdownEditorHandle) => void;
}

export default function MarkdownEditor(props: MarkdownEditorProps) {
  let debounceTimer: ReturnType<typeof setTimeout> | null = null;

  const { editorView, ref, createExtension } = createCodeMirror({
    onValueChange: (value) => {
      if (debounceTimer) clearTimeout(debounceTimer);
      debounceTimer = setTimeout(() => {
        props.onChange(value);
      }, 500);
    },
  });

  createEditorControlledValue(editorView, () => props.value);

  createExtension(() => markdown());
  createExtension(() => livePreviewExtension());
  createExtension(() => markdownTheme);
  createExtension(() => history());
  createExtension(() => keymap.of([...defaultKeymap, ...historyKeymap]));
  createExtension(() => EditorView.lineWrapping);
  createExtension(() =>
    EditorView.domEventHandlers({
      blur: () => {
        if (debounceTimer) {
          clearTimeout(debounceTimer);
          debounceTimer = null;
        }
        const view = editorView();
        if (view) props.onChange(view.state.doc.toString());
      },
    })
  );

  onCleanup(() => {
    if (debounceTimer) clearTimeout(debounceTimer);
  });

  props.ref?.({
    getSelection() {
      const view = editorView();
      if (!view) return null;
      const sel = view.state.selection.main;
      if (sel.from === sel.to) return null;
      return { text: view.state.sliceDoc(sel.from, sel.to), from: sel.from, to: sel.to };
    },
    replaceRange(from: number, to: number, text: string) {
      const view = editorView();
      if (!view) return;
      view.dispatch({ changes: { from, to, insert: text } });
    },
  });

  return (
    <div
      ref={ref}
      data-no-pan="true"
      style={{ 'min-height': `${props.minHeight}px`, 'user-select': 'text' }}
      onKeyDown={(e) => e.stopPropagation()}
      onPointerDown={(e) => e.stopPropagation()}
    />
  );
}
