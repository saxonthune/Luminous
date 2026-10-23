# Recipe pipeline

This notebook follows inputs through generation and then into browser state.
The Recipe engine is a **design proposal**, while Portable renders these canvases today.

## Inputs, operations, and results

Beige cards hold data; green cards are operations; blue is mutable state; rose marks events or choices. Solid arrows carry data; dashed arrows indicate a condition or event.

```mermaid
flowchart TB
  subgraph generation[GENERATION - proposed Recipe pipeline]
    direction TB
    subgraph inputStage[1. Read source and resolve conventions]
      direction LR
      source[INPUT: Diagram source<br/>Content, links, groups, optional roles]:::data
      parse[OPERATION: Import source]:::operation
      graphData[RESULT: Graph<br/>Node and edge records]:::data
      choice[INPUT: Recipe selection<br/>Omitted means Standard]:::data
      resolve[OPERATION: Resolve Recipe<br/>Standard or specialized definition]:::operation
      recipe[RESULT: Resolved defaults<br/>Presentation, layout, optional checks]:::data
      source --> parse --> graphData
      choice --> resolve --> recipe
    end
    subgraph projectionStage[2. Decide how the graphData will be shown]
      direction LR
      local[INPUT: Diagram-local choices<br/>Experimental styling and slot bindings]:::data
      theme[INPUT: Theme values<br/>Ground by default; named slots]:::data
      project[OPERATION: Check and project<br/>Apply defaults and local choices]:::operation
      diagnostics[RESULT: Diagnostics<br/>Integrity errors and optional warnings]:::data
      visuals[RESULT: Visual descriptions<br/>Labels, forms, slot bindings, bounds]:::data
      local --> project
      theme -->|resolve visual tokens| project
      project --> diagnostics
      project --> visuals
    end
    graphData --> project
    recipe --> project
    subgraph layoutStage[3. Compute and package]
      direction LR
      layout[OPERATION: Cactus layout<br/>Bounds plus links plus settings]:::operation
      defaults[RESULT: Default positions<br/>Immutable reset target]:::data
      runtime[INPUT: Runtime code and CSS<br/>Solid, cactus, Portable controls]:::data
      bundle[OPERATION: Bundle HTML]:::operation
      html[RESULT: Self-contained HTML<br/>Data, defaults, theme, runtime]:::data
      layout --> defaults --> bundle --> html
      runtime --> bundle
    end
    visuals --> layout
    graphData -->|connectivity| layout
    recipe -->|layout defaults| layout
    diagnostics -.->|if no blocking errors| bundle
    visuals --> bundle
    theme --> bundle
    graphData --> bundle
  end
  subgraph browser[BROWSER - data and enabled operations]
    direction LR
    init[OPERATION: Open artifact<br/>Read embedded data and mount]:::operation
    state[STATE: Current positions<br/>Viewport, selection, active theme]:::state
    input[EVENT: Drag, pan, zoom, select<br/>Dispatch corresponding handler]:::event
    update[OPERATION: Update relevant state]:::operation
    draw[OPERATION: Update DOM and SVG<br/>Node geometry, edge paths, styles]:::operation
    pixels[RESULT: Browser-rendered image]:::data
    reset[EVENT: Reset layout<br/>Copy embedded defaults to positions]:::event
    init --> state
    input -.-> update
    state -->|read| update
    update -->|write| state
    state --> draw --> pixels
    reset -.-> update
  end
  html --> init
  defaults -->|embedded reset source| reset
  subgraph authoring[AUTHORING PATH - can happen over many diagrams]
    direction LR
    free[Start with Standard<br/>Flexible graph and theme slots]:::event
    evolve[Build and refine a diagram<br/>Discover useful conventions]:::operation
    formalize[Formalize a Recipe<br/>Extract reusable purpose and defaults]:::operation
    free --> evolve --> formalize
  end
  formalize -.->|optional specialized Recipe for later generation| choice
```

## Discover a Recipe through use

Start without a specialized Recipe. Build a diagram using the Standard Recipe,
experiment with theme slots, and extract useful conventions once they emerge.
This canvas can be moved, fitted, and reset independently of the pipeline above.

```mermaid
flowchart LR
  standard[Standard Recipe] --> diagram[Build a flexible diagram]
  diagram --> refine[Refine purpose and conventions]
  refine --> recipe[Formalize a specialized Recipe]
  recipe --> next[Use it for another diagram]
```

## Reading the runtime portion

The generated HTML carries data and executable instructions. Opening it creates
browser state. Pointer and keyboard events change selected parts of that state;
Solid and cactus update the DOM and SVG that the browser renders.

Changing one canvas does not change the other canvas. The page theme is shared.
