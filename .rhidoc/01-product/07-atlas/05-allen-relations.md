---
title: Allen relations
summary: Neutral reference on Allen's interval algebra — the thirteen relations, their symbols and inverses — and Rectangle Algebra, which applies them per axis to axis-aligned boxes
tags: [reference, allen, rectangle-algebra, spatial, relations]
deps: []
---

# Allen relations

A neutral reference. Allen's interval algebra describes how two intervals on one
line can relate. Rectangle Algebra applies it per axis to describe how two
axis-aligned boxes relate on a plane. Nothing here is specific to a project.

## The thirteen relations

From Allen (1983). Six inverse pairs plus one self-inverse relation.

| Relation | Symbol | Inverse | Symbol | X relates to Y |
|---|---|---|---|---|
| before | `<` | after | `>` | X ends before Y starts, with a gap |
| meets | `m` | met-by | `mi` | X's end is Y's start — no gap |
| overlaps | `o` | overlapped-by | `oi` | X starts first, the two overlap, X ends first |
| starts | `s` | started-by | `si` | Same start; X ends first |
| during | `d` | contains | `di` | X strictly inside Y |
| finishes | `f` | finished-by | `fi` | Same end; X starts later |
| equal | `=` | *(self-inverse)* | `=` | Identical extent |

The set is jointly exhaustive and pairwise disjoint: any two intervals stand in
exactly one of the thirteen relations.

## Rectangle Algebra

Rectangle Algebra applies Allen's relations independently to each axis. A
relation between two axis-aligned boxes is a pair — one Allen relation for the
x-extent, one for the y-extent — so there are 13 × 13 = 169 of them.

Read on a plane whose y-axis grows downward:

| Allen relation | On the x-axis | On the y-axis |
|---|---|---|
| before | X entirely left of Y | X entirely above Y |
| meets | X's right edge is Y's left edge | X's bottom edge is Y's top edge |
| overlaps | horizontal overlap, X starts further left | vertical overlap, X starts higher |
| starts | same left edge, X narrower | same top edge, X shorter |
| during | X's width strictly inside Y's | X's height strictly inside Y's |
| finishes | same right edge, X narrower | same bottom edge, X shorter |
| equal | same left and right edges | same top and bottom edges |

A pair of relations translates mechanically to inequalities on box edges. For
example, X `(<, =)` Y is `X.x2 < Y.x1 ∧ X.y1 = Y.y1 ∧ X.y2 = Y.y2`.

## Source

Allen, J. F. (1983). "Maintaining Knowledge about Temporal Intervals."
*Communications of the ACM*, 26(11), 832–843.
