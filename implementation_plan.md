# Implementation Plan: UI Polish & Design System Sync

## 1. Revert Control Shapes (`components/DesignSystem.tsx`)
- **Issue**: The `CanvasControlStyles` is currently using `rounded-full` which breaks the app's established boxy/rounded aesthetic.
- **Fix**: Update the `CanvasControlStyles` constant by replacing `rounded-full` with `rounded-xl` to restore visual consistency across the graph controls.

## 2. Update Search Placeholder (`components/GraphPage.tsx`)
- **Issue**: The placeholder text in the expanding search overlay uses generic terminology ("Find in graph...").
- **Fix**: Update the `placeholder` text on the `<input>` and the `aria-label` on the collapsed `<button>` from "Find in graph..." to "Find in spiderweb...".

## 3. Fix Magazine Button Overflow (`components/DesignSystem.tsx`)
- **Issue**: The Magazine View tri-state toggle mocks in the "Visual Anatomy" section are overflowing horizontally on narrow screens.
- **Fix**: Add `flex-wrap` to the parent flex container wrapping the two mock buttons (around line 3135) so they stack cleanly if horizontal space is constrained.

## 4. Update Toolbar Dropdown Example (`components/DesignSystem.tsx`)
- **Issue**: The "Toolbar Dropdown Trigger" static example (under "Form Controls") is outdated, showing a flat gray `bg-zinc-800` background.
- **Fix**: Update the mock button classes to use the new premium styling: change `bg-zinc-800` to `bg-zinc-950` and `hover:bg-zinc-700` to `hover:bg-zinc-900`.

## 5. Document Spiderweb Controls (`components/DesignSystem.tsx`)
- **Issue**: The floating canvas controls (Zoom, Center, Filter, Expanding Search) are completely missing from the design system documentation.
- **Fix**: 
  - Add a new entry `{ id: 'spiderweb-controls', title: 'Spiderweb Controls' }` to the `sections` navigation array.
  - Create a new `<section id="spiderweb-controls">` block immediately following the `spiderweb-legends` section. This new section will visually demonstrate the active and inactive states of the floating canvas controls utilizing the updated `CanvasControlStyles` primitive.

## Summary of Files to Modify
1. `components/DesignSystem.tsx` (Control shapes, Magazine overflow, Toolbar example, Spiderweb Controls documentation)
2. `components/GraphPage.tsx` (Search placeholder)
