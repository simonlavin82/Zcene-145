export const BACKEND_REGRESSION_RUNBOOK = `
# V38 Regression Suite (Full-Stack)

This suite locks down the Zcene generation engine locally without incurring Gemini API costs or requiring the heavy Java Firebase Emulator.

## Execution Commands

\`\`\`bash
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

# Run Architecture V38 Token Economy & Split-Debit tests
npx vitest run tests/v38-token-economy.test.tsx

# Run DetailsPanel 3-column layout & style tests
npx vitest run components/DetailsPanel.test.tsx

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

1.  **Root Generation:** Validates cold-start execution on a single seed.
2.  **Complex Generation (Multi-Seed / 3-Tier Anchored):** Asserts bridging logic, Level 2 hard Era (\`1965 to N-2 (Current Year - 2) Era Slider\`) and Country (22 canonical countries) boundary enforcement, and Rule 41 Level 3 Graceful Degradation (\`anchorResolution\` telemetry).
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

## V36/V37 Database Purge Runbook Protocol

When rolling out architectural schema shifts (such as the V36 mandatory Style enum for artists), a full database purge MUST be executed to prevent legacy, un-styled cached documents from triggering the strict JIT healer upon re-entry.

### Purge Targets:
1. \`/artists\` — Global artist entity library
2. \`/labels\` — Global label entity library
3. \`curationJobs\` — Active and historical curation job records
4. \`/sharedZcenes\` & \`/sharedzcenes\` — Ephemeral guest share snapshots
5. \`users/{uid}/projects\` — User-saved project topologies (purged via Firestore \`collectionGroup('projects')\`)
6. \`adminLedger/system/jitHeals\` — Historical JIT healing receipts

### Strictly Preserved:
* Root \`users/{uid}\` documents — User accounts, authentication data, settings, and custom Style / Taste Profiles (\`tasteProfiles\`).
* \`adminLedger/system/settings\` — Platform-wide settings and JIT kill-switch toggles.

### Execution Command:
\`\`\`bash
# Run automated purge script
node scripts/execute_v36_purge.cjs
\`\`\`
`;
