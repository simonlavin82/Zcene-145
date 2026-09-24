# Strategic UI Refactor: Enforce The Depth Hierarchy Matrix

## Audit Findings
- **The Overcorrection:** By pushing Secondary Buttons and AI Query Chips to `bg-black` and `bg-zinc-950`, we solved the texture bleed but destroyed our elevation hierarchy. 
- **The Conflict:** Input fields (e.g., "Add artist", "Search") use `bg-black` because they are "Voids"—recessed areas designed to receive input. Buttons and chips are "Surfaces"—elevated interactive elements that should sit *above* the background. By making buttons black, they falsely read as recessed voids.

## Implementation Plan

### 1. Adopt the Depth Matrix
We will officially standardize our dark mode elevation logic into two distinct layers:
- **The Void (`bg-black` / `bg-zinc-950`):** Used strictly for recessed input fields, search bars, and inactive/spent states.
- **The Surface (`bg-zinc-900`):** Used for elevated interactive elements (Secondary Buttons, Available AI Chips, Dropdowns).

### 2. Refactor Secondary Buttons to Surfaces
- **Core Component (`DesignSystem.tsx`):**
  - Revert base background from `bg-black` ➔ `bg-zinc-900`.
  - Revert hover background from `hover:bg-zinc-950` ➔ `hover:bg-zinc-800`.
- **Artist Catalog (`DetailsPanel.tsx`):**
  - Sync the manual `<a>` tags to match (`bg-zinc-900` / `hover:bg-zinc-800`).

### 3. Refactor AI Query Chips & Dropdowns to Surfaces
- **Available Action Chips & Dropdowns (`DetailsPanel.tsx` & `DesignSystem.tsx`):**
  - Shift from `bg-zinc-950` ➔ `bg-zinc-900`.
  - Shift hover states from `hover:bg-zinc-900` ➔ `hover:bg-zinc-800`.
  - *(Note: Spent AI chips will remain `bg-zinc-950` as they correctly recede back towards the void).*

### 4. Enforce Documentation Strategy (`DesignSystem.tsx`)
- Scrub the visual swatches and documentation tooltips for all affected components to reflect the new `bg-zinc-900` tokens.
- **Add Depth Matrix Documentation:** I will add a new explanatory block in the Design System introduction (or the Buttons section) explicitly outlining the "Void vs. Surface" logic. This ensures future developers understand *why* inputs are black and buttons are zinc-900, preventing this regression from happening again.

## Execution
Once approved, I will execute these utility class swaps and inject the Depth Matrix documentation into the Style Guide.
