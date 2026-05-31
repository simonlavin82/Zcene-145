# Zcene Engine & Production Architecture

This document outlines the core technical architecture, interface boundaries, and data pipelines of the Zcene music discovery platform.

---

## 1. System Boundaries & Layered Architecture

Zcene is structured as a serverless, decoupled application with three primary architectural layers: the **Frontend UI Client**, the **Secure Backend Proxy Gateway**, and the **Database/Storage Layer**.

```
┌────────────────────────────────────────────────────────────────────────┐
│                          FRONTEND UI CLIENT                            │
│                 (React / Vite SPA • D3.js Force Physics)               │
└───────────────────┬────────────────────────────────┬───────────────────┘
                    │                                │
      Secure API Proxy Requests                      │ Firebase SDK Operations
    (Authentication & Gemini Proxies)                │ (Auth / Firestore Writes)
                    ▼                                ▼
┌────────────────────────────────────────┐ ┌─────────────────────────────┐
│          BACKEND PROXY GATEWAY         │ │   DATABASE/STORAGE LAYER    │
│    (Node.js / Express Container on     │ │  (Cloud Firestore Database  │
│         Google Cloud Run)              │ │   & Cloud Storage Assets)   │
└───────────────────┬────────────────────┘ └─────────────────────────────┘
                    │
      API Key Injected (x-goog-api-key)
                    ▼
┌────────────────────────────────────────┐
│           GEMINI API BACKEND           │
│     (Google language API endpoints)    │
└────────────────────────────────────────┘
```

### 1.1 Frontend UI Client (React / Vite SPA)
The client edge operates as a Single Page Application (SPA) responsible for interactive layouts, physics simulations, and local state management.
*   **Physics Simulation:** Powered by a customized `d3-force` model tuned for stable organic clustering (implemented in `MusicGraph.tsx` and `ExampleMusicGraph.tsx`). Velocity decay is set to `0.7`, and sticky drag operations pin coordinates (`fx`/`fy`) for curated persistence.
*   **Resilience & Rate Limiting:** Implements sequential queueing (1-at-a-time fetches) and exponential backoff to handle free-tier Gemini API limitations (15 RPM) gracefully without UI disruption.
*   **Client-Side Verification ("Nuclear Option"):** A post-processing pipeline in `App.tsx` manually filters and prunes LLM outputs. It strips out artists violating geographical/era search filters and prunes orphaned links where source or target nodes are missing.
*   **Security Gating:** Gated pages (such as the `EnginePage` and `StyleGuidePage`) are lazy-loaded via dynamic bundle-splitting (`React.lazy`) and rendered only to authorized accounts (e.g. admin accounts) to prevent public code discovery.
*   **Platform Optimizations:** Acquires a sentinel using the browser `Screen Wake Lock API` during active AI generations to prevent mobile devices from sleeping and suspending the background processes.
*   **Taste Profile & Compatibility Meter:** A client-side visual compatibility gauge is calculated deterministically on the client using the active user's taste filters (Genre, Origin, and Era range) without any AI API key overhead or external requests, ensuring lightning-fast layout updates.

### 1.2 Backend Proxy Gateway (Cloud Run Container)
A lightweight Node.js Express server (`server.js`) deployed on Google Cloud Run acts as a secure reverse proxy and static asset server.
*   **Static Assets:** Serves the compiled SPA production assets from the local `/dist` directory.
*   **Gemini API Proxy (`/api/gemini`):** Intercepts client language model requests, removes the route prefix, injects the secret server-side `GEMINI_API_KEY` into the HTTP headers (`x-goog-api-key`), and forwards requests to `generativelanguage.googleapis.com`. This keeps client applications from exposing keys.
*   **Auth Proxy (`/__/auth`):** Proxies Firebase Auth handler requests to the target Firebase domain (`firebaseapp.com`) to avoid cross-origin domain restrictions.

### 1.3 Database/Storage Layer (Firebase & Google Cloud Storage)
*   **Firebase Authentication:** Handles secure Google OAuth popup workflows, populating authenticated tokens for client authorization.
*   **Firestore Database:** A document-oriented database partitioned under strict Attribute-Based Access Control (ABAC) rules:
    *   **User Profiles (`/users/{userId}`):** Personal preferences, authorization overrides, and onboarding state.
    *   **Projects (`/users/{userId}/projects/{projectId}`):** Holds user-specific workspaces. Projects store seed artists, active node arrays, chat logs, filters, and a lightweight `canvasLayout` (a JSON array of nodes and their customized coordinate vectors: `{nodeId, x, y, fx, fy}`). Heavy graph representations are decoupled.
    *   **Global Artist Cache (`/artists/{cacheKey}`):** Stores isolated subgraphs (extracted via `extractArtistSubGraph`) and curated node details. Security rules allow read access to all users, write access (`create`) only on cache misses, and patch access (`update`) restricted solely to the `detailsCache` (Deep Cuts details) and `hitCount` (analytics) fields to prevent graph poisoning.
    *   **Public Shares (`/sharedZcenes/{shareId}`):** Publicly readable read-only graphs that are write-gated to their authenticated authors.
*   **Google Cloud Storage (GCS):** Serves static high-fidelity page backdrops and visual cards via secure HTTPS endpoint paths:
    *   `https://storage.googleapis.com/zcene/Zcene%20general%20background.jpeg` (Main UI background, graph canvas background, details panel base).
    *   `https://storage.googleapis.com/zcene/Artist%20background.png` (Artist bio features/panels background).
    *   `https://storage.googleapis.com/zcene/Deep%20Cut%20background.png` (Deep Cut details panel background and Collection Intelligence visual background).

---

## 2. Project Creation, Mapping, & Hydration Pipeline

This sequence diagram illustrates the lifecycle of a newly created Zcene project—from initial empty instantiation, cloud asset hydration, cache lookup, model orchestration, post-processing validation, and detail enrichment.

### 2.1 Sequence Diagram

```
User (Browser)          Frontend UI          Firestore DB          Cloud Storage (GCS)       Backend Proxy        Gemini API
   │                         │                     │                       │                       │                   │
   ├─► Click "Create Project"│                     │                       │                       │                   │
   │   (Dashboard.tsx)       │                     │                       │                       │                   │
   │                         ├─► Generate UUID     │                       │                       │                   │
   │                         │   Reset local state │                       │                       │                   │
   │                         │                     │                       │                       │                   │
   │                         ├─────────────────────┼───────────────────────┼───────────────────────┼───────────────────┤
   │                         │ PHASE 01: INITIAL PROJECTS INITIALIZATION & BACKGROUND ASSETS HYDRATION                     │
   │                         ├─────────────────────┼───────────────────────┼───────────────────────┼───────────────────┤
   │                         │                     │                       │                       │                   │
   │                         ├─► setDoc() ────────►│                       │                       │                   │
   │                         │   (users/{uid}/     │                       │                       │                   │
   │                         │    projects/{id})   │                       │                       │                   │
   │                         │                     │                       │                       │                   │
   │                         ├─► GET general bg ──────────────────────────►│                       │                   │
   │                         │   (Zcene general background.jpeg)           │                       │                   │
   │                         │◄────────────────────────────────────────────┤                       │                   │
   │                         │   Renders Canvas & UI Backdrop              │                       │                   │
   │                         │                     │                       │                       │                   │
   │                         ├─────────────────────┼───────────────────────┼───────────────────────┼───────────────────┤
   │                         │ PHASE 02: CACHE VERIFICATION & ORCHESTRATION                                            │
   │                         ├─────────────────────┼───────────────────────┼───────────────────────┼───────────────────┤
   │                         │                     │                       │                       │                   │
   │   Enter Seed Artists    │                     │                       │                       │                   │
   ├─► Click "Search" ──────►│                     │                       │                       │                   │
   │   ("Band A::Band B")    ├─► readArtistCache() │                       │                       │                   │
   │                         ├─► (artists/{slug}) ─►                       │                       │                   │
   │                         │◄── [CACHE MISS] ────┤                       │                       │                   │
   │                         │                     │                       │                       │                   │
   │                         │   Invoke API ──────────────────────────────────────────────────────►│                   │
   │                         │   (POST /api/gemini)                                                │                   │
   │                         │                                                                     ├─► Inject Key      │
   │                         │                                                                     │   Forward Request │
   │                         │                                                                     ├──────────────────►│
   │                         │                                                                     │   (gemini-3.1-pro)│
   │                         │                                                                     │                   │
   │                         │                                                                     │◄── Return JSON ───┤
   │                         │                                                                     │    (Graph Nodes)  │
   │                         │◄── Return raw JSON ─────────────────────────────────────────────────┤                   │
   │                         │                     │                       │                       │                   │
   │                         ├─────────────────────┼───────────────────────┼───────────────────────┼───────────────────┤
   │                         │ PHASE 03: POST-PROCESSING, WRITING TO CACHE & CANVAS CONVERGENCE                        │
   │                         ├─────────────────────┼───────────────────────┼───────────────────────┼───────────────────┤
   │                         │                     │                       │                       │                   │
   │                         ├─► Nuclear Filtering │                       │                       │                   │
   │                         │   Orphan Link check │                       │                       │                   │
   │                         │                     │                       │                       │                   │
   │                         ├─► writeArtistCache()│                       │                       │                   │
   │                         │   (extract subgraphs│                       │                       │                   │
   │                         │    set artists/{id})│                       │                       │                   │
   │                         ├────────────────────►│                       │                       │                   │
   │                         │                     │                       │                       │                   │
   │                         ├─► Initialize D3 ───►│                       │                       │                   │
   │                         │   Simulation        │                       │                       │                   │
   │                         │   (Dynamic physics) │                       │                       │                   │
   │                         │                     │                       │                       │                   │
   │                         ├─────────────────────┼───────────────────────┼───────────────────────┼───────────────────┤
   │                         │ PHASE 04: DETAIL ENRICHMENT (DEEP CUTS)                                                 │
   │                         ├─────────────────────┼───────────────────────┼───────────────────────┼───────────────────┤
   │                         │                     │                       │                       │                   │
   │   Select Node           │                     │                       │                       │                   │
   ├─► Click Artist Node ───►│                     │                       │                       │                   │
   │                         ├─► fetchNodeDetails()│                       │                       │                   │
   │                         │   (Check Cache) ───►│                       │                       │                   │
   │                         │◄── [DETAILS MISS] ──┤                       │                       │                   │
   │                         │                     │                       │                       │                   │
   │                         │   Invoke Details API ──────────────────────────────────────────────►│                   │
   │                         │   (POST /api/gemini)                                                │                   │
   │                         │                                                                     ├─► Inject Key      │
   │                         │                                                                     │   Forward Request │
   │                         │                                                                     ├──────────────────►│
   │                         │                                                                     │   (gemini-3-flash │
   │                         │                                                                     │    + Web Search)  │
   │                         │                                                                     │                   │
   │                         │                                                                     │◄── Return JSON ───┤
   │                         │                                                                     │    (Bio Summary)  │
   │                         │◄── Return raw JSON ─────────────────────────────────────────────────┤                   │
   │                         │                     │                       │                       │                   │
   │                         ├─► GET panel assets ────────────────────────►│                       │                   │
   │                         │   (Artist/Deep Cut backgrounds)             │                       │                   │
   │                         │◄────────────────────────────────────────────┤                       │                   │
   │                         │   Renders Enriched Detail Bio Card          │                       │                   │
   │                         │                     │                       │                       │                   │
   │                         ├─► updateDoc() ─────►│                       │                       │                   │
   │                         │   (Save bio back    │                       │                       │                   │
   │                         │    to artists/{id}) │                       │                       │                   │
   v                         v                     v                       v                       v                   v
```

### 2.2 Functional Walkthrough

1.  **Phase 01: Project Creation & Static Hydration:**
    *   The user initiates a project creation, prompting the frontend to generate a unique `projectId` and clear any active graph states.
    *   The frontend initiates an asynchronous document write (`setDoc`) to `/users/{userId}/projects/{projectId}`.
    *   Concurrently, the UI imports and paints its visual backdrop layers by requesting background assets (`Zcene general background.jpeg`) from GCS via direct HTTP paths.
2.  **Phase 02: Verification & AI Orchestration:**
    *   Once a user commits seed input, the application checks Firestore's `/artists` path via a multi-get operation (`readArtistCacheMany`) to query normalized artist IDs.
    *   If a cache hit occurs, the cached nodes and links are returned, bypassing step 3.
    *   On a cache miss, the frontend formats a request containing the prompt, response schema requirements, and user filters, transmitting it to `/api/gemini`.
    *   The Cloud Run proxy intercepts the request, appends the security authorization header (`x-goog-api-key`), and redirects it to the Google Gemini service executing `gemini-3.1-pro-preview`.
3.  **Phase 03: Post-Processing, Writing to Cache, and Physics convergence:**
    *   Once the model responds with structured JSON, the frontend filters out any nodes that violate era or origin criteria.
    *   The pruned sub-graphs are separated by artist and pushed asynchronously to Firestore under `/artists/{cacheKey}` with an initialized `hitCount: 0`.
    *   The compiled graph is loaded into the React state. The D3 force engine initializes physics nodes, applies momentum constraints (`velocityDecay: 0.7`), and converges the simulation. If a project is loaded, coordinate positions are read from `canvasLayout` and pinned.
4.  **Phase 04: Detail Enrichment (Deep Cuts):**
    *   When the user selects an artist node, the details card panel mounts.
    *   The frontend searches for biographical details under the local project state or `/artists/{cacheKey}`.
    *   If unavailable, a query is sent through the proxy gateway to Gemini `gemini-3-flash-preview` configured with Web Search grounding (`googleSearch: {}`).
    *   The UI loads specific card backgrounds (`Artist background.png` or `Deep Cut background.png`) from Google Cloud Storage to render the details card.
    *   The scraped biography is written back to the global `/artists/{cacheKey}` under the `detailsCache` key, ensuring subsequent lookups avoid duplicate LLM invocations.
