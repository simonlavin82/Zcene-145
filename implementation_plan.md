# Implementation Plan: Magazine View Deep Cut Typography (Revised)

## 1. Context and Problem
The recent update attempted to increase the deep cut bio text to 16px (`text-base`) in the Magazine view by adding a fallback for `isFullScreenMode`. However, the deep cuts still rendered at 14px. We need to identify why the previous logic failed to apply `text-base` to the deep cuts in the Magazine view and propose a definitive fix.

## 2. Root Cause Analysis
The previous fix updated the bio container class to:
```tsx
<div className={`leading-relaxed text-zinc-300 markdown-bio ${isHero ? 'text-[clamp(0.875rem,1vw,1rem)] font-normal column-count-1 md:column-count-2 md:gap-12' : (isFullScreenMode ? 'text-base font-normal' : 'text-sm')}`}>
```

The failure lies in how `isHero` is calculated for the Magazine view cards. In `DetailsPanel.tsx` (around line 2558), `isHero` is defined as:
```tsx
const isHero = isMagazineViewOpen && (node.id === selectedNode?.id || (isRichData && node.type === 'artist'));
```
This means that in the Magazine view, **all** artist nodes with rich data (including deep cuts like "Buggin" and "Spaced") evaluate `isHero` to `true`. 

Because `isHero` was `true`, the code hit the first branch of the ternary operator and applied `text-[clamp(0.875rem,1vw,1rem)]`. On standard desktop resolutions (e.g., 1400px width), `1vw` evaluates to `14px`, causing the text to render at exactly 14px instead of the intended 16px (`text-base`). 

My previous logic `(isFullScreenMode ? 'text-base font-normal' : 'text-sm')` was completely bypassed because `isHero` intercepted it.

## 3. Proposed Code Fix
We must detach the typography size logic from the `isHero` state. `isFullScreenMode` should be the **sole** determinant for the font size, while `isHero` can continue to manage the column layout.

We will update the `markdown-bio` wrapper in `NodeDetailsCard` (around line 1338) to:

```tsx
<div className={`leading-relaxed text-zinc-300 markdown-bio ${isFullScreenMode ? 'text-base font-normal' : 'text-sm'} ${isHero ? 'column-count-1 md:column-count-2 md:gap-12' : ''}`}>
```

**Why this works perfectly:**
1. **Magazine View (`isFullScreenMode = true`)**: Unconditionally applies `text-base` (16px), ensuring deep cuts and hero nodes alike use the 16px reading typography.
2. **Side Panel (`isFullScreenMode = false`)**: Unconditionally applies `text-sm` (14px), protecting the constrained layout.
3. **Layout formatting**: Preserves the `column-count` logic for rich nodes without entangling it with font size.

## 4. Next Steps
Once this revised plan is approved, I will deploy the `replace_file_content` tool to immediately swap this class logic and resolve the bug permanently.
