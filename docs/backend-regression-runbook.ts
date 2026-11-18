export const BACKEND_REGRESSION_RUNBOOK = `
# V45.1 Regression Suite (Full-Stack)

This suite locks down the Zcene generation engine locally without incurring Gemini API costs or requiring the heavy Java Firebase Emulator across 17 test suites (413 unit/integration tests).

## Execution Commands

\`\`\`bash
# Run entire full-stack regression test suite (17 test files, 413 tests)
npm test

# Run backend pipeline tests
cd functions && npx vitest run tests/pipeline.test.ts

# Run V29 Read/Write Gate & border-town slug tests
cd functions && npx vitest run tests/v29-gates.test.ts

# Run V37 3-Tier Anchor System, Rule 8, Rule 40 & Rule 41 tests
cd functions && npx vitest run tests/v30-anchors.test.ts

# Run JIT Asset Healer & circuit breaker tests
cd functions && npx vitest run tests/healOrphanedAsset.test.ts

# Run iTunes 4-tier scraper waterfall tests (Taxonomic distance, discography reconciliation & Tier 4 quarantine)
cd functions && npx vitest run tests/scraperWaterfall.test.ts

# Run frontend core tests
npx vitest run tests/v15-core.test.tsx

# Run V38.7 connections search & re-hydration tests
npx vitest run tests/v38-connections-search.test.tsx

# Run Architecture V38/V39 Token Economy & Split-Debit tests
npx vitest run tests/v38-token-economy.test.tsx

# Run V40 iTunes 30s Audio Preview & lifecycle regression tests
npx vitest run tests/v40-itunes-preview.test.tsx

# Run DetailsPanel 3-column layout, style & Zine Editorial Image Curation Assistant tests
npx vitest run components/DetailsPanel.test.tsx

# Run V41/V45 Immutable Ledger, 2-Stage Trash & Architecture Parity Gate tests
npx vitest run tests/v41-immutable-ledger-and-trash.test.tsx

# Run V42 Global 249-Country ISO-3166 Registry & Disambiguation Lock tests
cd functions && npx vitest run tests/v42-iso-disambiguation.test.ts

# Run idempotent claim lock & dynamic cooldown tests
cd functions && npx vitest run tests/idempotencyAndCooldown.test.ts

# Run V42.1 Escape Hatch Blank-Input UX & Zero "Is connected to" Tooltip tests
npx vitest run tests/v42_1-escape-hatch-and-tooltips.test.tsx

# Run Pre-Stripe audit & landing page lexicon modernization tests
npx vitest run tests/v42_4-pre-stripe-audit.test.tsx

# Run V45 Multi-Scene Infinite Board, Scene Namespacing & Layered Zine tests
npx vitest run src/test/v43-multi-scene-board.test.ts
cd functions && npx vitest run src/__tests__/v43MultiScenePipeline.test.ts

# Run V44 Roots hierarchy, input controls & curation intercept tests
npx vitest run tests/v44-roots-hierarchy-and-inputs.test.tsx

# Run V45 dynamic document title & route cleanup tests
npx vitest run tests/v45-document-title-and-route-cleanup.test.tsx

# Run V45 dashboard project search & filtering tests
npx vitest run tests/v45-dashboard-search.test.tsx

# Run V45.1 curation time estimate, admin badge, overarching history archive & per-node territory self-healing tests
npx vitest run tests/v45_1-curation-time-and-admin-badge.test.tsx

# Or run with UI for visual tracing:
npx vitest --ui
\`\`\`

## Architecture & Mocking

*   **Firebase-Admin:** Globally mocked to intercept database reads (simulating cache hits/misses) and validate write payloads instantly.
*   **Static Fixtures:** External Gemini API calls are bypassed. Tests use pre-validated JSON topologies from \`tests/__fixtures__/\` to guarantee deterministic, zero-latency execution.
*   **Payload Assertions (Split NODE_DETAILS_SCHEMA):** Mock validations for Gemini API intercepts MUST assert on the correct \`thinking_level\` parameter (minimal, low, medium, high), \`responseMimeType: "application/json"\`, and the **split \`NODE_DETAILS_SCHEMA\`** (for Artists: \`style\` is in \`required\` and locked to \`CANONICAL_STYLES_FLAT\` enum; for Labels: \`style\` is strictly omitted from properties and required arrays with zero prose fallback), and ensure no legacy sampling parameters (temperature, top_p) are present.
*   **Payload Assertions (Label Integrity, 3-Tier Anchors & Deep Cut Qualification):** Mock validations MUST explicitly validate that label IDs have been correctly stripped of suffixes via \`normalizeLabelId\` before being written to the mock database, that \`hasActiveDiscoveryFilters\` ignores empty arrays while forcing Complex Generation when Level 2 or Level 3 anchors are active, and that \`isFullyQualifiedEntityProfile\` rejects prose-fallback stubs (\`"Synthesised from live cultural archives..."\`) while accepting legitimate underground profiles with terminal \`imageUrl: "not-found"\` when \`Array.isArray(profile.discography)\` (including honest empty arrays \`[]\`).
*   **Image Scraper Assertions (4-Tier Waterfall, Taxonomic Distance & Discography Reconciliation):** Asserts that \`scrapeImageUrlBackend\` resolves clear genre distances at Tier 1 (e.g. Punk vs Alternative for hardcore bands), preserves qualified releases (e.g. \`(Demo)\`, \`[EP]\`), strictly gates distinctive fuzzy token matches on exact release-year correlation, resolves multi-candidate Tier 3 collisions via taxonomy genre-affinity scoring (\`evaluateGenreMatch\`), reconciles and backfills verified releases from iTunes while purging hallucinated albums, and enforces Tier 4 fail-fast quarantine returning \`imageUrl: 'not-found'\` and \`discography: []\` while immunizing label entities.

## Core Pathways Validated

1.  **Root Generation:** Validates cold-start execution for a single root.
2.  **Complex Generation (Multi-Root / 3-Tier Anchored):** Asserts bridging logic, Level 2 hard Era (\`1965 to N-2 (Current Year - 2) Era Slider\`) and Country (22 canonical countries) boundary enforcement, and Rule 41 Level 3 Graceful Degradation (\`anchorResolution\` telemetry).
3.  **Partial Generation, Multi-Tenant Disambiguation & Root-as-Router Contract:** Ensures existing static data is grafted into newly generated topologies and multi-candidate collisions are resolved without data loss.
    *   *Assertion (Frontend Pre-Flight Callable & Collision Detection):* Asserts that \`validateSeedOriginCallable\` correctly detects homonym collisions, returning candidate arrays with distinct disambiguation hints.
    *   *Assertion (Escape Hatch Re-Query Bouncer - \`tests/v15-core.test.tsx\`):* Asserts that the Re-Query Bouncer synchronously validates manual "Not this artist?" origin/genre hints via Flash 3.6, hard-blocking unverified inputs (\`isValid: false\`) with an inline UI error banner while locking "Confirm & Generate", and cleanly unlocking upon verified input.
    *   *Assertion (Zero Blind Trust & Root-as-Router Contract):* Asserts that pre-flight resolution synchronously writes Evolved Stub contracts (\`_isStub: true\`, \`isAmbiguous: false\`, \`redirectTo: "id-iso"\`, \`candidates: [...]\`) to Firestore prior to background worker triggering, and ensures bare root IDs never hold entity payloads while verified payloads resolve to geographically suffixed documents (\`artists/{id}-{iso}\`).
    *   *Assertion (Autosave Immunity):* Asserts that the frontend accurately maps returned \`apiUsage\`, \`generationType\`, and \`anchorResolution\`, and that subsequent autosaves (\`merge: true\`) do not overwrite these fields with 'Clone'.
4.  **Direct Hit (Cache) & V37 Read/Write Gate Qualification:** Validates the short-circuit logic successfully returns cached snapshots without triggering the generative loop, and asserts that \`isFullyQualifiedEntityProfile\` validates canonical \`style\` for artists (matching \`CANONICAL_STYLES_SET\`) and blocks prose-fallback stubs at both the Read Gate and Write Gate while permitting valid terminal \`imageUrl: "not-found"\` monogram profiles with \`Array.isArray(profile.discography)\`.
5.  **Share Payload Blacklist Mutation:** Asserts that the Universal Serializer generates a 1:1 clone, and that the Ephemeral Blacklist successfully injects a 30-day TTL, strips canvasLayout, and purges rigid coordinates (fx, fy) before generating guest links.
6.  **Just-In-Time (JIT) Asset Healing & Circuit Breaker (404 Emergency Parachute ONLY):**
    *   *Simulated 404 Miss:* Asserts that a missing or un-styled artist in \`detailsCache\` triggers \`healOrphanedAsset\` and synthesizes a valid profile enforcing the strict Artist style enum.
    *   *Zero Sweeping of Stale Data:* Asserts that existing complete documents (even if soft-expired > 365 days) bypass synthesis at Tier 1 gate with zero API cost; JIT Healer is never invoked for soft-expired nodes.
    *   *In-Flight Memory Dedup:* Asserts that concurrent clicks on the same un-hydrated node trigger only a single network invocation.
    *   *Circuit Breaker & Kill Switch:* Asserts that exceeding 100 heals in 24 hours trips the auto-kill circuit breaker, throws \`resource-exhausted\`, and honors the admin toggle in \`adminLedger/system/settings\`.
    *   *Telemetry Audit:* Validates receipt creation in \`adminLedger/system/jitHeals\` with accurate token counts and list-price cost calculations.
7.  **Upfront Multi-Scene Batch Curation & Chained Worker Handoff ("Cup of Tea" Mode):**
    *   *Assertion (Bundled Pre-Flight & Dynamic Batch Pricing):* Asserts that multi-scene batches calculate aggregate token totals (5T–50T) with a single bundled 1T pre-flight fee across uncached scenes (\`bundledSeedsLabel\`).
    *   *Assertion (Pass 1 Typo Auto-Correction):* Asserts that \`validateSeedOriginCallable\` auto-corrects typos (\`correctedInput: true\`), dynamically updating input cards to verified entities with inline correction notices.
    *   *Assertion (Worker Phase 1 Deferral & Fast Return <1.5s):* Asserts that Column 2 sets \`deferPhase1ToWorker: true\`, persisting projects in \`status: 'curating'\` and returning HTTP 200 OK immediately.
    *   *Assertion (Chained Worker Baton Handoffs & Intermediate Hop Step 3B Bypass):* Asserts that sequential chained hops (\`job_1 -> ... -> job_N\` with \`isChainedHop: true\`) execute without client coordination, bypassing Overarching Zine synthesis until the final hop across the completed constellation.
    *   *Assertion (Step 0 Direct Hit & Peer Profile Hydration):* Asserts that cached entities across all batch scenes are pre-hydrated into \`existingProjectDetailsMap\` with stripped \`canonicalKey\`s to eliminate client request storms upon completion.
    *   *Assertion (Settlement Dual-Write Isolation & Deterministic Scene 1 Centering):* Asserts that \`apiUsage\` and \`costUsd\` dual-writes are strictly isolated to settlement rows (\`['spend_live_synthesis', 'spend_direct_hit']\`), and upon batch completion, \`activeSceneId\` defaults to \`'scene-1'\` centering the camera on Scene 1 \`(1000, 1000)\` post-D3 zoom init.

## Database Purge Runbook Protocol (V45.1 Multi-Scene Architecture)

Note: The V45.1 Multi-Scene Infinite Board & Layered Zine architecture retains backward-compatible \`schemaVersion: 43\` across all Firestore project documents. Zero database purge is required for V45.1 operations.

When rolling out structural schema migrations, Tier 1 Global Assets (\`/artists\` and \`/labels\`) remain canonical and 100% unchanged. Legacy purge automation (\`scripts/execute_v43_purge.cjs\`) is retained for emergency reset procedures only, while **strictly preserving Tier 1 \`/artists\` and \`/labels\`**, user wallets, and financial ledgers.

### Purge Targets:
1. \`users/{uid}/projects\` (via \`collectionGroup('projects')\`) — Legacy V42 single-scene project workspaces
2. \`/sharedZcenes\` & \`/sharedzcenes\` — Ephemeral guest share snapshots
3. \`curationJobs\` — Active and historical curation job records
4. \`curationSessions\` — Ephemeral pre-flight split-debit session records

### Strictly Preserved:
* **Tier 1 Global Assets (\`/artists\` & \`/labels\`)** — Canonical verified entity biographies, discographies, iTunes artwork, and single-root subgraphs.
* Root \`users/{uid}\` documents — User accounts, authentication data, token balances (\`tokenBalance\`), settings, and custom Style / Taste Profiles (\`tasteProfiles\`).
* \`users/{uid}/tokenTransactions\` — Immutable user token transaction and top-up receipts.
* \`adminLedger\` (\`adminLedger/system/settings\`, \`adminLedger/system/jitHeals\`) — Platform-wide settings, JIT kill-switch toggles, and historical cost telemetry.
* \`deepWebSessions\` — Account-wide 3-message Deep Connections passes (\`{uid}_global_deepweb_pass\`).

### Execution Command:
\`\`\`bash
# Run automated V43 workspace & ephemeral purge script (preserving Tier 1 /artists & /labels)
node scripts/execute_v43_purge.cjs
\`\`\`
`;
