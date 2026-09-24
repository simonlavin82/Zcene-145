# Strategic UI Refactor: Optical Alignment & Album Art Contrast

## Concept & Architecture
We need to correct the optical alignment of the SVG legend shapes so they sit perfectly centered relative to their labels. Additionally, we need to introduce a heavy, brutalist shadow and border system to the Dashboard project tiles so the album art punches through the tinted crate backgrounds.

## Implementation Plan

### 1. Optical Legend Alignment (`Icons.tsx`)
- **The Issue:** D3 symbols (like `d3.symbolTriangle` and `d3.symbolStar`) are drawn relative to their mathematical centroids, which often differ from their visual/optical centers. This makes them appear top-heavy or vertically misaligned inside the legend's flex container.
- **The Solution:** We will introduce a dynamic `transform` offset inside the `LegendSymbol` component.
- **Execution:**
  - In `Icons.tsx`, we will check the incoming `symbol` type.
  - If it is `d3.symbolTriangle`, we will apply a `transform="translate(0, 2)"` to nudge it down.
  - If it is `d3.symbolStar`, we will apply a `transform="translate(0, 1)"` to ground it.
  - We will apply this `transform` directly to the `<path>` element inside the SVG. This ensures perfect optical centering within the existing `viewBox` without disrupting the HTML layout.

### 2. Album Art Contrast (`DashboardProjectCard.tsx`)
- **The Issue:** The project cards (`DashboardProjectCard`) currently use a semi-transparent `border-zinc-700/50` and a standard `shadow-xl`. Against the new 4% color wash of the dashboard crates, these cards are losing their defining edge.
- **The Solution:** We will implement a deep structural boundary using a pure dark stroke and a heavy, opaque drop shadow.
- **Execution:**
  - In `DashboardProjectCard.tsx`, we will replace `border-zinc-700/50` with a solid `border-zinc-950` or `border-black` to create a stark dividing line.
  - We will replace the default `shadow-xl` with a custom, heavy shadow utility (e.g., `shadow-[0_8px_30px_rgba(0,0,0,0.8)]`) to dramatically lift the tile off the tinted crate background.
  - The combination of the dark stroke and the deep shadow will effectively quarantine the album artwork from the ambient crate wash, restoring full contrast.

## Execution
Once approved, I will implement the optical offsets in `Icons.tsx` and upgrade the border/shadow utility classes in `DashboardProjectCard.tsx`.
