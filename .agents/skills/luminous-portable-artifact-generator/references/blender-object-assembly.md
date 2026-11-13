# Blender Object Assembly

An authoring recipe for an overview of a complete modeled object, its component tree, shared geometry masters, and the artistic controls available at each point. This convention uses the implemented tree layout, Card badges, and modifier sections. It does not register a new parser layout keyword.

## Meaning and structure

Begin with the complete object as the single root. Follow composition into parts, representative array units, and foundational shape constructions. An array has a count and spacing with one unit subtree, rather than an inventory of every repeated instance. Keep master-linked parts inside the composition where they are used. Use the master's role color for linked parts. Describe source identity separately when multiple masters could be confused.

A node names one part or foundational shape. Its body explains geometry or an attachment rule. Put scalar settings in named modifier sections rather than flattening them into prose. Each parameter has a name and a string value, including units when known. Separate current settings from design questions using section names such as “Placement” and “Controls to decide”. The artifact displays a snapshot; editable sliders or a connection to Blender require separate implementation.

## Status badges

Use `Block` for an existing part whose present geometry is a blockout approximation. A blockout may already have a developed intended shape. Use `Master linked` for a part that derives geometry from a master, `To design` for unresolved design, and a count badge such as `12 units` for array repetition. These latter labels are initial authoring choices and can evolve with use. Status text moves into badges wherever it would otherwise repeat in multiple bodies. Keep meaningful uncertainty in the body when the badge cannot express it.

Badges convey status, while node color conveys role or master association. Do not use change-diff badges to mean blockout status. Declare role colors in the canvas legend and explain the badge meanings in nearby prose.

## Input

Use `mermaid rest-api-tree` and `flowchart LR` for the current collapsible tree layout, with `rest-card` nodes and empty `methods`. This reuses the available tree infrastructure. The nodes represent Blender components, not HTTP endpoints.

```yaml
# portable-nodes, after the Mermaid tree
base:
  component: rest-card
  methods: []
  title: Lever base
  badges: [Master linked]
  modifiers:
    - name: Sphere slice
      parameters:
        - { name: Width, value: '1.0' }
        - { name: Depth, value: '0.4' }
        - { name: Height, value: '0.18' }
  body: Sphere intersected with symmetric cutting planes.
```

The generator validates the badge list and modifier-section structure, measures the styled cards, and validates the declared tree topology. It does not validate Blender dependencies, units, geometric feasibility, or whether a current-versus-planned classification is correct. Retain the scene snapshot and authoring script when a design is derived from Blender.

## Requirements pending review

```yaml rhidoc-feature
prefix: BOA
name: Blender Object Assembly
description: >-
  Readers can inspect the complete component design and the modifiers at each
  point to reason about the object before implementation.
```

- **BOA1.** [p] The artifact has a Blender Object Assembly recipe.
- **BOA2.** [p] Parts currently represented by blocks carry a badge indicating that state.
- **BOA3.** [p] Repeated status text is represented by badges where appropriate.
- **BOA4.** [p] Modifier settings are styled to make them easier to read.

Evidence for this batch is the user's request to “make a blender-object-assembly recipe for the artifacts”, add “a badge for parts that are currently 'block's”, add badges “where you have the same text duplicated”, and add “more styling around modifiers to make them easier to read”. Existing array abstraction, master color, and component-tree conventions come from the preceding arithmometer artifact iterations.
