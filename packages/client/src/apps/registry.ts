import type { Component } from 'solid-js';
import { CanvasApp } from './canvas/CanvasApp';
import { DataflowApp } from './dataflow/DataflowApp';

export interface LuminousApp {
  id: string;
  label: string;
  component: Component;
}

export const APPS: LuminousApp[] = [
  { id: 'canvas', label: 'Canvas', component: CanvasApp },
  { id: 'dataflow', label: 'Dataflow', component: DataflowApp },
];
