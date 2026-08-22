import { onCleanup } from 'solid-js';
import { marked } from 'marked';

interface InfoModalProps {
  info: string;
  onClose: () => void;
}

// Scoped styling for the rendered markdown — prose-sm isn't active in this app,
// so headings/lists need explicit sizing to read as markdown rather than flat text.
const MD_STYLES = `
.info-modal-md h1 { font-size: 1.15rem; font-weight: 700; margin: 0 0 .5rem; }
.info-modal-md h2 { font-size: 1rem; font-weight: 600; margin: .85rem 0 .4rem; }
.info-modal-md p { margin: 0 0 .6rem; }
.info-modal-md ul { margin: 0 0 .6rem; padding-left: 1.25rem; list-style: disc; }
.info-modal-md li { margin: .15rem 0; }
.info-modal-md code { font-family: ui-monospace, monospace; background: var(--cactus-surface-alt, #f3f4f6); padding: .05rem .3rem; border-radius: 3px; font-size: .9em; }
.info-modal-md a { color: var(--cactus-accent-subtle, #3b82f6); text-decoration: underline; }
.info-modal-md > :last-child { margin-bottom: 0; }
`;

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
      <style>{MD_STYLES}</style>
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
        <div class="flex items-center justify-between gap-4 mb-4 pb-3 border-b border-border-subtle">
          <h2 class="text-xl font-bold text-fg">Information</h2>
          <button
            class="-mr-1 rounded-md p-1.5 text-fg-muted hover:bg-surface-alt hover:text-fg transition-colors"
            title="Close"
            aria-label="Close"
            onClick={() => props.onClose()}
          >
            <svg
              width="20"
              height="20"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="2"
              stroke-linecap="round"
              stroke-linejoin="round"
              aria-hidden="true"
            >
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>
        {/* SECURITY: marked does not sanitize HTML; info is author-controlled graph data.
            Untrusted canvases need DOMPurify or a safe renderer before this is safe. */}
        <div
          class="info-modal-md"
          style={{ 'line-height': '1.6' }}
          // eslint-disable-next-line solid/no-innerhtml
          innerHTML={marked.parse(props.info, { async: false }) as string}
        />
      </div>
    </div>
  );
}
