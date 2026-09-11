# Investigatory Report & Implementation Plan: Share Zcene White Screen Bug (/z/{id})

## Investigatory Report

### 1. The Observation & Symptoms
When users visit a path-based share link (e.g., `zcene.online/z/...`), the application renders a blank white screen.
The backend correctly generates and stores the document in the `sharedZcenes` collection, meaning the failure is entirely localized to the front-end rendering phase upon cold-booting the shared URL.

### 2. Tracing the Guest Hydration Pipeline
The front-end correctly intercepts the `/z/{id}` route in `App.tsx` (around lines 6330-6450). It executes the following pipeline:
1. **Fetching**: Retrieves the `sharedZcenes` document from Firestore.
2. **Deserialization**: Parses `graphData` from a string back into an object, and reconstructs the `detailsCache` Map via `expandDetailsCacheMap()`.
3. **Hydration**: Unconditionally calls `batchHydrateDetailsCache()` to fetch missing live bios for guests if the author's cache was sparse.
4. **State Commitment**: Sets `graphData`, `activeNodeIds`, and `selectedNode`.

The entire logic above is wrapped in a robust `try...catch` block. If any data parsing or hydration logic threw a synchronous error, it would be caught, and the app would render the `<ErrorOverlay>` component with a dark background. However, the screen is completely white.

### 3. The Root Cause: React Lazy Suspense Failure
A completely white screen in a dark-mode React application indicates that the root component tree has unmounted (crashing before the `ErrorBoundary` can render its UI, or bypassing it entirely).

In `App.tsx`, three components are dynamically imported using `React.lazy`:
```tsx
const StyleGuidePage = React.lazy(() => import('./components/DesignSystem').then(m => ({ default: m.StyleGuidePage })));
const EnginePage = React.lazy(() => import('./components/EnginePage').then(m => ({ default: m.EnginePage })));
const UsageAnalyticsPage = React.lazy(() => import('./components/UsageAnalyticsPage').then(m => ({ default: m.UsageAnalyticsPage })));
```

These components are rendered unconditionally inside hidden structural `div`s at the bottom of the `App.tsx` render tree:
```tsx
<div className={`absolute inset-0 transition-opacity duration-300 ${currentView === View.Engine ? 'z-10' : 'z-0 opacity-0 pointer-events-none'}`}>
  <EnginePage ... />
</div>
```

**The Bug:** There is absolutely no `<React.Suspense>` boundary wrapping these lazy-loaded components in `App.tsx` or `index.tsx`. 
When a user cold-boots the app directly via a deep link (`/z/{id}`), React immediately attempts to mount `<EnginePage>`, `<StyleGuidePage>`, and `<UsageAnalyticsPage>`. Because the Javascript chunks have not yet loaded over the network, `React.lazy` throws a Promise to suspend rendering. 
Since there is no `<Suspense>` boundary anywhere in the tree to catch this Promise, React 18/19 treats it as a fatal unhandled suspension, bypasses the standard synchronous `ErrorBoundary`, and forcefully unmounts the entire `<App />` tree, resulting in a blank white screen.

## Proposed Changes

### [Component Name]
Front-End Core (`App.tsx`)

#### [MODIFY] App.tsx
- Wrap the main rendering viewport (or specifically the lazy-loaded components) in a `<React.Suspense>` boundary.
- Provide a seamless fallback (e.g., `<LoadingScreen />`) so that if a user deep-links into the app, it gracefully displays the loading state while the `EnginePage` and other lazy chunks resolve in the background.

## User Review Required
Please review this root cause analysis. The fix requires wrapping the App's main view router inside a `<React.Suspense>` block. Let me know if you approve this approach so I can proceed with the code edits.
