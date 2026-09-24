# UI Polish: Enforce Hard-Edge Rule on Sticky Magazine Header

## Audit Findings
- **Target Component:** `DetailsPanel.tsx` (specifically within the Magazine/Fullscreen view).
- **Target Container:** The sticky artist name header that attaches to the top of the scroll container (`<div className="transition-all duration-300 flex-shrink-0 sticky z-40 w-full ...">`).
- **Identified Violation:** When `isFullScreenMode` and `isHeaderStuck` are true, the nested child container applies the `rounded-xl` utility class. 
- **Rule Breached:** As per the Zcene Design Philosophy ("Functional Signifiers"), rounded edges (6px+) are exclusively reserved for interactive/clickable components. Since this sticky header is a non-interactive structural label, it must use hard edges (0px radius) to align with our 90s Structural Brutalism aesthetic.

## Implementation Plan

1. **Modify Sticky Header Container (`DetailsPanel.tsx`)**
   - Locate the sticky header's inner wrapper (around line 1056).
   - The current class string for the stuck state is: 
     `'w-fit bg-zinc-900/80 backdrop-blur-md border border-zinc-700 rounded-xl px-3 md:px-4 py-1.5 shadow-lg -ml-1 md:-ml-4'`
   - **Action:** Remove the `rounded-xl` class and explicitly replace it with `rounded-none` (to enforce 0px radius).
   - The updated class string will be: 
     `'w-fit bg-zinc-900/80 backdrop-blur-md border border-zinc-700 rounded-none px-3 md:px-4 py-1.5 shadow-lg -ml-1 md:-ml-4'`

## Execution
This change is localized and purely visual. Once this plan is approved, I will deploy the `replace_file_content` tool to immediately swap the classes and enforce the brutalist structural aesthetic.
