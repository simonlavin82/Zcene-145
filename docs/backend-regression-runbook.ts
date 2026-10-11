export const BACKEND_REGRESSION_RUNBOOK = `
# V21 Regression Suite (Full-Stack)

This suite locks down the Zcene generation engine locally without incurring Gemini API costs or requiring the heavy Java Firebase Emulator.

## Execution Commands

\`\`\`bash
# Run backend pipeline tests
cd functions && npx vitest run tests/pipeline.test.ts

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
3.  **Partial Generation (Stub Hit):** Ensures existing static data (like a pre-existing "Label" node) is successfully grafted into newly generated topologies.
    *   *Assertion (Backend):* Asserts that the "Pre-Flight Alias Resolution" block successfully writes a bare stub pointer (\`_isStub: true\`) to Firestore prior to background execution.
    *   *Assertion (Frontend):* Asserts that the frontend accurately maps the returned \`apiUsage\` and \`generationType\`, and that subsequent autosaves (\`merge: true\`) do not overwrite these fields with 'Clone'.
4.  **Direct Hit (Cache):** Validates the short-circuit logic successfully returns cached snapshots without triggering the generative loop. Explicitly asserts that Direct Hits bypass the backend entirely and rely on Local Topology Routing (bypassing legacy stub healing).
5.  **Share Payload Blacklist Mutation:** Asserts that the Universal Serializer generates a 1:1 clone, and that the Ephemeral Blacklist successfully injects a 30-day TTL, strips canvasLayout, and purges rigid coordinates (fx, fy) before generating guest links.
`;
