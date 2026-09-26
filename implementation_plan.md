# Implementation Plan: Project View Decluttering & Mobile Ergonomics

## 1. Banner Panel Eradication (Desktop & Mobile)
**Target:** `components/GraphPage.tsx`
- **Action:** Completely remove the `AdSenseUnit` components and their wrapper `div`s.
  - Remove the mobile banner block (currently around line 1721-1748) rendered below the main mobile wrapper.
  - Remove the desktop banner flex container (currently around lines 1763-1813) that conditionally renders `adSize === 'small'` and `'large'`.
- **Result:** Reclaims 50px–90px of vertical height across all viewports. The center column containing the `Spiderweb` canvas will now span the full remaining height.

## 2. Subtle Contextual Back Navigation
**Target:** `components/Header.tsx`
- **Action:** Replace the `FaviconLogo` with a contextual back arrow when inside a project view.
  - In the `isDashboard` ternary check for the logo button, if `!isDashboard` (i.e. we are in a project), replace `<FaviconLogo>` with `<ArrowLeft>` (from `lucide-react`).
  - Maintain the existing `onLogoClick` handler, which currently routes back to the dashboard, ensuring the ergonomics remain intact.
  - Maintain the project title layout next to the arrow.
- **Result:** Enhances spatial hierarchy and provides an ergonomic, expected escape hatch from the project back to the dashboard.

## 3. Mobile Action Consolidation (Overflow Menu)
**Target:** `components/Header.tsx`
- **Action:** Create an overflow state for small screens to house secondary actions.
  - **Desktop (`md:flex`):** Ensure `Style`, `My Stack`, and `Account` (Profile) buttons are fully visible.
  - **Mobile:**
    - Expose the `Share` button inline next to the project title.
    - Introduce a new `<button>` with a `<MoreVertical>` icon (from `lucide-react`).
    - Bind this button to a new `isMobileMenuOpen` state.
    - Reuse the existing `<AnimatePresence>` and `<motion.div>` dropdown wrapper currently used by the Profile menu to render a beautiful, dark-themed dropdown anchoring to the three-dot button.
    - Inside this mobile dropdown, render the `Style`, `My Stack` (preserving its badge logic), and `Account` toggle buttons.
- **Result:** The mobile header is significantly decluttered, freeing up space and expanding touch targets, while retaining access to all tools.

## 4. Mobile Bottom Navigation Tabs ("Thumb Zone")
**Target:** `components/GraphPage.tsx`
- **Action:** Relocate the mobile view tabs (`Artists`, `Spiderweb`, `Deep Cut`).
  - Find the `div` wrapper for the tabs (currently rendered above the active tab content) and detach it.
  - Move this tab container to the bottom of the viewport using fixed positioning: `fixed bottom-0 left-0 right-0 z-[100]`.
  - Apply `bg-zinc-900/80 backdrop-blur-md border-t border-zinc-700/50 pb-safe` to give it a native iOS/Android bottom-nav feel and prevent content from getting fully obscured.
  - Add a bottom padding block to the main content area (`pb-16` or similar) so the scrollable content isn't hidden behind the new fixed navigation bar.
- **Result:** Navigation is moved to the ergonomic "thumb zone" for mobile users, mimicking native mobile app standards.

## 5. Design System Adherence
**Target:** Component Architecture
- **Icons:** We will use `ArrowLeft` and `MoreVertical` directly from the already-installed `lucide-react` library.
- **Tokens & Components:** 
  - We will strictly reuse the existing color tokens (`bg-zinc-900`, `border-zinc-700/50`, `text-primary`).
  - The overflow menu will perfectly mirror the existing Profile dropdown's DOM structure (`motion.div` with absolute positioning, `z-50`, shadow, border, and background tokens). 
  - No new components need to be added to `components/DesignSystem.tsx`. The bottom bar will just reuse standard Tailwind CSS layout classes (`fixed`, `backdrop-blur`, etc.) that are already prevalent in the app.

## 6. My Stack Notification & Badge State Ergonomics
**Target:** `components/Header.tsx`, `components/GraphPage.tsx`
- **Findings:**
  - **Persistent Yellow Pip (Header.tsx):** The notification dot on the mobile `MoreVertical` overflow button is currently hardcoded to display whenever `stackCount > 0`. This completely ignores the `isStackNew` lifecycle state which tracks whether the user has actually viewed the latest additions. 
  - **"Seen" State Management (GraphPage.tsx & Header.tsx):** `isStackNew` is properly managed by comparing `stack.length > lastViewedStackCount`. The `lastViewedStackCount` is updated via `onOpenStack()`. However, because the mobile overflow button ignores `isStackNew`, the pip never clears.
  - **Screaming Yellow Pill (Header.tsx):** Inside the overflow menu, the `My Stack` badge is styled with `bg-primary/20 text-primary`, defaulting to a highlighted accent instead of a neutral information pill.
- **Action Plan:**
  - Update the mobile overflow menu button in `Header.tsx` to conditionally render the notification pip based on `isStackNew` instead of `stackCount > 0`.
  - Update the `My Stack` numeric badge inside the mobile overflow menu to use neutral tokens: `bg-zinc-800 text-zinc-500 border border-zinc-700`.
  - Validate that opening "My Stack" from the overflow menu correctly triggers `onOpenStack()` (which invokes `onUpdateLastViewedStackCount` in `GraphPage.tsx`), thus cleanly dismissing the `isStackNew` notification dot.
