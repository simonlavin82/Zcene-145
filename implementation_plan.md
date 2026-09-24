# Strategic UI Refactor: Palette Finalization & State Sync Bug

## 1. Palette Reduction (5-Colors)
- **Investigation:** We need to remove Green (`#10B981`) to avoid clashes with Teal, locking in a hyper-distinct 5-color rotation.
- **Execution:** 
  - Remove Green from `zceneCategoricalPalette` in `utils/formatters.ts`.
  - Remove Green from the `PROFILE_COLORS` array in `SharedModals.tsx`.
  - Remove the Green `ColorSwatch` in `DesignSystem.tsx`. We will update the layout to `grid-cols-2 md:grid-cols-5` to perfectly balance the 5 colors across a single row on desktop screens.

## 2. Node Remapping & Contrast Verification
- **Execution (`utils/formatters.ts`):** 
  - Remap `label` to Teal (`zceneCategoricalPalette[1]`).
  - Remap `country` (Origin) to Red (`zceneCategoricalPalette[2]`).
- **Contrast Verification (Red vs Pink):** Red (`#EF4444`) is a warm, aggressive primary, while Pink (`#EC4899`) acts as a cool magenta. While they sit adjacent on the color wheel, their specific lightness and saturation values provide adequate visual separation for small SVG nodes on our dark `bg-zinc-950` canvas. However, we should monitor this closely—if they blend at a glance, we can easily swap one for a higher-contrast alternative later.

## 3. Debugging the Style State Sync Bug
- **Investigation:** I audited the Deep Cut state propagation. The bug originates in `DetailsPanel.tsx` (Lines 1158-1165). The `ProfileRow` component attempts to translate the string color name (e.g., `'teal'`) into a hex code using a hardcoded `hexMap`. 
- **The Bug:** This `hexMap` was never updated to reflect our new categorical color names. It still contained legacy keys (`emerald`, `amber`, `rose`, `cyan`). Because `'teal'` and `'red'` were not in the map, the lookup returned `undefined` and triggered the fallback `|| '#a855f7'`, forcing everything to render as Purple.
- **Execution:** I will update the inline `hexMap` in `DetailsPanel.tsx` to properly map the 5 new active style profile names (`purple`, `teal`, `red`, `blue`, `pink`) directly to their exact categorical hex codes.

## Sign-Off
I am ready to execute these changes to lock in the 5-color palette and restore the dynamic progress bar coloring. Let me know if you approve this plan!
