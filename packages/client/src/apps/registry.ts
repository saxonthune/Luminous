import { lazy, type Component } from 'solid-js';

export interface LuminousApp {
  id: string;
  label: string;
  component: Component;
}

function lazyApp(id: string, load: () => Promise<{ default: Component }>): Component {
  return lazy(async () => {
    const started = performance.now();
    const startMark = `luminous:app:${id}:${Math.round(started)}:start`;
    performance.mark(startMark);
    try {
      return await load();
    } finally {
      const duration = performance.now() - started;
      const endMark = `${startMark}:end`;
      performance.mark(endMark);
      performance.measure(`luminous:app:${id}:load`, startMark, endMark);
      if (import.meta.env.DEV) {
        console.info('[Luminous startup]', { phase: `${id} app module loaded`, durationMs: Math.round(duration) });
      }
    }
  });
}

export function createAppRegistry(): LuminousApp[] {
  return [
    { id: 'canvas', label: 'Canvas', component: lazyApp('canvas', () => import('./canvas/CanvasApp').then(({ CanvasApp }) => ({ default: CanvasApp }))) },
    { id: 'dataflow', label: 'Dataflow', component: lazyApp('dataflow', () => import('./dataflow/DataflowApp').then(({ DataflowApp }) => ({ default: DataflowApp }))) },
    { id: 'atlas', label: 'Atlas', component: lazyApp('atlas', () => import('./atlas/AtlasApp').then(({ AtlasApp }) => ({ default: AtlasApp }))) },
    { id: 'linen', label: 'Linen', component: lazyApp('linen', () => import('./linen/LinenApp').then(({ LinenApp }) => ({ default: LinenApp }))) },
    { id: 'merino', label: 'Merino', component: lazyApp('merino', () => import('./merino/MerinoApp').then(({ MerinoApp }) => ({ default: MerinoApp }))) },
    { id: 'rayon', label: 'Rayon', component: lazyApp('rayon', () => import('./rayon/RayonApp').then(({ RayonApp }) => ({ default: RayonApp }))) },
    { id: 'nylon', label: 'Nylon', component: lazyApp('nylon', () => import('./nylon/NylonApp').then(({ NylonApp }) => ({ default: NylonApp }))) },
    { id: 'hemp', label: 'Hemp', component: lazyApp('hemp', () => import('./hemp/HempApp').then(({ HempApp }) => ({ default: HempApp }))) },
    { id: 'denim', label: 'Denim', component: lazyApp('denim', () => import('./denim/DenimApp').then(({ DenimApp }) => ({ default: DenimApp }))) },
  ];
}

export const APPS = createAppRegistry();
