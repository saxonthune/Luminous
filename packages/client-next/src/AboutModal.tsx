import type { JSX } from 'solid-js';
import { APP_NAME, APP_VERSION, GIT_COMMIT } from './version';

interface AboutModalProps {
  onClose: () => void;
}

export function AboutModal(props: AboutModalProps): JSX.Element {
  return (
    <div
      class="fixed inset-0 z-[9999] flex items-center justify-center"
      style={{ "backdrop-filter": "blur(4px)", "background": "rgba(0,0,0,0.3)" }}
      onClick={(e) => { if (e.target === e.currentTarget) props.onClose(); }}
    >
      <div
        class="rounded-lg border border-border bg-surface p-6 w-80"
        style={{ "box-shadow": "var(--shadow-lg)" }}
      >
        <h2 class="text-lg font-semibold text-fg mb-4">{APP_NAME}</h2>

        <div class="text-sm space-y-1.5 text-fg">
          <div class="flex justify-between">
            <span>Version</span>
            <span>{APP_VERSION}</span>
          </div>
          <div class="flex justify-between">
            <span>Commit</span>
            <span class="font-mono">{GIT_COMMIT}</span>
          </div>
          <p>
            &copy; 2025&ndash;2026{' '}
            <a
              href="https://computation.saxon.zone"
              target="_blank"
              rel="noopener noreferrer"
              class="underline hover:text-accent"
            >
              Saxon Thune
            </a>
          </p>
          <p>
            Licensed under{' '}
            <a
              href="https://www.gnu.org/licenses/agpl-3.0.html"
              target="_blank"
              rel="noopener noreferrer"
              class="underline hover:text-accent"
            >
              AGPL-3.0
            </a>
          </p>
          <p>
            <a
              href="https://github.com/saxonthune/Luminous"
              target="_blank"
              rel="noopener noreferrer"
              class="underline hover:text-accent"
            >
              GitHub
            </a>
          </p>
        </div>

        <div class="mt-5 text-right">
          <button
            onClick={props.onClose}
            class="rounded-md border border-border px-3 py-1 text-sm font-medium text-fg hover:bg-surface-alt"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
