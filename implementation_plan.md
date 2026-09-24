# Strategic UI Audit: Button Consolidation & Pulse Removal

## Audit Findings
- **Current Button Ecosystem**: We currently have multiple bespoke button definitions scattered across `DesignSystem.tsx` and duplicated in consumer components like `DetailsPanel.tsx`.
- **Identified Redundancies**:
  - `RootsBreakdownButton` (Magazine/Roots button) has duplicate definitions in `DesignSystem.tsx` and `DetailsPanel.tsx`. It shares base structural styles with secondary interactive elements but uses a hardcoded tri-state string definition.
  - The `attention` state of the Magazine/Roots button uses `animate-pulse`, which causes visual fatigue.
  - "Brand Support Action", "Utility Pills", and "Scene Tags" repeat roughly 90% of the same Tailwind utility classes (e.g., `flex items-center justify-center rounded-xl transition-all active:scale-95 text-xs font-medium`) found in our standard `<Button>` component.
  - There is a functional overlap between "Secondary Buttons", "Roots Breakdown (Neutral)", and "Scene Tags". They all serve as outlined/subtle secondary actions but implement hover backgrounds, borders, and opacities slightly differently, fragmenting the design tokens.

## Consolidation Recommendations
- **Targeted Pulse Removal**: Immediately remove `animate-pulse` from the `attention` state of the Magazine/Roots Breakdown buttons to resolve visual fatigue. Map its attention state to rely on static color contrast (e.g., solid primary border/text with a slight glow or elevated opacity) rather than animation.
- **Unify Base Button Component**: Extend the core `<Button>` component in `DesignSystem.tsx` to handle a stricter taxonomy of `variant` tokens (e.g., `'primary'`, `'secondary'`, `'outline'`, `'ghost'`) and sizes (`'sm'`, `'md'`).
- **Merge Magazine / Roots Breakdown Logic**: Map the Magazine button's tri-state directly to the unified button props:
  - `neutral` state -> maps to `variant="secondary"`
  - `attention` state -> maps to `variant="outline"` with a brand color emphasis.
  - `disabled` state -> handled by the standard native `disabled` attribute rather than a bespoke CSS class block.
- **Deduplicate Components**: Purge the inline `RootsBreakdownButton` declaration from `DetailsPanel.tsx` and strictly import it from `DesignSystem.tsx`. Deprecate bespoke classes for "Brand Support", "Utility Pills", and "Scene Tags", funneling them through the core `<Button>` API.

## Execution Checklist
1. **[PRIORITY] Targeted Pulse Removal**: Edit `DesignSystem.tsx` (approx line 345) and `DetailsPanel.tsx` (approx line 1916) to remove `animate-pulse` from the `attention` state of the Magazine/Roots Breakdown button.
2. **Refactor `<Button>` Base**: Update the core `<Button>` interface in `DesignSystem.tsx` to accept sizes (`sm`, `md`, `pill`) and extended design tokens (`outline`, `ghost`).
3. **Consolidate RootsBreakdown**: Refactor the `RootsBreakdownButton` component in `DesignSystem.tsx` to compose the newly unified `<Button>` component rather than returning a raw HTML `<button>` with concatenated strings.
4. **Remove Duplication**: Delete the duplicate `RootsBreakdownButton` block from `DetailsPanel.tsx` and update its imports.
5. **Migrate Remaining Variants**: Sweep `DesignSystem.tsx` and `DetailsPanel.tsx` for manual instances of "Brand Support Action", "Utility Pills", and "Scene Tags", replacing them with the standard `<Button>` implementation.
6. **Purge Dead Code**: Remove unused disabled states and obsolete bespoke button variables from the style guide documentation.
