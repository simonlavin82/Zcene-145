# Strategic UI Audit: Secondary Button Modernization

## Audit Findings
- **Current State of `<Button>` Component:** The `secondary` variant within the core `<Button>` component (`DesignSystem.tsx`) was partially updated in the previous refactor to use `bg-zinc-900/60`, but the "Secondary Buttons" documentation block in `DesignSystem.tsx` and the actual usage in the Artist Catalog (`DetailsPanel.tsx`) are still hardcoded with the dated `bg-zinc-800 border-zinc-700 text-zinc-300` utility classes.
- **Link Components:** The Artist Catalog items (YouTube, Bandcamp, Official Website) are rendered as `<a>` tags. Since our `<Button>` component strictly renders a `<button>` element, these links are currently maintaining their own bespoke duplicated class lists instead of inheriting from a single token.

## Implementation Plan

1. **Modernize and Extract Secondary Token (`DesignSystem.tsx`)**
   - Ensure the `secondary` variant in `<Button>` is perfectly tuned to the deep neutral aesthetic: `border border-zinc-800 text-zinc-400 bg-zinc-900/50 hover:text-white hover:border-zinc-700 hover:bg-zinc-800/80` (or similar).
   
2. **Refactor "Secondary Buttons" Documentation (`DesignSystem.tsx`)**
   - Replace the hardcoded `<div>` wrappers in the "Secondary Buttons" documentation section with actual usages of the `<Button variant="secondary">` component, so the visual style guide accurately reflects the new modernized look.

3. **Cascade to Artist Catalog (`DetailsPanel.tsx`)**
   - Since the Artist Catalog buttons are anchor links (`<a>`), I will update their `className` string to exactly match the new base + secondary variant classes from our unified `<Button>` component. 
   - *Alternative/Preferred:* I will apply the updated `bg-zinc-900/50 border-zinc-800` classes directly to these anchor tags, keeping `justify-start` to maintain the left-aligned layout of the catalog.

## Verification
- Updating these classes will safely cascade the visual style without breaking the layout because we are only modifying colors, borders, and opacities (backgrounds and borders). We will retain structural layout classes like `w-full`, `px-4 py-2`, `flex items-center justify-start` to ensure layout safety.

*Awaiting approval before execution.*
