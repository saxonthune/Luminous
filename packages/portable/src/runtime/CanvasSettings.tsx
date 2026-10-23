import Settings from 'lucide-solid/icons/settings';
import { createSignal, onCleanup, onMount, Show } from 'solid-js';

export function CanvasSettings(props: { scrollZoom: boolean; onScrollZoomChange: (checked: boolean) => void }) {
  const [open, setOpen] = createSignal(false);
  let root!: HTMLDivElement;
  let button!: HTMLButtonElement;
  onMount(() => {
    const outside = (event: PointerEvent) => {
      if (!root.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener('pointerdown', outside);
    onCleanup(() => document.removeEventListener('pointerdown', outside));
  });
  return <div ref={root} class="portable-settings" onKeyDown={event => {
    if (event.key === 'Escape' && open()) {
      event.preventDefault(); event.stopPropagation(); setOpen(false); button.focus();
    }
  }}>
    <button ref={button} aria-label="Canvas settings" title="Canvas settings" aria-expanded={open()} onClick={() => setOpen(!open())}>
      <Settings size={18} aria-hidden="true" />
    </button>
    <Show when={open()}><div class="portable-settings-dropdown">
      <label><input type="checkbox" checked={props.scrollZoom} onChange={event => props.onScrollZoomChange(event.currentTarget.checked)} />Scroll Zoom</label>
    </div></Show>
  </div>;
}
