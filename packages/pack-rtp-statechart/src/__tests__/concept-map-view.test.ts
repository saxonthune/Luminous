import { describe, it, expect } from 'vitest';
import { conceptMapView } from '../config/views/concept-map.ts';

describe('conceptMapView', () => {
  it('has correct id and name', () => {
    expect(conceptMapView.id).toBe('concept-map');
    expect(conceptMapView.name).toBe('Concept map');
  });

  it('rtp.concept is spatial', () => {
    expect(conceptMapView.nodeRoles['rtp.concept']).toBe('spatial');
  });

  it('statechart.state is hidden', () => {
    expect(conceptMapView.nodeRoles['statechart.state']).toBe('hidden');
  });

  it('statechart.region is hidden', () => {
    expect(conceptMapView.nodeRoles['statechart.region']).toBe('hidden');
  });

  it('statechart.composite is hidden', () => {
    expect(conceptMapView.nodeRoles['statechart.composite']).toBe('hidden');
  });

  it('rtp.action is spatial', () => {
    expect(conceptMapView.nodeRoles['rtp.action']).toBe('spatial');
  });

  it('rtp.belongs-to-concept is contain', () => {
    expect(conceptMapView.edgeRoles['rtp.belongs-to-concept']).toBe('contain');
  });

  it('statechart.transition edge role is hidden', () => {
    expect(conceptMapView.edgeRoles['statechart.transition']).toBe('hidden');
  });

  it('layout algorithm is force', () => {
    expect(conceptMapView.layout.algorithm).toBe('force');
  });

  it('orphan-action-highlight layer is on', () => {
    expect(conceptMapView.layers['orphan-action-highlight']).toBe('on');
  });
});
