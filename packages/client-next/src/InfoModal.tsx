import { onCleanup } from 'solid-js';
import { marked } from 'marked';

interface InfoModalProps {
  info: string;
  onClose: () => void;
}

export function InfoModal(props: InfoModalProps) {
  const onKeyDown = (e: KeyboardEvent) => {
    if (e.key === 'Escape') props.onClose();
  };
  window.addEventListener('keydown', onKeyDown);
  onCleanup(() => window.removeEventListener('keydown', onKeyDown));

  return (
    <div
      style={{
        position: 'fixed',
        inset: '0',
        background: 'rgba(0,0,0,0.4)',
        display: 'flex',
        'align-items': 'center',
        'justify-content': 'center',
        'z-index': '1000',
      }}
      onClick={() => props.onClose()}
    >
      <div
        class="bg-surface text-fg rounded-lg border border-border-subtle shadow-lg"
        style={{
          'max-width': '640px',
          width: '90vw',
          'max-height': '80vh',
          overflow: 'auto',
          padding: '1.5rem',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div class="flex items-start justify-between gap-4 mb-4">
          <button
            class="ml-auto rounded px-2 py-1 text-sm text-fg-muted hover:bg-surface-alt hover:text-fg"
            title="Close"
            onClick={() => props.onClose()}
          >
            ×
          </button>
        </div>
        {/* SECURITY: marked does not sanitize HTML; info is author-controlled graph data.
            Untrusted canvases need DOMPurify or a safe renderer before this is safe. */}
        <div
          class="prose-sm"
          style={{ 'line-height': '1.6' }}
          // eslint-disable-next-line solid/no-innerhtml
          innerHTML={marked.parse(props.info, { async: false }) as string}
        />
      </div>
    </div>
  );
}
