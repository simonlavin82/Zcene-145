# Unified Canvas Architecture (V45.1)

## Overview
The Unified Canvas Architecture governs how Zcene renders and processes multi-scene, multi-root, and 3-Tier filtered graph topologies across an infinite CONNECTIONS canvas (`<MusicGraph>`). It guarantees structural integrity, deterministic spatial partitioning, 100% collision-free layout, and zero cache pollution across up to 5 independent scenes per project workspace (`schemaVersion: 43`).

**CRITICAL: This architecture is strictly bound by the Immutable Architectural Laws defined in `architecture_truth.md`.**

---

## Core Architectural Pillars

### 1. Multi-Scene Infinite Board & Scene Namespacing ([Rule 44])
- **Infinite CONNECTIONS Canvas:** Projects support 1–5 independent `ProjectScene`s (`scene-1..scene-5`, `MAX_SCENES_PER_PROJECT = 5`).
- **Deterministic Cluster Centers:** Each scene $k$ centers at $(1000 + k \times 1050, 1000)$ along a horizontal stride of $1050\text{px}$.
- **Namespaced Canvas IDs:** Physical graph nodes are prefixed as `scene-k::canonicalId` (e.g. `scene-1::korn-us`, `scene-2::radiohead-gb`), allowing identical entities or labels to appear organically within multiple scene clusters while resolving to a single canonical entity profile in `detailsCache`.
- **Per-Node Scene Territory Sanitizer & Self-Healing Layout:** `buildCompositeCanvasGraph` enforces strict $\pm 480\text{px}$ territory limits (`SCENE_TERRITORY_MAX_DX = 480`, `SCENE_TERRITORY_MAX_DY = 480`) around each cluster center. Out-of-territory bleeding coordinates are rejected and placed at cluster centers, setting `wasLayoutHealed = true` so `ProjectLoader` automatically persists the repaired layout.
- **D3 Live Coordinate Handshake Guard:** `<MusicGraph>` tracks `lastSceneFingerprintRef` across scene counts, scene IDs, and root artists. Adding, removing, or re-indexing scenes immediately invalidates simulation caches so re-indexed nodes never inherit mismatched positions.

### 2. Upfront Multi-Scene Batch Curation & "Cup of Tea" Pipeline ([Rule 45])
- **Upfront Multi-Scene Drafting:** Users can draft 1–5 independent scenes upfront before initial project creation (`Create Zcene (N)` dynamic button label) or click `+ Add Scene` (which automatically focuses the "Add artist" input).
- **Dashboard Card Scene Pre-Loading:** Dashboard project cards preload configured scene counts (`sceneCount: Math.max(configuredScenes.length, ...)`) so multi-scene projects immediately display `SCENES: N` during curation.
- **Dynamic Aggregate Pricing & Bundled Pre-Flight:** Charges a dynamic batch total (5T–50T: 5T per Single-Root scene, 10T per Multi-Root / anchored scene) with a single bundled 1T pre-flight fee across uncached scenes (`bundledSeedsLabel`).
- **Fast-Track Fast Return (<1.5s):** Column 2 sets `deferPhase1ToWorker: true`, persists the project document in `status: 'curating'`, and returns HTTP 200 OK in `<1.5s`, deferring heavy LLM topology synthesis to Column 3 to eliminate Cloud Functions gateway timeouts.
- **Chained Worker Baton Handoffs:** Column 3 executes sequential autonomous background hops (`job_1 -> job_2 -> ... -> job_N` with `isChainedHop: true`). Each hop curates Scene $k$ through Phase 1, Step 0 peer hydration, node hydration, Scene Zine, and physics positioning, then mints the next job doc and hands off execution without client coordination.
- **Step 0 Direct Hit & Peer Profile Hydration:** The worker pre-hydrates cached artist and label profiles across all batch scenes at job start, stripping `scene-k::` prefixes to `canonicalKey` to populate `existingProjectDetailsMap` and prevent client hydration request storms upon completion.
- **Intermediate Hop Overarching Bypass:** Step 3B Overarching Multi-Scene Zine synthesis is strictly bypassed on intermediate hops ($k < N$) and executes exclusively on the final hop across the completed multi-scene constellation.
- **Settlement Dual-Write Isolation:** Batch settlement dual-writes of `apiUsage` and `costUsd` are strictly isolated to settlement transactions (`['spend_live_synthesis', 'spend_direct_hit']`), protecting the pre-flight `-1T` lookup row from cost inflation.
- **Deterministic Scene 1 Camera Centering:** Upon final completion, `activeSceneId` deterministically defaults to `'scene-1'`, centering the CONNECTIONS camera on the Scene 1 cluster `(1000, 1000)` and Card #1 in passive rest state post-D3 zoom init.

### 3. Cross-Scene Quadratic Bézier Bridge Lines ([Rule 44])
- **Bridge Line Synthesis:** Shared entities (`bridgeType: 'identity'`) and AI sonic lineages (`bridgeType: 'sonic_lineage'`) render as non-physics quadratic Bézier curves above the clusters.
- **Arc Lift & Sub-Pixel Guards:** Curves compute a midpoint control point with 70–200px upward arc lift based on cluster span, guarded by a `hypot >= 12px` threshold that suppresses degenerate sub-pixel paths.
- **Top-Prioritized Tooltip Snippets:** Cross-Scene Bridge Lines illuminate on endpoint node hover or selection with `pointer-events: none` visual lines and dedicated hitboxes, presenting directional narrative snippets (`forwardContext` / `inverseContext`) prioritized at the top of the node hover tooltip.

### 4. Tri-Panel Scene Synchronization & Smart Camera Follow ([Rule 44])
- **Tri-Panel Scene Synchronization:** Selecting a curated Scene $N$ pill in ROOTS frames Scene $N$ (`focusSceneCluster('scene-n', 750)`) and synchronizes DEEP CUTS to Scene $N$'s primary Root Artist in passive mode with cached details hydrated, preserving the selected node if already within Scene $N$.
- **Smart Camera Follow:** Stepping through DEEP CUTS dynamically frames the target scene cluster under Scenario A (Zoomed Out Overview, $k < 0.65$) and Scenario B (Inter-Scene Navigation, $\text{dist} > 500\text{px}$), or smoothly pans to center off-screen nodes under Scenario C (Intra-Scene Inspection, $k \ge 0.65$ & $\text{dist} \le 500\text{px}$, 80px margin) while preserving manual zoom.

### 5. Layered Zine Hierarchy & Responsive Flex-Column Engine ([Rules 24, 29, 44])
- **Stacked Hierarchy:** Multi-scene projects render a stacked hierarchy: H1 OVERARCHING ZINE at top $\to$ sequential H2 SCENE $k$ editorials $\to$ canonical-deduplicated DEEP CUTS grid.
- **Editorial Headlines & Introductions:** Project owners can customize editorial headlines (`overarchingZineTitle` H1 and `scene.zineTitle` H1/H2) and add Curator's Note dedications (`overarchingZineIntro` / `scene.zineIntro`).
- **Per-Block 3/2/1 Responsive Flex-Column Engine:** Self-contained `[ImageSlot(i) + MarkdownBlock(i)]` units partition across 3 balanced independent flex columns on Desktop ($\ge 1024\text{px}$), 2 independent even/odd columns on Tablet ($768\text{px}–1023\text{px}$), and sequential single-column stacking on Mobile ($< 768\text{px}$).
- **Zine Editorial Image Curation Assistant:** Sticky header features an Action State Contextual Indicator badge (`[ ✎ Edit (N) ]`) tracking un-illustrated sections, Block-Aware Google Images quick-search chips (`udm=2`) with Block 1 Root Artist anchor, and 1-click URL editor opening + editable auto-captions.

### 6. Universal Serializer & Coordinate Memory ([Rules 21, 25, 29])
- **Universal Serializer:** Project saving, autosave, and share generation derive from a single source of truth (`schemaVersion: 43`). Strict ledger parity defensively omits `generationType`, `apiUsage`, `tokensSpent`, and `anchorResolution` during frontend autosave (`merge: true`).
- **Coordinate Memory:** Once `simulation.on("end")` fires, settled coordinates are persisted back to the owned project document's `canvasLayout` via debounced `updateDoc` (5s debounce). Settled scenes remain frozen when new scenes are added along the $1050\text{px}$ horizontal stride.
- **Selective Coordinate Amnesia for Shares:** Single-scene shared projects (`scenes.length < 2`) strip fixed coordinates so guests experience an organic D3 layout. Multi-scene shared projects (`scenes.length >= 2`) strictly preserve `canvasLayout` and settled coordinates for 1:1 multi-cluster spatial parity on `/z/:id`.
