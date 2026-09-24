# Strategic UI Refactor: Brutalist Crate Borders & Graph Node Normalization

## Concept & Architecture
We are dialing back the "sci-fi" aesthetic by enforcing strict brutalist borders on the Dashboard crates. Simultaneously, we are correcting visual desyncs within the Spiderweb Graph to ensure the Seed Artist node and its corresponding legend icon carry the correct brand weight and color.

## Implementation Plan

### 1. Spiderweb Graph & Legend Fixes
- **Node Color Correction (`formatters.ts`, `MusicGraph.tsx`, `ExampleMusicGraph.tsx`):** 
  - The Seed Artist node is currently mapped to a standard palette yellow, which may be rendering with an orange tint, while the stroke is picking up a different value.
  - We will explicitly force the Seed Artist's fill and stroke to the core brand primary yellow (`#F6E468`) in both the D3 node rendering logic and the `nodeTypeColorMap` to ensure absolute consistency.
- **Legend Normalization (`GraphPage.tsx`, `ExampleMusicGraph.tsx`, `DesignSystem.tsx`):**
  - The `d3.symbolCircle` used for the Seed Artist in the UI legends currently has a `size` prop of `260`, making it appear visually smaller than the star (`400`) or diamond (`320`).
  - We will increase the `size` prop of the circle symbol across all legend configurations (to roughly `400` or `450`) so its visual volume matches the other geometric shapes perfectly. We will also ensure its fill color relies strictly on `#F6E468`.

### 2. Dashboard Crate Borders (Anti-Sci-Fi)
- **Target Component:** `Dashboard.tsx`
- **The Issue:** The dynamic colored structural stroke (`${crateColor}33`) wraps the entire crate, giving it a glowing neon/sci-fi appearance that conflicts with our brutalist roots.
- **New Execution:**
  - We will strip the dynamic `borderColor` from the inline styles of the main crate containers in both the Grid and List views.
  - We will revert the outer border to the standard, hard-edged `border-zinc-800` utility class.
  - The solid, fully opaque folder tabs will remain exactly as they are.
  - The ultra-low opacity ambient background wash (`${crateColor}0A`) inside the crate body will be retained, providing subtle depth without the glowing edge.

## Execution
Once approved, I will implement the border corrections in `Dashboard.tsx`, normalize the legend circle sizes, and enforce the pure primary brand yellow for the Seed Artists across the graph logic.
