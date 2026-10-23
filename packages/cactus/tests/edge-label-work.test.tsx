import { expect, it, vi } from 'vitest';
import { createSignal } from 'solid-js';
import { render } from 'solid-js/web';
import { EdgeLayer } from '../src/EdgeLayer';
import { routeEdges } from '../src/edgeRouting';

it('skips collision work for line layers and hidden labels, and restores shown labels', () => {
  const edges = [{ id: 'edge', sourceId: 'a', targetId: 'b', labelText: 'calls' }];
  const rects = new Map([['a', {x:0,y:0,w:60,h:40}], ['b', {x:200,y:0,w:60,h:40}]]);
  const routes = routeEdges(edges,rects);
  const readRects = vi.fn(() => rects);
  const [shown,setShown] = createSignal(false);
  const container = document.createElement('div'); document.body.append(container);
  const dispose = render(() => <svg>
    <EdgeLayer edges={edges} routes={()=>routes} getNodeRects={readRects}
      emphasisNodeIds={()=>[]} emphasisStyle={{dimUnselected:false,selectedWidthMultiplier:1}}
      layer="lines" zoom={()=>1}/>
    <EdgeLayer edges={edges} routes={()=>routes} getNodeRects={readRects}
      emphasisNodeIds={()=>[]} emphasisStyle={{dimUnselected:false,selectedWidthMultiplier:1}}
      lod={()=>({labelVisible:shown()})} layer="labels" zoom={()=>1}/>
  </svg>,container);
  try {
    expect(readRects).not.toHaveBeenCalled();
    expect(container.querySelector('text')).toBeNull();
    setShown(true);
    expect(readRects).toHaveBeenCalled();
    expect(container.querySelector('text')?.textContent).toBe('calls');
    setShown(false); readRects.mockClear();
    expect(container.querySelector('text')).toBeNull();
    expect(readRects).not.toHaveBeenCalled();
  } finally { dispose();container.remove(); }
});
