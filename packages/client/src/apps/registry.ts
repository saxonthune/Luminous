import type { Component } from 'solid-js';
import { CanvasApp } from './canvas/CanvasApp';
import { DataflowApp } from './dataflow/DataflowApp';
import { AtlasApp } from './atlas/AtlasApp';
import { LinenApp } from './linen/LinenApp';
import { MerinoApp } from './merino/MerinoApp';

export interface LuminousApp {
  id: string;
  label: string;
  component: Component;
}

export const APPS: LuminousApp[] = [
  { id: 'canvas', label: 'Canvas', component: CanvasApp },
  { id: 'dataflow', label: 'Dataflow', component: DataflowApp },
  { id: 'atlas', label: 'Atlas', component: AtlasApp },
  { id: 'linen', label: 'Linen', component: LinenApp },
  { id: 'merino', label: 'Merino', component: MerinoApp },
];
