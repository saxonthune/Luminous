import { render } from 'solid-js/web';
import { For } from 'solid-js';
import { NodeView } from '../runtime/NodeView.js';
import { restRole, restStyles } from '../rest.js';
import { USAGE_CARD_MAX_HEIGHT } from '../usage.js';
import { componentWidth, type MeasurementInput, type MeasurementOutput } from './contracts.js';
import '@luminous/cactus/cactus.css';
import '@luminous/cactus/cactus-themes.css';
import '../runtime/style.css';

const host = window as unknown as { measurePortable: (input: MeasurementInput) => Promise<MeasurementOutput> };
host.measurePortable = async input => {
  const root = document.createElement('div');
  root.className = 'portable-measurement';
  document.body.append(root);
  // Intrinsic measurement removes only allocated heights and clipping. Fonts,
  // wrapping, widths, padding and component markup come from the final renderer.
  const sheet = document.createElement('style');
  sheet.textContent = `
    .portable-measurement .portable-canvas {height:auto!important;margin:0!important;overflow:visible!important}
    .portable-measurement [data-measure-id] {position:relative;display:block;width:max-content;min-width:180px;max-width:380px;box-sizing:border-box}
    .portable-measurement .portable-node,.portable-measurement .portable-group {height:auto!important;min-height:0!important}
    .portable-measurement .portable-card,.portable-measurement .portable-usage-card {height:auto!important;max-height:none!important}
    .portable-measurement .portable-card-heading,.portable-measurement .portable-card-title,.portable-measurement .portable-card-body,.portable-measurement .portable-card-footer {flex-shrink:0!important;max-height:none!important;overflow:visible!important}
    .portable-measurement .portable-card-body {flex:none!important}
    .portable-measurement .portable-label {height:auto!important;max-height:none!important;overflow:visible!important}
    .portable-measurement .portable-group>.portable-label {min-height:48px}
    .portable-measurement .portable-usage-frame,.portable-measurement .portable-usage {flex:none!important;overflow:visible!important}
    .portable-measurement .portable-transition {height:auto!important;min-height:44px}
    .portable-measurement .portable-container-body {display:none}
  `;
  document.head.append(sheet);
  const dispose = render(() => <For each={['ground', 'light', 'dark'] as const}>{theme =>
    <div class={`portable cactus-theme-${theme}`}><article class="portable-document"><section class="portable-canvas">
      <For each={[1, 0.5]}>{zoom => <For each={input.items}>{item => {
        const width = componentWidth(item.node.card);
        const palette = item.node.classes.map(name => input.theme?.styles[name]?.[theme === 'dark' ? 'dark' : 'light']).find(Boolean)
          ?? (item.node.card?.component === 'rest-card' ? restStyles[restRole(item.node.card.title, item.node.card.methods ?? [])][theme === 'dark' ? 'dark' : 'light'] : undefined);
        return <div data-measure-id={item.id} data-group={item.node.group || undefined} data-usage={item.node.card?.component === 'usage-card' || undefined}
          style={width ? { width: `${width}px`, 'min-width': `${width}px`, 'max-width': `${width}px` } : {}}>
          <NodeView node={item.node} zoom={zoom} palette={palette} descendantCount={item.descendantCount} collapsed />
        </div>;
      }}</For>}</For>
    </section></article></div>
  }</For>, root);
  try {
    await document.fonts.ready;
    await new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));
    const result: MeasurementOutput = {};
    for (const el of root.querySelectorAll<HTMLElement>('[data-measure-id]')) {
      const id = el.dataset.measureId!;
      const box = el.getBoundingClientRect();
      // Round outward. Layout must never allocate less than the measured content.
      const w = Math.ceil(box.width), intrinsicHeight = Math.ceil(box.height);
      const h = el.dataset.usage ? Math.min(USAGE_CARD_MAX_HEIGHT, intrinsicHeight) : intrinsicHeight;
      const previous = result[id];
      result[id] = { w: Math.max(previous?.w ?? 0, w), h: Math.max(previous?.h ?? 0, h),
        ...(el.dataset.group ? { headerHeight: Math.max(previous?.headerHeight ?? 0, intrinsicHeight) } : {}) };
      if (!(w > 0 && h > 0)) throw new Error(`Cannot measure node ${id}: ${w}×${h}`);
    }
    return result;
  } finally { dispose(); root.remove(); sheet.remove(); }
};
