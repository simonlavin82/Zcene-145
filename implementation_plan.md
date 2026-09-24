# Strategic UI Refactor: Node Color Fidelity & Selection Glow Removal

## Investigation & Findings

I have completed a hard audit of the D3 graph logic (`MusicGraph.tsx` and `ExampleMusicGraph.tsx`) and identified the exact causes of both the color degradation and the tacky selection glow.

### 1. Color Degradation: The "Dark Stroke" Bleed
- **The Evidence:** The hex colors mapped via `nodeTypeColorMap` are being passed to D3 correctly without any mathematical opacity degradation (base opacity is strictly `1`). However, in `MusicGraph.tsx` (Lines 1161-1162) and `ExampleMusicGraph.tsx` (Lines 400-406), all unselected nodes are forced to render a dark stroke:
  ```typescript
  .attr("stroke-width", 2)
  .attr("stroke", "#1F1F1E")
  ```
- **The Physics:** SVG strokes are drawn centered on the path boundary. For our small node shapes (e.g., area `350`, roughly a 10px radius), a `2px` stroke bleeds `1px` into the interior of the shape. Because the stroke is nearly black (`#1F1F1E`), this dark ring eats up nearly 20% of the interior visual area, aggressively darkening/muddying the perception of the vibrant categorical fill.
- **The Solution:** We must strip the `#1F1F1E` default stroke. Unselected nodes should receive `stroke="transparent"` so the raw categorical fill extends fully to the geometric boundary with 100% fidelity.

### 2. Selection Glow: The `feGaussianBlur` Filter
- **The Evidence:** The "tacky" glow is a literal SVG filter being dynamically appended to the canvas defs in `MusicGraph.tsx` (Lines 675-688) and `ExampleMusicGraph.tsx` (Lines 237-248):
  ```typescript
  const filter = defs.append("filter").attr("id", "node-glow")
  filter.append("feGaussianBlur").attr("stdDeviation", "3.5")
  ```
- **The Application:** This filter is then conditionally applied to the active node path:
  ```typescript
  .attr("filter", d => activeNode && isSameNodeId(activeNode.id, d.id) ? "url(#node-glow)" : null)
  ```
- **The Solution:** We must rip out the `#node-glow` and `#node-glow-example` SVG `<filter>` definitions from the canvas initialization, and completely strip the `.attr("filter")` logic from the node update cycles. The active state will rely exclusively on the crisp, high-contrast `#F6E468` stroke.

## Implementation Plan

### `MusicGraph.tsx` & `ExampleMusicGraph.tsx`
1. **Strip the Glow:**
   - Delete the SVG `<defs>` block that generates `#node-glow` and `#node-glow-example`.
   - Remove all `.attr("filter", ...)` lines from the node path updates.
2. **Restore True Color Fidelity:**
   - Modify the stroke assignment so unselected nodes receive `"transparent"` instead of `"#1F1F1E"`.
   - The selected nodes (and Seed Artists) will maintain their pure yellow (`#F6E468`) 3px stroke, ensuring the selection boundary is crisp and sharp without muddying the interior fill.

## Execution
Once approved, I will deploy these surgical D3 corrections to restore the true-hex visual rhythm of the graphs.
