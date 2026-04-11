import { createSignal, createEffect } from 'solid-js';

export type Theme = 'light' | 'dusk' | 'ground';

export const THEMES: ReadonlyArray<{ id: Theme; label: string; icon: string }> = [
  { id: 'light', label: 'Light', icon: '☀' },
  { id: 'dusk', label: 'Dusk', icon: '☾' },
  { id: 'ground', label: 'Ground', icon: '◐' },
];

const ids = THEMES.map((t) => t.id);
const stored = localStorage.getItem('luminous-theme') as Theme | null;
const initial: Theme = stored && ids.includes(stored) ? stored : 'light';

export const [theme, setTheme] = createSignal<Theme>(initial);

export function cycleTheme() {
  const current = ids.indexOf(theme());
  setTheme(ids[(current + 1) % ids.length]);
}

createEffect(() => {
  const t = theme();
  document.documentElement.dataset.theme = t;
  localStorage.setItem('luminous-theme', t);
});
