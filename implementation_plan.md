# Strategic UI Refactor: Palette Reduction & Brand Protection

## Concept & Architecture
The presence of Yellow and Orange in our global categorical palette creates visual friction and dilutes the core brand identity. By removing them, we protect the primary brand Yellow (`#F6E468`) to ensure it holds maximum visual weight for Seed Artists and primary actions.

## Implementation Plan

### 1. Strict Palette Reduction (`utils/formatters.ts`)
- **Execution:** Remove Yellow (`#EAB308`) and Orange (`#F59E0B`) from `zceneCategoricalPalette`. 
- **The New Palette (6 Colors):**
  - Index 0: Purple (`#A855F7`)
  - Index 1: Teal (`#2DD4BF`)
  - Index 2: Red (`#EF4444`)
  - Index 3: Blue (`#3B82F6`)
  - Index 4: Green (`#10B981`)
  - Index 5: Pink (`#EC4899`)

### 2. Node Remapping (`utils/formatters.ts`)
- **Execution:** We will update `nodeTypeColorMap` to map to the new array indices.
- **The New Mapping:**
  - `ai`: `zceneCategoricalPalette[0]` (Purple)
  - `country` (Origin): `zceneCategoricalPalette[1]` (Teal — beautifully complementary to the Yellow seed)
  - `genre`: `zceneCategoricalPalette[3]` (Blue)
  - `label`: `zceneCategoricalPalette[4]` (Green)
  - `founded`: `zceneCategoricalPalette[5]` (Pink)
  - `seed`: `'#F6E468'` (Brand Yellow)

### 3. Style Profiles Modal Sync (`SharedModals.tsx`)
- **Audit Findings:** The `PROFILE_COLORS` array in `SharedModals.tsx` currently contains 5 disconnected/legacy colors (purple, emerald, amber, rose, cyan). The color picker uses a flexbox layout (`flex items-center gap-2`), not a hardcoded grid.
- **Execution:** We will replace `PROFILE_COLORS` with the exact 6 colors of our new categorical palette. Expanding from 5 to 6 swatches will fit perfectly within the flex layout without breaking the modal architecture.

### 4. Design System Sync (`DesignSystem.tsx`)
- **Execution:** In the "Zcene Categorical Palette" section, we will remove the `ColorSwatch` components for Yellow and Orange.
- **Layout Adjustment:** We will adjust the grid from `grid-cols-4` to `grid-cols-3` (`grid grid-cols-2 md:grid-cols-3 gap-6`) so the remaining 6 colors sit perfectly balanced across two rows.

## Engineering Sign-Off
I have audited the downstream components. There are no layout breaks in the Style Modal, and shifting the Origin node to Teal is structurally sound—it provides much sharper contrast against the Yellow Seed Artist than the old Orange did.

I am ready to execute this plan.
