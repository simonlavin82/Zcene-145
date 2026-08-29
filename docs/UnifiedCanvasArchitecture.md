# Unified Canvas Architecture

## Overview
The Unified Canvas Architecture governs how Zcene handles multi-seed and filtered graph generation, guaranteeing structural integrity, eliminating floating nodes, and preventing global cache pollution.

**CRITICAL: This architecture is strictly bound by the Immutable Architectural Laws defined in `architecture_truth.md`.**

## Core Mechanisms

### 1. The Three-Column Flow
The Unified Canvas is generated and processed through the standard Three-Column Pipeline:
- **Column 1 (UI):** React handles the request and fast-tracks the display.
- **Column 2 (Fast-Track):** Generates the bespoke spiderweb topology with guaranteed connectivity for multi-seed canvases, ensuring node identities are normalized.
- **Column 3 (Background Hydration):** Enriches "Deep Cuts" missing from the global cache safely in the background.

### 2. Canonical Identity & Defensive Alias Matching
- The system rigorously validates the incoming seed artists.
- Every validated seed must output an explicit, collision-resistant signature (canonical slugging).
- **Defensive Alias Matching (`isNodeInSeedList`):** When determining if a generated node in the canvas matches a seed, naive string matching is strictly prohibited. The system utilizes `isNodeInSeedList` to resolve aliases canonically, preventing duplicates and ensuring the structural foundation is anchored to the correct global entities.

### 3. Strict Seed Hoisting
- In any multi-seed or filtered canvas, seed entities are explicitly hoisted to the highest priority.
- They dictate the active node order and act as the true relational roots of the generated spiderweb topology.

### 4. Fail-Fast Media Gatekeeper & Zero-AI Zapping
- Immediately after generation, the Canvas performs a sweep against the global database.
- **The Fail-Fast Media Gatekeeper** enforces that a cached document is only a valid hit if it is **truly complete** (non-stub biography, genre present, image present).
- Any entity failing this check (e.g., missing thumbnail) is treated as a cache miss and routed for full background hydration. This guarantees the Canvas is always media-rich without requiring AI tokens for already-complete nodes.

### 5. Consolidated Gap-Filling & Master Narrative Sync
- **Single-Seed Paths:** Commit their newly minted master narrative and fully hydrated Deep Cut details back to the global registry.
- **Multi-Seed/Filtered (Bespoke) Paths:** Cleanly bypass the global commit for the master narrative to prevent data pollution. The generated bespoke topology is saved strictly to the unique user project (`detailsCacheEntries`).
