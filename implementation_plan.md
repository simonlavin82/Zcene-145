# Strategic UI Refactor: Palette Refinement

## 1. Palette Upgrade (5-Colors)
- **Execution:** We will update `zceneCategoricalPalette` in `utils/formatters.ts` to swap Red for Vivid Indigo and Blue for Electric Sky.
- **The New Palette (5 Colors):**
  - Index 0: Purple (`#A855F7`)
  - Index 1: Teal (`#2DD4BF`)
  - Index 2: Electric Sky (`#38BDF8`)
  - Index 3: Vivid Indigo (`#6366F1`)
  - Index 4: Pink (`#EC4899`)

## 2. Node Remapping
- **Execution (`utils/formatters.ts`):** 
  - `ai`: `zceneCategoricalPalette[0]` (Purple)
  - `label`: `zceneCategoricalPalette[1]` (Teal)
  - `genre`: `zceneCategoricalPalette[2]` (Electric Sky)
  - `country` (Origin): `zceneCategoricalPalette[3]` (Vivid Indigo)
  - `founded`: `zceneCategoricalPalette[4]` (Pink)
  - `seed`: `'#F6E468'` (Brand Yellow)

## 3. Global Sync
- **State Sync (`DetailsPanel.tsx`):**
  - We will update `hexMap` to map the new keys `sky` (or `electricsky`) and `indigo` to their respective hex codes (`#38bdf8`, `#6366f1`) and remove `red` and `blue`.
- **Modal Sync (`SharedModals.tsx`):**
  - We will update `PROFILE_COLORS` to include the exact names and background classes for the new colors (`bg-[#38bdf8]` and `bg-[#6366f1]`).
- **Design System (`DesignSystem.tsx`):**
  - We will replace the "Red" and "Blue" `ColorSwatch` components with "Electric Sky" (`#38BDF8`) and "Vivid Indigo" (`#6366F1`). The grid will remain `grid-cols-5`.

## Sign-Off
This plan guarantees perfect complementary harmony with the Brand Yellow and introduces the requested high-luminance tones. Let me know if this strategy is approved!
