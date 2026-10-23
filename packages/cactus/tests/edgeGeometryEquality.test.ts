import { expect, it } from 'vitest';
import { sameEdgeGeometry, type EdgeGeometry } from '../src/edgeRouting';
it('preserves unchanged routes but detects shape, layer and clipping changes', () => {
  const a: EdgeGeometry={x1:0,y1:0,x2:100,y2:100,labelX:50,labelY:50,points:[{x:0,y:0},{x:100,y:100}],segmentLayers:[0],contentOverlays:[{band:1,clipRect:{x:0,y:0,w:50,h:50}}]};
  expect(sameEdgeGeometry(a,structuredClone(a))).toBe(true);
  for(const change of [
    (b:EdgeGeometry)=>{b.points[1].x++},
    (b:EdgeGeometry)=>{b.labelX++},
    (b:EdgeGeometry)=>{b.segmentLayers[0]++},
    (b:EdgeGeometry)=>{b.contentOverlays[0].clipRect.w++},
    (b:EdgeGeometry)=>{b.contentOverlays[0].band++},
  ]) {const b=structuredClone(a);change(b);expect(sameEdgeGeometry(a,b)).toBe(false);}
});
