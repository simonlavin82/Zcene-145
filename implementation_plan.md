# UI Polish: Align Instant AI Query Chips with Design System

## Audit Findings
- **Discrepancy Located:** The "Instant AI Query Chips" inside `DetailsPanel.tsx` (lines ~1670-1685) have diverged from the official design system documentation in `DesignSystem.tsx`.
- **Rogue Classes Identified:** 
  - The live available chips utilize `hover:border-primary` which causes the unwanted yellow outline on hover. 
  - The live components also use heavier backgrounds (`bg-zinc-900` instead of `bg-transparent`) and brighter text (`text-zinc-300` instead of `text-zinc-400`), missing the intended subtle interaction.
  - The clicked state uses a heavier background and text color than the documented dimmed, spent state.

## Implementation Plan

1. **Update Query Chips (Buttons)**
   - Modify the `className` ternary inside `queryChips.map` in `DetailsPanel.tsx`:
   - **Clicked (Spent) State:**
     - *From:* `bg-zinc-950 border-zinc-800 text-zinc-500 hover:text-zinc-400`
     - *To:* `bg-zinc-950/30 border-zinc-800/50 text-zinc-600 cursor-default`
   - **Available Action State:**
     - *From:* `bg-zinc-900 border-zinc-700 hover:border-primary hover:bg-zinc-800 text-zinc-300`
     - *To:* `bg-transparent border-zinc-700 text-zinc-400 hover:bg-zinc-800 hover:text-white`
     *(This directly removes the rogue `hover:border-primary` class.)*

2. **Update Connection Dropdown (`<select>`)**
   - Align the dropdown's utility classes to perfectly mirror the design system interactive connection dropdown.
   - *From:* `... bg-zinc-900 border-zinc-700 hover:border-primary hover:bg-zinc-800 transition-colors text-xs text-zinc-300 ...`
   - *To:* `... bg-transparent border-zinc-700 text-zinc-400 hover:bg-zinc-800 hover:text-white focus:ring-1 focus:ring-primary ...` 
   *(Removes the rogue hover border, standardizes the background and text color, and adds the correct focus ring.)*

3. **Padding Standardization**
   - Update the baseline padding from `px-3` to `px-4` on both the chips and the dropdown to exactly match the `px-4 py-1.5` metrics defined in the Design System.

## Execution
Once approved, I will deploy the `multi_replace_file_content` tool on `DetailsPanel.tsx` to strip these rogue classes and apply the correct design tokens.
