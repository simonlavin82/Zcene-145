# Implementation Plan: Badge Taxonomy & Design System Sync

## 1. Spiderweb Legend Update
- **Files:** `components/GraphPage.tsx` and `components/ExampleMusicGraph.tsx`
- **Action:** Locate the `recommended` property in the legend/filter configurations. Change the `label` from `'AI Artist'` to `'Artist'`. The equalizer icon (`shape` property) will be kept intact.

## 2. Deep Cut Badges Refactor (`DetailsPanel.tsx`)
- **Base Entity:** The base badge currently renders `{node.type}`. I will update its CSS classes to match the Design System (removing the border, using `rounded-xl`, and adjusting opacity/text color to `-300` equivalents, e.g., `text-zinc-300 bg-zinc-800/50`).
- **Origin Tag (SEED vs AI):** 
  - Remove the `isAiSuggestion` boolean and its corresponding badge block entirely.
  - Replace the `isManualAdd` logic and badge with a direct check for `isSeedArtist`. If it is a seed, render the `SEED` badge using the emerald styling.
- **Library Fix:** The current logic (`normalizeArtistId(node.id)`) can fail if `node.id` differs from the library name. I will update the logic to resolve the name first:
  ```typescript
  const resolvedName = getArtistDisplayName(details, node);
  const isLibraryArtist = isArtistNode && libraryArtistSet.has(normalizeArtistId(resolvedName));
  ```
- **Styling Alignment:** I will update the CSS class strings for all badges in `DetailsPanel.tsx` (Base, SEED, LIBRARY) to exactly match the aesthetic in `DesignSystem.tsx`:
  - Replace `rounded-md` with `rounded-xl`.
  - Remove inline borders (e.g. `border border-emerald-500/30`).
  - Drop the text color intensity from `400` to `300` (e.g. `text-emerald-300`, `text-sky-300`).
  - Use `tracking-widest` instead of `tracking-[0.2em]`.

## 3. Design System Sync (`DesignSystem.tsx`)
- **Action:** In the "Badges & Tags" section, I will replace the deprecated `<BadgeDisplay>` components (`AI`, `Manual`, `Library`).
- **New Components:**
  - **ARTIST / LABEL (Base):** Add `<BadgeDisplay>` entries for the base entities with neutral/zinc styling.
  - **SEED:** Add a `<BadgeDisplay>` using the emerald aesthetic (`bg-emerald-500/20 text-emerald-300`) to denote anchor nodes.
  - **LIBRARY:** Update the existing `<BadgeDisplay>` to ensure it uses the correct `rounded-xl` and borderless styling (`bg-sky-500/20 text-sky-300`).
- **Documentation:** Update the title and descriptions to reflect the new taxonomy (e.g., explaining that "SEED" represents the user's starting point and all other artists are discovery nodes). I will also ensure any "AI ARTISTS" references in the metric badges section are updated to just "ARTISTS" to reflect the platform-wide drop of the "AI" label.
