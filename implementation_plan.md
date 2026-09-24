# UI Polish: Secondary Button Stroke & Layout Documentation

## Audit Findings
- **Stroke Contrast Issue:** The recent modernization of the secondary button introduced `border-zinc-800`, which lacks sufficient contrast against the deep `bg-zinc-900/50` background, causing the stroke to virtually disappear. By examining the "Exit Magazine" button, we observed it utilizes `border-zinc-700` with a `hover:border-zinc-600` state, which provides the desired crisp definition.
- **Layout Modifier Documentation:** The Zcene design system currently doesn't explicitly document how layout overrides (e.g., `w-full justify-start`) should be handled. We need to formalize this to prevent future developers from creating bespoke tokens for simple layout variants like the Artist Catalog.

## Implementation Plan

1. **Fix the Stroke Contrast (`DesignSystem.tsx`)**
   - Update the `secondary` variant in the core `<Button>` component to restore the crisp border:
     *From:* `border-zinc-800 ... hover:border-zinc-700`
     *To:* `border-zinc-700 ... hover:border-zinc-600`
   - The deep background (`bg-zinc-900/50`) will remain untouched as requested.

2. **Document Layout Modifiers (`DesignSystem.tsx`)**
   - In the "Secondary Buttons" section, append the following to the description text:
     *"While buttons default to center alignment, they fully support structural overrides (e.g., `w-full justify-start`) for contextual uses like vertical catalog menus. This ensures layout flexibility without creating bespoke tokens."*

3. **Cascade Fix to Artist Catalog (`DetailsPanel.tsx`)**
   - Update the manual anchor (`<a>`) tags rendering the YouTube, Bandcamp, and Official Website links in the Artist Catalog.
   - Swap `border-zinc-800 hover:border-zinc-700` back to `border-zinc-700 hover:border-zinc-600` to match the core token fix.

## Execution
Once approved, I will deploy the `multi_replace_file_content` tool to patch the utility classes and insert the layout documentation.
