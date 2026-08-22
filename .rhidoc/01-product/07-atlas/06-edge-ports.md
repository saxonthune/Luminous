---
title: Edge ports
summary: Ports on Container boundaries guide an Edge through shared inside and outside face anchors
tags: [atlas, edges, ports, routing, containment, ui]
deps: [doc01.07.03, doc01.07.04, doc02.05.01]
---

# Edge ports

A Port makes a containment crossing visible and adjustable. An Edge remains one
Edge while its route passes through the Ports between its source and target
(doc01.07.04, R84).

## Ports

- **EP1.** The system shall draw one Entry Port and one Exit Port on every
  Container.
- **EP2.** The system shall draw a Port as a pill that straddles its Container's
  bezel, with the center of the pill aligned to the center of the bezel.
- **EP3.** When a Container has no stored Entry Port position, the system shall
  place its Entry Port at the middle of its left side.
- **EP4.** When a Container has no stored Exit Port position, the system shall
  place its Exit Port at the middle of its right side.
- **EP5.** The system shall give each Port one route anchor at the middle of its
  inside face and one route anchor at the middle of its outside face.
- **EP6.** When one or more Edges use the same Port, the system shall draw every
  contained segment to the shared inside anchor and every external segment from
  the shared outside anchor.
- **EP7.** The system shall keep a Port's size fixed regardless of how many
  Edges use it.
- **EP20.** The system shall draw a Port longer than it is thick and wide
  enough across the boundary to clasp the Container border. A Port is vertical
  on a left or right side and horizontal on a top or bottom side.
- **EP17.** The system shall keep both Ports visible while their Container
  exists. An unused Port is faint; a used, hovered, or dragged Port is strong.
- **EP18.** An Entry Port shall show an inward-pointing chevron. An Exit Port
  shall show an outward-pointing chevron.

## Routes

- **EP8.** When an Edge leaves a Container, the system shall route the Edge
  through that Container's Exit Port.
- **EP9.** When an Edge enters a Container, the system shall route the Edge
  through that Container's Entry Port.
- **EP10.** When an Edge crosses more than one Container boundary, the system
  shall order its Ports from the source outward through Exit Ports, then from
  the shared containing scope inward through Entry Ports to the target.
- **EP11.** When an Edge's source and target occupy the same Container, the
  system shall route the Edge directly without using that Container's Ports.

## Placement

- **EP12.** The system shall allow the user to drag a Port around its
  Container's perimeter, including across a corner onto an adjacent side.
- **EP13.** While the user drags a Port, the system shall draw the Port at its
  preview position and redraw the Edges that use it.
- **EP14.** When the user finishes dragging a Port, the system shall store its
  side and its normalized offset along that side in the Document.
- **EP15.** When a Container moves, the system shall move its Ports with it.
- **EP16.** When a Container changes size, the system shall keep each Port on
  its stored side at its stored normalized offset.
- **EP19.** When a Node's last Child leaves or is removed, the system shall
  remove the Node's stored Port positions with its Container.

## Document shape

A Node that owns a Container may store these optional fields:

```ts
ports?: {
  entry?: { side: 'top' | 'right' | 'bottom' | 'left'; offset: number }
  exit?: { side: 'top' | 'right' | 'bottom' | 'left'; offset: number }
}
```

The offset ranges from `0` at the start of a side to `1` at its end. An absent
position selects the default in EP3 or EP4.
