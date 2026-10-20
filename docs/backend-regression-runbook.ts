export const BACKEND_REGRESSION_RUNBOOK = `
# V33 Regression Suite (Full-Stack)

This suite locks down the Zcene generation engine locally without incurring Gemini API costs or requiring the heavy Java Firebase Emulator.

## Execution Commands

\`\`\`bash
# Run backend pipeline tests
cd functions && npx vitest run tests/pipeline.test.ts

# Run V29 Read/Write Gate & border-town slug tests
cd functions && npx vitest run tests/v29-gates.test.ts

# Run V33 3-Tier Anchor System, Rule 8, Rule 40 & Rule 41 tests
cd functions && npx vitest run tests/v30-anchors.test.ts

# Run JIT Asset Healer & circuit breaker tests
cd functions && npx vitest run tests/healOrphanedAsset.test.ts

# Run iTunes 4-tier scraper waterfall tests
cd functions && npx vitest run tests/scraperWaterfall.test.ts

# Run frontend core tests
npx vitest run tests/v15-core.test.tsx

# Or run with UI for visual tracing:
npx vitest --ui
\`\`\`

## Architecture & Mocking

*   **Firebase-Admin:** Globally mocked to intercept database reads (simulating cache hits/misses) and validate write payloads instantly.
*   **Static Fixtures:** External Gemini API calls are bypassed. Tests use pre-validated JSON topologies from \`tests/__fixtures__/\` to guarantee deterministic, zero-latency execution.
*   **Payload Assertions:** Mock validations for Gemini API intercepts MUST assert on the correct \`thinking_level\` parameter (minimal, low, medium, high), \`responseMimeType: "application/json"\`, and \`NODE_DETAILS_SCHEMA\` (with zero prose fallback), and ensure no legacy sampling parameters (temperature, top_p) are present.
*   **Payload Assertions (Label Integrity, 3-Tier Anchors & Deep Cut Qualification):** Mock validations MUST explicitly validate that label IDs have been correctly stripped of suffixes via \`normalizeLabelId\` before being written to the mock database, that \`hasActiveDiscoveryFilters\` ignores empty arrays while forcing Complex Generation when Level 2 or Level 3 anchors are active, and that \`isFullyQualifiedEntityProfile\` rejects prose-fallback stubs (\`discography: []\`, \`"Synthesised from live cultural archives..."\`) while accepting legitimate underground profiles with terminal \`imageUrl: "not-found"\` when \`discography.length > 0\`.

## Core Pathways Validated

1.  **Root Generation:** Validates cold-start execution on a single seed.
2.  **Complex Generation (Multi-Seed / 3-Tier Anchored):** Asserts bridging logic, Level 2 hard Era (\`1965–2026\`) and Country (22 canonical countries) boundary enforcement, and Rule 41 Level 3 Graceful Degradation (\`anchorResolution\` telemetry).
3.  **Partial Generation, Multi-Tenant Disambiguation & Root-as-Router Contract:** Ensures existing static data is grafted into newly generated topologies and multi-candidate collisions are resolved without data loss.
    *   *Assertion (Frontend Pre-Flight Callable & Collision Detection):* Asserts that \`validateSeedOriginCallable\` correctly detects homonym collisions, returning candidate arrays with distinct disambiguation hints.
    *   *Assertion (Escape Hatch Re-Query Bouncer - \`tests/v15-core.test.tsx\`):* Asserts that the Re-Query Bouncer synchronously validates manual "Not this artist?" origin/genre hints via Flash 3.6, hard-blocking unverified inputs (\`isValid: false\`) with an inline UI error banner while locking "Confirm & Generate", and cleanly unlocking upon verified input.
    *   *Assertion (Zero Blind Trust & Root-as-Router Contract):* Asserts that pre-flight resolution synchronously writes Evolved Stub contracts (\`_isStub: true\`, \`isAmbiguous: false\`, \`redirectTo: "id-iso"\`, \`candidates: [...]\`) to Firestore prior to background worker triggering, and ensures bare root IDs never hold entity payloads while verified payloads resolve to geographically suffixed documents (\`artists/{id}-{iso}\`).
    *   *Assertion (Autosave Immunity):* Asserts that the frontend accurately maps returned \`apiUsage\`, \`generationType\`, and \`anchorResolution\`, and that subsequent autosaves (\`merge: true\`) do not overwrite these fields with 'Clone'.
4.  **Direct Hit (Cache) & V33 Read/Write Gate Qualification:** Validates the short-circuit logic successfully returns cached snapshots without triggering the generative loop, and asserts that \`isFullyQualifiedEntityProfile\` blocks prose-fallback stubs at both the Read Gate and Write Gate while permitting valid terminal \`imageUrl: "not-found"\` monogram profiles (\`discography.length > 0\`).
5.  **Share Payload Blacklist Mutation:** Asserts that the Universal Serializer generates a 1:1 clone, and that the Ephemeral Blacklist successfully injects a 30-day TTL, strips canvasLayout, and purges rigid coordinates (fx, fy) before generating guest links.
6.  **Just-In-Time (JIT) Asset Healing & Circuit Breaker (404 Emergency Parachute ONLY):**
    *   *Simulated 404 Miss:* Asserts that a missing \`detailsCache\` entry triggers \`healOrphanedAsset\` and resolves a valid profile.
    *   *Zero Sweeping of Stale Data:* Asserts that existing complete documents (even if soft-expired > 365 days) bypass synthesis at Tier 1 gate with zero API cost; JIT Healer is never invoked for soft-expired nodes.
    *   *In-Flight Memory Dedup:* Asserts that concurrent clicks on the same un-hydrated node trigger only a single network invocation.
    *   *Circuit Breaker & Kill Switch:* Asserts that exceeding 100 heals in 24 hours trips the auto-kill circuit breaker, throws \`resource-exhausted\`, and honors the admin toggle in \`adminLedger/system/settings\`.
    *   *Telemetry Audit:* Validates receipt creation in \`adminLedger/system/jitHeals\` with accurate token counts and list-price cost calculations.
`;

