---
title: Glossary
summary: The Atlas controlled vocabulary — the terms Atlas docs use exactly, in the entry kinds of doc00.05
tags: [glossary, vocabulary, atlas]
deps: [doc01.07.01]
---

# Glossary

Atlas's controlled vocabulary, in the entry kinds of doc00.05. Docs in this
section use these terms exactly.

A term is added here only when the user asks for it. A term does not earn a place
by being capitalized in a requirement. Two kinds are kept out:

- **Basic, universal concepts** — UI elements, camera, and the like. These mean the
  same thing in every tool, so defining them says nothing about Atlas.
- **A state of another concept** — a term like "fit" is a state of the camera, not a
  concept of its own, and does not carry enough meaning to stand alone.

## Document

- **Node** — the basic unit.
  - A Node has at most one Container attached to it.
  - A Node has at most one Content.

- **Content** — the text a Node carries, and the Mode it is drawn in.

- **Mode** — whether a Content is drawn as markdown or as code.
  - Code is drawn monospaced.
  - A Mode records the intention of a Content, so an agent can read it.

- **Color** — the Color Token a Node is drawn in.
  - A Node has at most one Color.
  - A Node and its Container are drawn in the same Color.

- **Color Token** — a fixed, opaque category a Node can be set to.
  - A Color Token carries no color of its own; it is a slot, not a color name.
  - Each theme decides what color a Color Token is drawn as.

- **Swatch** — the Color Token as the user picks it, drawn in the color the theme assigns it.

## Structure

- **Container** — what a Node holds other Nodes in.
  - A Node has at most one Container.

- **Child** — a Node that is in the Container of another Node.
  `child-of(Node, Node)`

- **Parent** — the Node whose Container a given Node is in.
  `parent-of(Node, Node)`

- **Edge** — a connection from one Node to another. An Edge carries no label; it
  only connects. `edge(Node, Node)`

- **Port** — the point where an Edge route crosses a Container boundary.
  - Each Entry Port is a Port that an Edge uses to enter a Container.
  - Each Exit Port is a Port that an Edge uses to leave a Container.
  - Every Container has one Entry Port and one Exit Port.
  - One or more Edges may use the same Port.

- **Bisection** — splitting an Edge by inserting a Node between its two ends. The
  Edge `A → B` becomes `A → N → B`, and the new Node N carries the explanation as
  its Content. This is why an Edge carries no label: where an Edge needs
  explanation, the user bisects it, and the explanation is a Node, not text on the
  Edge.

## Layout

> The relation vocabulary. A term here is borrowed rather than coined wherever a
> standard one exists.

## Agent interface

> What an agent reads and writes.

## Unnamed

> Splits that recur but have no approved term yet. Each entry states the split,
> where it recurs, and candidate names — following the `*(unnamed)*` entry in
> doc01.05.03.
