# UI Polish: Enforce Premium Black & Remove Base Transparency

## Audit Findings
- **Secondary Buttons:** Currently set to `bg-zinc-900`, which in the context of the Zcene dark mode palette, reads too light (grey) rather than a true premium dark tone.
- **Available AI Query Chips:** Currently set to `bg-transparent`. While this looks clean in isolation, it completely fails to mask the Magazine view's background texture, causing severe visual bleed.
- **Interactive Connection Dropdown:** Also set to `bg-transparent`, suffering from the same background bleed.

## Implementation Plan

### 1. Upgrade to Premium Black (Secondary Buttons)
- **Core Component (`DesignSystem.tsx`):**
  - Update base background: `bg-zinc-900` ➔ `bg-black` (or `bg-zinc-950` for a softer dark). I recommend `bg-zinc-950` as it integrates seamlessly with the zinc borders, but we can go full `bg-black` for maximum contrast.
  - Update hover background: `hover:bg-zinc-800` ➔ `hover:bg-zinc-900` to maintain a subtle, premium interaction.
- **Artist Catalog (`DetailsPanel.tsx`):**
  - Sync the manual `<a>` tags to match the core component (`bg-zinc-950` / `hover:bg-zinc-900`).

### 2. Block Texture Bleed (Instant AI Query Chips & Dropdown)
- **Available Action Chips (`DetailsPanel.tsx` & `DesignSystem.tsx`):**
  - Update `bg-transparent` ➔ `bg-zinc-950`. This provides a solid, ultra-dark base that completely blocks the background texture while remaining visually distinct from the borders.
  - Update hover state to `hover:bg-zinc-900`.
- **Interactive Connection Dropdown (`DetailsPanel.tsx` & `DesignSystem.tsx`):**
  - Update `bg-transparent` ➔ `bg-zinc-950` and hover to `hover:bg-zinc-900` to match the available action chips perfectly.

### 3. Sync Design System Documentation (`DesignSystem.tsx`)
- Scrub the visual swatches and documentation tooltips for both "Secondary Buttons" and "Instant AI Query Chips" to reflect the new ultra-dark tokens (`bg-zinc-950`, `bg-black`). 
- Specifically, the `<span>` color blocks will be updated to render the exact hex values so the documentation remains the absolute source of truth.

## Execution
Once you approve the choice between `bg-zinc-950` and `bg-black` for the secondary buttons, I will execute the replacements across both files to lock in the premium aesthetic.
