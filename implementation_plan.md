# Strategic UI Refactor: Crate Tabs & Legend Synchronization

## Concept & Architecture
We are completing the final polish of the Crate-Digger Dashboard and the Zcene Categorical Palette consolidation. This involves two distinct visual refinements:
1. **Physical Record Shop Tabs:** Enhancing the tactile feel of the Dashboard crates by turning the folder tabs into solid, brightly-coloured plastic dividers with stark black text.
2. **Legend Synchronization:** Ensuring that the hardcoded interactive graph legends perfectly mirror the dynamic colour assignments executed by the D3 `scaleOrdinal` physics engine.

## Implementation Plan

### 1. Physical Crate Tabs (Dashboard Styling)
- **Target Component:** `Dashboard.tsx`
- **Current State:** The folder tab uses a dark background (`bg-zinc-950` with a 4% colour wash) and coloured text.
- **New Execution:**
  - We will modify the inline styles of the tab container to use the full 100% opacity categorical colour as its `backgroundColor`.
  - The text colour will be flipped from the categorical colour to pure brand black (`#111113` or `#000000`).
  - We will remove the coloured top border on the tab (as the entire tab is now a solid block of colour).
  - The main crate body will retain its 4% ambient wash and 20% structural stroke.
  - This change needs to be applied to both the Grid View crates and the List View divider tabs.

### 2. Graph Legend Synchronization
- **The Challenge:** D3's `scaleOrdinal` assigns colours to new node types as they are discovered in the dataset. However, our UI legends (which act as filters) are currently hardcoded with legacy colours (e.g., `#3B82F6` for Genre).
- **The Solution:** We must pre-map the standard node types ('genre', 'label', 'country', 'founded') to our new `zceneCategoricalPalette` so both the D3 engine and the React UI draw from the exact same deterministic source.
- **Execution Strategy:**
  1. **Define a Deterministic Map (`utils/formatters.ts`):** 
     - We will create an exported constant `nodeTypeColorMap` that explicitly maps specific node types to specific colours from our `zceneCategoricalPalette`.
     - *Example:* `genre` -> Palette Index 0 (Purple), `label` -> Palette Index 1 (Teal), etc.
     - Seed artists (Yellow) and AI artists (Purple) will remain explicitly mapped as they are core functional identities, not generic categories.
  2. **Update Graph Physics (`MusicGraph.tsx` & `ExampleMusicGraph.tsx`):**
     - We will update the `getNodeColor` logic. Instead of relying purely on a sequential `d3.scaleOrdinal()`, we will first check our `nodeTypeColorMap`. If the node type exists in the map, we use that exact colour. If it's a completely new/unknown type, we can fallback to `d3.scaleOrdinal()`.
  3. **Update UI Legends (`MusicGraph.tsx`, `ExampleMusicGraph.tsx` & `DesignSystem.tsx`):**
     - We will refactor the hardcoded legend HTML/JSX to dynamically pull background and text colours from the `nodeTypeColorMap`.

## Execution
Once approved, I will implement the deterministic colour map in `formatters.ts`, wire it into the graphs and legends, and apply the solid background styling to the Dashboard crate tabs.
