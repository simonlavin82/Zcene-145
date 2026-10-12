export const BACKEND_REGRESSION_RUNBOOK = `
# V23 Regression Suite (Full-Stack)

This suite locks down the Zcene generation engine locally without incurring Gemini API costs or requiring the heavy Java Firebase Emulator.

## Execution Commands

\`\`\`bash
# Run backend pipeline tests
cd functions && npx vitest run tests/pipeline.test.ts

# Run JIT Asset Healer & circuit breaker tests
cd functions && npx vitest run tests/healOrphanedAsset.test.ts

# Run frontend core tests
npx vitest run tests/v15-core.test.tsx

# Or run with UI for visual tracing:
npx vitest --ui
\`\`\`

## Architecture & Mocking

*   **Firebase-Admin:** Globally mocked to intercept database reads (simulating cache hits/misses) and validate write payloads instantly.
*   **Static Fixtures:** External Gemini API calls are bypassed. Tests use pre-validated JSON topologies from \`tests/__fixtures__/\` to guarantee deterministic, zero-latency execution.
*   **Payload Assertions:** Mock validations for Gemini API intercepts MUST assert on the correct \`thinking_level\` parameter (minimal, low, medium, high) and ensure no legacy sampling parameters (temperature, top_p) are present.
*   **Payload Assertions (Label Integrity):** Mock validations MUST explicitly validate that label IDs have been correctly stripped of suffixes before being written to the mock database.

## Core Pathways Validated

1.  **Root Generation:** Validates cold-start execution on a single seed.
2.  **Complex Generation (Multi-Seed):** Asserts bridging logic (ensuring the pipeline correctly hallucinates interlocking nodes, e.g., using Rick Rubin to bridge disparate seeds).
3.  **Partial Generation & Multi-Tenant Disambiguation:** Ensures existing static data is grafted into newly generated topologies and multi-candidate collisions are resolved without data loss.
    *   *Assertion (Frontend Pre-Flight Callable):* Asserts that \`validateSeedOriginCallable\` correctly detects homonym collisions, returning candidate arrays with distinct disambiguation hints.
    *   *Assertion (Backend Stub Minting):* Asserts that pre-flight resolution synchronously writes Evolved Stub contracts (\`_isStub: true\`, \`isAmbiguous: true\`, \`candidates: [...]\`) to Firestore prior to background worker triggering.
    *   *Assertion (Autosave Immunity):* Asserts that the frontend accurately maps returned \`apiUsage\` and \`generationType\`, and that subsequent autosaves (\`merge: true\`) do not overwrite these fields with 'Clone'.
4.  **Direct Hit (Cache):** Validates the short-circuit logic successfully returns cached snapshots without triggering the generative loop. Explicitly asserts that Direct Hits bypass the backend entirely and rely on Local Topology Routing (bypassing legacy stub healing).
5.  **Share Payload Blacklist Mutation:** Asserts that the Universal Serializer generates a 1:1 clone, and that the Ephemeral Blacklist successfully injects a 30-day TTL, strips canvasLayout, and purges rigid coordinates (fx, fy) before generating guest links.
6.  **Just-In-Time (JIT) Asset Healing & Circuit Breaker (404 Emergency Parachute ONLY):**
    *   *Simulated 404 Miss:* Asserts that a missing \`detailsCache\` entry triggers \`healOrphanedAsset\` and resolves a valid profile.
    *   *Zero Sweeping of Stale Data:* Asserts that existing complete documents (even if soft-expired > 365 days) bypass synthesis at Tier 1 gate with zero API cost; JIT Healer is never invoked for soft-expired nodes.
    *   *In-Flight Memory Dedup:* Asserts that concurrent clicks on the same un-hydrated node trigger only a single network invocation.
    *   *Circuit Breaker & Kill Switch:* Asserts that exceeding 100 heals in 24 hours trips the auto-kill circuit breaker, throws \`resource-exhausted\`, and honors the admin toggle in \`adminLedger/system/settings\`.
    *   *Telemetry Audit:* Validates receipt creation in \`adminLedger/system/jitHeals\` with accurate token counts and list-price cost calculations.
`;
