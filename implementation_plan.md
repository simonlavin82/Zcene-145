# UI Polish: Remove Button Transparency for Solid Contrast & Sync Documentation

## Audit Findings
- **Secondary Buttons:** The core token in `<Button>` uses `bg-zinc-900/50` (base) and `hover:bg-zinc-800/80` (hover). These cascade down to the Artist Catalog in `DetailsPanel.tsx` and the Design System documentation.
- **Instant AI Query Chips (Spent State):** The spent state chips utilize `bg-zinc-950/30` along with `border-zinc-800/50`. 
- **Issue:** These opacity modifiers cause the Magazine view's patterned texture to bleed through, disrupting the deep, premium dark mode aesthetic by visually washing out the buttons.

## Implementation Plan

### 1. Solidify Secondary Buttons
- **Core Component (`DesignSystem.tsx`):**
  - Update `bg-zinc-900/50` ➔ `bg-zinc-900` (solid deep grey).
  - Update `hover:bg-zinc-800/80` ➔ `hover:bg-zinc-800` (solid hover state).
- **Artist Catalog (`DetailsPanel.tsx`):**
  - Update the manual `<a>` tags for YouTube, Bandcamp, and Official Website.
  - *Swap:* `bg-zinc-900/50 ... hover:bg-zinc-800/80` ➔ `bg-zinc-900 ... hover:bg-zinc-800`.

### 2. Solidify Instant AI Query Chips
- **Spent / Clicked State (`DetailsPanel.tsx`):**
  - Update `bg-zinc-950/30` ➔ `bg-zinc-950` (the darkest solid grey available without being black).
  - Update `border-zinc-800/50` ➔ `border-zinc-800` to maintain a crisp, solid boundary.

### 3. Sync Design System Documentation (`DesignSystem.tsx`)
- Ensure the official Style Guide remains the source of truth by updating the documentation blocks and color swatch visualizers:
  - **Secondary Buttons Docs:** Update swatch tooltip strings and colored `span` blocks from `bg-zinc-900/50` to `bg-zinc-900` and `hover:bg-zinc-800/80` to `hover:bg-zinc-800`.
  - **Query Chips Docs:** Update the "Spent / Clicked Status" section to strictly use `bg-zinc-950` and `border-zinc-800` across its component block and swatch labels.

## Execution
Once approved, I will use `multi_replace_file_content` to execute these precise token swaps across `DesignSystem.tsx` and `DetailsPanel.tsx` simultaneously.
