import type { Component } from 'solid-js';
import { CanvasApp } from './canvas/CanvasApp';

export interface LuminousApp {
  id: string;
  label: string;
  component: Component;
}

export const APPS: LuminousApp[] = [{ id: 'canvas', label: 'Canvas', component: CanvasApp }];
