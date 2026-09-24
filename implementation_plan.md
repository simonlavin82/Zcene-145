# Implementation Plan: UI Proportion Sync

## Analysis
The standard "Add artist" input (`InputSizes.md` base) derives its height structurally from Tailwind classes: `py-2` (16px vertical padding), `text-sm` (20px line-height), and `border` (2px total). This yields a precise computed height of **38px**. 
This metric is already validated by our `LayoutSizes.controlBar` token which is set explicitly to `h-[38px]`.

Currently, `CanvasControlStyles` and the hardcoded states in the `ExpandingSearchOverlay` utilize Tailwind's `12` scale (`w-12 h-12`), resulting in a chunkier **48px** square footprint. 

To achieve perfect dimensional harmony with the `md` standard input, we must bring all canvas controls down to a **38px** footprint.

## 1. Scale CanvasControlStyles Primitive (`components/DesignSystem.tsx`)
- **Action**: Update the `CanvasControlStyles` constant.
- **Change**: Replace the `w-12 h-12` dimensions with explicitly sized `w-[38px] h-[38px]`. This instantly standardizes all basic floating controls (Zoom, Center, Filter toggle, Search collapsed).

## 2. Harmonize Expanding Search Overlay Dimensions (`components/GraphPage.tsx`)
- **Action**: Update the hardcoded dimensional classes within the `ExpandingSearchOverlay` component to match the newly scaled base primitive.
- **Change 1 (Collapsed Wrapper)**: Replace the `w-12` class in the parent transition wrapper (`isSearchExpanded ? 'w-64 opacity-100' : 'w-12 opacity-100'`) with `w-[38px]`.
- **Change 2 (Expanded Input Container)**: Replace the `h-12` class on the relative expanded container (`<div className="relative w-full h-12">`) with `h-[38px]`.

## Summary of Files to Modify
1. `components/DesignSystem.tsx` (Reduce `CanvasControlStyles` footprint to 38px)
2. `components/GraphPage.tsx` (Sync hardcoded expansion states to 38px)
