---
title: Glossary
summary: The Atlas controlled vocabulary — the terms Atlas docs use exactly, in the entry kinds of doc00.05
tags: [glossary, vocabulary, atlas]
deps: [doc01.07.01]
---

# Glossary

Atlas's controlled vocabulary, in the entry kinds of doc00.05. Docs in this
section use these terms exactly.

## Document

- **Node** — the basic unit.
  - A Node has at most one Container attached to it.
  - A Node has at most one Content.

- **Content** — the text a Node carries, and the Mode it is drawn in.

- **Mode** — whether a Content is drawn as markdown or as code.
  - Code is drawn monospaced.
  - A Mode records the intention of a Content, so an agent can read it.

## Structure

- **Container** — what a Node holds other Nodes in.
  - A Node has at most one Container.

- **Child** — a Node that is in the Container of another Node.
  `child-of(Node, Node)`

- **Parent** — the Node whose Container a given Node is in.
  `parent-of(Node, Node)`

## Layout

> The relation vocabulary. A term here is borrowed rather than coined wherever a
> standard one exists.

## Agent interface

> What an agent reads and writes.

## Unnamed

> Splits that recur but have no approved term yet. Each entry states the split,
> where it recurs, and candidate names — following the `*(unnamed)*` entry in
> doc01.05.03.
