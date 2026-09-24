# Implementation Plan: Magazine View Deep Cut Typography

## 1. Context and Problem
The user noticed a typography inconsistency in the Magazine view:
- The root artist breakdown (Hero node) correctly uses a base size of 16px (text-base equivalent via clamp).
- The deep cut bios (non-Hero nodes in the Magazine view) drop to 14px (`text-sm`).

According to the design system, `14px` is meant for "Data Value" elements within constrained panels to prevent layout fracturing. However, the Magazine view is an editorial reading experience, so all paragraph body content (both Hero and Deep Cuts) must use the 16px "Body (Content)" standard (`text-base`). At the same time, the graph view side panel must remain at `text-sm` (14px).

## 2. Investigation Findings
The bios for both the side panel and the Magazine view are rendered using a shared `NodeCard` component in `components/DetailsPanel.tsx`. 
Currently, the markdown bio container on line ~1338 applies the typography size based solely on the `isHero` prop:

```tsx
<div className={`leading-relaxed text-zinc-300 markdown-bio ${isHero ? 'text-[clamp(0.875rem,1vw,1rem)] font-normal column-count-1 md:column-count-2 md:gap-12' : 'text-sm'}`}>
```

The `NodeCard` component receives an `isFullScreenMode` prop, which maps to `isMagazineViewOpen`. We can use this to determine if the component is rendering inside the Magazine view or the side panel.

## 3. Proposed Solution
We will update the logic to check `isFullScreenMode` when rendering non-hero nodes.

### Code Refactoring Details
Update the `className` logic in `components/DetailsPanel.tsx` for the bio `<div>` (around line 1338) to:

```tsx
<div className={`leading-relaxed text-zinc-300 markdown-bio ${isHero ? 'text-[clamp(0.875rem,1vw,1rem)] font-normal column-count-1 md:column-count-2 md:gap-12' : (isFullScreenMode ? 'text-base font-normal' : 'text-sm')}`}>
```

- **`isHero` (Root Artist in Magazine)**: Uses the existing fluid clamp/columns.
- **`!isHero && isFullScreenMode` (Deep Cuts in Magazine)**: Uses `text-base font-normal` (16px).
- **`!isHero && !isFullScreenMode` (Side Panel)**: Continues to use `text-sm` (14px) to preserve constrained layouts.

## 4. Next Steps
Once this plan is approved, I will use the code editing tools to apply the conditional typography logic in `components/DetailsPanel.tsx`.
