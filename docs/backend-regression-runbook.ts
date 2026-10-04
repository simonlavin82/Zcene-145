export const BACKEND_REGRESSION_RUNBOOK = `
# Backend Integration Regression Suite

This suite locks down the Zcene generation engine locally without incurring Gemini API costs or requiring the heavy Java Firebase Emulator.

## Execution Commands

\`\`\`bash
cd functions
npx vitest run tests/pipeline.test.ts
# Or run with UI for visual tracing:
npx vitest --ui
\`\`\`

## Architecture & Mocking

*   **Firebase-Admin:** Globally mocked to intercept database reads (simulating cache hits/misses) and validate write payloads instantly.
*   **Static Fixtures:** External Gemini API calls are bypassed. Tests use pre-validated JSON topologies from \`tests/__fixtures__/\` to guarantee deterministic, zero-latency execution.

## Core Pathways Validated

1.  **Root Generation:** Validates cold-start execution on a single seed.
2.  **Complex Generation (Multi-Seed):** Asserts bridging logic (ensuring the pipeline correctly hallucinates interlocking nodes, e.g., using Rick Rubin to bridge disparate seeds).
3.  **Partial Generation (Stub Hit):** Ensures existing static data (like a pre-existing "Label" node) is successfully grafted into newly generated topologies.
4.  **Direct Hit (Cache):** Validates the short-circuit logic successfully returns cached snapshots without triggering the generative loop.
`;
