export const BACKEND_REGRESSION_RUNBOOK = `
# V47.19 Regression Suite (Full-Stack)

This suite locks down the Zcene generation engine locally without incurring Gemini API costs or requiring the heavy Java Firebase Emulator across 29 test suites (642 unit/integration tests).

## Execution Commands

\`\`\`bash
# Run entire full-stack regression test suite (29 test files, 642 offline deterministic tests)
npm test

# Run backend pipeline tests
cd functions && npx vitest run tests/pipeline.test.ts

# Run V29 Read/Write Gate & border-town slug tests
cd functions && npx vitest run tests/v29-gates.test.ts

# Run V37 3-Tier Anchor System, Rule 8, Rule 40 & Rule 41 tests
cd functions && npx vitest run tests/v30-anchors.test.ts

# Run Bio Scannability & Grounding Sanitization tests
npx vitest run functions/tests/bioScannabilityAndGrounding.test.ts

# Run offline iTunes 4-tier scraper unit tests (artwork priority, spacing & Leading-The fallbacks, 403/429 retry, Electronic Hardcore & debut-era guards, Tier 3B song/reissue/compilation rescue, format-stripping & discography reconciliation)
npx vitest run functions/tests/scraperWaterfall.unit.test.ts

# Run live iTunes API smoke tests (opt-in, hits live Apple iTunes endpoints — excluded from deploy:safe)
npm run test:live-itunes

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

# Run V45.7 stateful closed-loop "Pub Demo" integration journeys (real <App /> + <MusicGraph /> + in-memory Firestore harness)
npx vitest run src/test/v45_7-stateful-pub-demo-journeys.test.tsx

# Run V46.0 Phase 1 pre-launch security rules, endpoint gating, concurrency UX & App Check readiness tests
npx vitest run tests/v46-phase1-security-audit.test.tsx

# Run V46.0 Phase 1 backend atomic 1-at-a-time curation lock, stale-job auto-refund & multi-scene refund tests
npx vitest run functions/tests/curationLockAndRefund.test.ts

# Run V46.1–V46.3 Phase 2 backend adminGrantTokens & env-gated flexible simulation top-up tests (min 50T / £5.00)
npx vitest run functions/tests/phase2AdminGrantAndTopUp.test.ts

# Run V46.1–V46.3 Phase 2 frontend Admin Token Grant UI, flexible top-up modal (pinned errors, spinnerless inputs) & Terms/waiver legal tests
npx vitest run tests/v46_1-phase2-admin-grant-topup-legal.test.tsx

# Run V47.0–V47.1 Phase 3 Zine Save as PDF button, temporary PDF filename, @layer base @media print & Deep Cuts print pagination tests
npx vitest run tests/v47-zine-print-pdf.test.tsx

# Run V47.4 server-side deleteUserAccount, GDPR Art. 17 erasure, zero-PII deletedAccountTelemetry & Admin P&L reconciliation tests
npx vitest run functions/tests/deleteUserAccount.test.ts

# Run V47.19 Stack Archive, two-tab Discovery Ledger, ToolbarSearch filtering, Admin read-only visibility & legacy link cleanup tests
npx vitest run tests/v47_19-stack-archive.test.tsx

# Or run with UI for visual tracing:
npx vitest --ui
\`\`\`

## Architecture & Mocking

*   **Firebase-Admin:** Globally mocked to intercept database reads (simulating cache hits/misses) and validate write payloads instantly.
*   **Static Fixtures:** External Gemini API calls are bypassed. Tests use pre-validated JSON topologies from \`tests/__fixtures__/\` to guarantee deterministic, zero-latency execution.
*   **Payload Assertions (Split NODE_DETAILS_SCHEMA & Lineup/Peer Grounding):** Mock validations for Gemini API intercepts MUST assert on the correct \`thinking_level\` parameter (minimal, low, medium, high), \`responseMimeType: "application/json"\`, and the **split \`NODE_DETAILS_SCHEMA\`** (for Artists: \`style\` and \`members\` are in \`required\`, locking \`style\` to \`CANONICAL_STYLES_FLAT\` enum and \`members\` to \`'Name (Role)'\` format while permitting honest \`[]\` strictly for unindexed underground acts [Rule 8]; for Labels: \`style\` and \`imageUrl\` are strictly omitted from properties and required arrays with zero prose fallback), ensuring negative constraints ban band members and self-references from \`notableArtists\`, and that no legacy sampling parameters (temperature, top_p) are present.
*   **Payload Assertions (Label Integrity, 3-Tier Anchors & Deep Cut Qualification):** Mock validations MUST explicitly validate that label IDs have been correctly stripped of suffixes via \`normalizeLabelId\` before being written to the mock database, that \`hasActiveDiscoveryFilters\` ignores empty arrays while forcing Complex Generation when Level 2 or Level 3 anchors are active, and that \`isFullyQualifiedEntityProfile\` unconditionally rejects member-polluted and self-polluted \`notableArtists\` while accepting legitimate underground profiles with terminal \`imageUrl: "not-found"\` when \`Array.isArray(profile.discography)\` (including honest empty arrays \`[]\`).
*   **Image Scraper Assertions (4-Tier Waterfall, Bidirectional Leading \`"The "\`, Tier 3B Album-Anchored / Reissue / Compilation / Hostile-Conflation Rescue, Mutual Non-Hostility Genre Guard, Year-Aware Deduplication & Tier 4 Text-Only Discography Preservation):** Asserts that \`scrapeImageUrlBackend\` resolves clear genre distances at Tier 1 with spacing-collapsed and bidirectional Leading \`"The "\` fallbacks (\`artistNamesMatchWithOptionalThe\`), expanded emo/screamo/post-hardcore/shoegaze/math-rock/pop-punk \`GENRE_TAXONOMY['rock']\` parity, generic-only \`"Demo"\` non-sabotage, \`isAppleElectronicHardcoreGenre\` Electronic/Gabber isolation, \`passesUncorroboratedEraGate\` (\`[foundedYear - 1, foundedYear + 10]\`), and \`reconciled.length > 0\` across all tiers; enforces Mutual Non-Hostility Catalog-Corroborated Genre Relaxation (\`isCatalogCorroboratedNonHostileGenre\` allowing \`>= 2\` distinct non-generic album/track matches on 1 unambiguous \`artistId\` when Apple's genre is a non-hostile umbrella bucket and Zcene's genre is not a pure incompatible non-umbrella family, while blocking cross-family homonyms, hostile Apple genres, bare Electronic \`"Hardcore"\` ID 1050, and single-album unmapped matches); enforces Tier 3B album-anchored \`entity=song\` fallback (\`cleanSongQueryAlbumTitle\` format-stripping, collapsed self-titled/generic exclusion, prioritized 4-query cap, whole-word \`artistNamesMatchWithOptionalThe\`, fuzzy album, genre/era sanity, single unambiguous \`artistId\` requiring \`reconciled.length >= 2\` when flagged in \`hostileProfileArtistIds\`, Multi-Album Reissue Year-Drift Relaxation, Conflation-Pinned Compilation Track-Match Rescue via \`COMPILATION_COLLECTION_RE\` across \`>= 2\` tracks or \`1 collectionName + >= 1 trackName\` with \`trackCount >= 8\`, and \`[Tier 3B Miss]\` diagnostic logging); defends against merged/conflated Apple Music catalogs (\`filterConflatedArtistCollections\` protecting title-corroborated non-hostile releases and stripping explicitly hostile collections); reconciles, backfills, and deterministically deduplicates verified releases via year-aware \`deduplicateDiscographyItems\` (\`itunesCollectionId\`, \`\${normClean}::\${year}\`, and empty-year skip/upgrade while preserving multi-year self-titled albums); enforces Tier 4 fail-fast image rejection while preserving sanitized text-only discography (\`imageUrl: 'not-found'\`, \`discography: sanitizeTextOnlyDiscography(discography)\`, \`itunesScrapeVersion: 3\`); gates Step 2 one-time \`$0.00\` iTunes-only upgrades on anchored \`shouldRunRule38NotFoundUpgrade\` (\`itunesScrapeVersion < 3\`); and immunizes label entities.

## Core Pathways Validated

1.  **Root Generation:** Validates cold-start execution for a single root.
2.  **Complex Generation (Multi-Root / 3-Tier Anchored):** Asserts bridging logic, Level 2 hard Era (\`1965 to N-2 (Current Year - 2) Era Slider\`) and Country (22 canonical countries) boundary enforcement, and Rule 41 Level 3 Graceful Degradation (\`anchorResolution\` telemetry).
3.  **Partial Generation, Multi-Tenant Disambiguation & Root-as-Router Contract:** Ensures existing static data is grafted into newly generated topologies and multi-candidate collisions are resolved without data loss.
    *   *Assertion (Frontend Pre-Flight Callable & Collision Detection):* Asserts that \`validateSeedOriginCallable\` correctly detects homonym collisions, returning candidate arrays with distinct disambiguation hints.
    *   *Assertion (Escape Hatch Re-Query Bouncer - \`tests/v15-core.test.tsx\`):* Asserts that the Re-Query Bouncer synchronously validates manual "Not this artist?" origin/genre hints via Flash 3.6, hard-blocking unverified inputs (\`isValid: false\`) with an inline UI error banner while locking "Confirm & Generate", and cleanly unlocking upon verified input.
    *   *Assertion (Zero Blind Trust & Root-as-Router Contract):* Asserts that pre-flight resolution synchronously writes Evolved Stub contracts (\`_isStub: true\`, \`isAmbiguous: false\`, \`redirectTo: "id-iso"\`, \`candidates: [...]\`) to Firestore prior to background worker triggering, and ensures bare root IDs never hold entity payloads while verified payloads resolve to geographically suffixed documents (\`artists/{id}-{iso}\`).
    *   *Assertion (Autosave Immunity):* Asserts that the frontend accurately maps returned \`apiUsage\`, \`generationType\`, and \`anchorResolution\`, and that subsequent autosaves (\`merge: true\`) do not overwrite these fields with 'Clone'.
4.  **Direct Hit (Cache) & V37/V45 Read/Write Gate Qualification:** Validates the short-circuit logic successfully returns cached snapshots without triggering the generative loop, and asserts that \`isFullyQualifiedEntityProfile\` unconditionally rejects member-polluted and self-polluted \`notableArtists\` across all gates. Asserts that the Column 3 Read Gate (\`requireMembersAndPeers: true\`) flags cached profiles missing \`members\` or \`notableArtists\` as unqualified (routing to re-hydration self-healing), while the Step 6 Write Gate and JIT Healer default to \`false\` (permitting honest underground \`members: []\` [Rule 8] without write failures or runaway JIT loops).
5.  **Share Payload Blacklist Mutation:** Asserts that the Universal Serializer generates a 1:1 clone, and that the Ephemeral Blacklist successfully injects a 30-day TTL, strips canvasLayout, and purges rigid coordinates (fx, fy) before generating guest links.
6.  **Just-In-Time (JIT) Asset Healing & Circuit Breaker (404 Emergency Parachute ONLY):**
    *   *Simulated 404 Miss:* Asserts that a missing or un-styled artist in \`detailsCache\` triggers \`healOrphanedAsset\` and synthesizes a valid profile enforcing the strict Artist style enum.
    *   *Zero Sweeping of Stale Data:* Asserts that existing complete documents (even if soft-expired > 365 days) bypass synthesis at Tier 1 gate with zero API cost; JIT Healer is never invoked for soft-expired nodes.
    *   *In-Flight Memory Dedup:* Asserts that concurrent clicks on the same un-hydrated node trigger only a single network invocation.
    *   *Circuit Breaker & Kill Switch:* Asserts that exceeding 100 heals in 24 hours trips the auto-kill circuit breaker, throws \`resource-exhausted\`, and honors the admin toggle in \`adminLedger/system/settings\`.
    *   *Telemetry Audit:* Validates receipt creation in \`adminLedger/system/jitHeals\` with accurate token counts and list-price cost calculations.
7.  **Upfront Multi-Scene Batch Curation & Chained Worker Handoff ("Cup of Tea" Mode):**
    *   *Assertion (Bundled Pre-Flight & Dynamic Batch Pricing):* Asserts that multi-scene batches calculate aggregate token totals (5T–50T) with a single bundled 1T pre-flight fee across uncached scenes (\`bundledSeedsLabel\`).
    *   *Assertion (Pass 1 Typo & Canonical Band-Name / Leading \`"The "\` Auto-Correction — \`v47.13\`):* Asserts that \`validateSeedOriginCallable\` auto-corrects typos and restores omitted official leading \`"The "\` articles (\`"Rocking Horse Winner"\` -> \`"The Rocking Horse Winner"\`, \`"Get Up Kids"\` -> \`"The Get Up Kids"\`) while preserving non-\`"The "\` acts and stripping erroneous \`"The "\` prefixes, keys single-artist Rule 17 bare router stubs strictly by \`canonicalBareNormId\`, handles canceled-stub re-entry cleanly, and promotes post-canonicalization cached Root hits to \`isTopologyHit: true\` with exact \`1T + 4T = 5T\` split-debit Direct Hit settlement.
    *   *Assertion (Worker Phase 1 Deferral & Fast Return <1.5s):* Asserts that Column 2 sets \`deferPhase1ToWorker: true\`, persisting projects in \`status: 'curating'\` and returning HTTP 200 OK immediately.
    *   *Assertion (Chained Worker Baton Handoffs & Intermediate Hop Step 3B Bypass):* Asserts that sequential chained hops (\`job_1 -> ... -> job_N\` with \`isChainedHop: true\`) execute without client coordination, bypassing Overarching Zine synthesis until the final hop across the completed constellation.
    *   *Assertion (Step 0 Direct Hit & Peer Profile Hydration):* Asserts that cached entities across all batch scenes are pre-hydrated into \`existingProjectDetailsMap\` with stripped \`canonicalKey\`s to eliminate client request storms upon completion.
    *   *Assertion (Settlement Dual-Write Isolation & Deterministic Scene 1 Centering):* Asserts that \`apiUsage\` and \`costUsd\` dual-writes are strictly isolated to settlement rows (\`['spend_live_synthesis', 'spend_direct_hit']\`), and upon batch completion, \`activeSceneId\` defaults to \`'scene-1'\` centering the camera on Scene 1 \`(1000, 1000)\` post-D3 zoom init.
8.  **Phase 1 Pre-Launch Security Guardrails, Uniform 1-at-a-Time Lock & App Check Readiness (\`v46.0\`):**
    *   *Assertion (Firestore Rules & Endpoint Gating):* Validates \`curationJobs\` client write lockdown, parenthesized \`isSignedIn() && (...)\` update precedence on \`/artists\` and \`/labels\`, \`users/{uid}\` \`clientWritableUserKeys()\` allowlist, \`curationLocks/{uid}\` Admin-write-only rule, Firebase Auth on \`healOrphanedAsset\` and \`server.js\` \`/api/artist/scrape-video-id\`, and \`ReCaptchaEnterpriseProvider\` App Check Monitor Mode across all 9 \`onCall\` functions.
    *   *Assertion (Uniform Concurrency Lock & Stale-Job Auto-Refund):* Validates atomic \`curationLocks/{uid}\` acquisition (including Admin), \`ACTIVE_CURATION_IN_PROGRESS\` error translation & Dashboard CTA lock, and 10-minute \`STALE_LOCK_TTL_MS\` expiry swept every 5 minutes by \`reapStaleCurationJobs\` / inline recovery auto-refunds with sunk API cost checkpointing to \`adminLedger/system/curationFailures\`.
9.  **Phase 2 Admin Token Grant, Flexible Beta Top-Ups & Legal Waiver (\`v46.1–v46.3\`):**
    *   *Assertion (Server-Verified Support Credits):* Validates \`adminGrantTokens\` strict \`caller.isAdmin\` gate, \`getUserByEmail\` resolution, atomic \`tokenBalance\` increment (preserving \`lifetimeTokensPurchased\`), immutable \`admin_grant\` ledger receipt, and Admin-only UI card in \`UsageAnalyticsPage\`.
    *   *Assertion (Flexible Top-Up UX & UK/EU Legal Guardrails):* Validates \`[50, 100, 150]\` presets (\`min: 50T / £5.00\`, \`max: 1000T\`, \`£0.10/T\`), \`ALLOW_SIMULATED_TOPUP === "true"\` kill-switch for authenticated beta users, required UK/EU 14-day waiver checkbox, \`/terms\` page (\`GlobalWall\` exempted), spinnerless number inputs, and pinned modal error banners outside \`<ModalBody>\`.
10. **Phase 3 Zine Save as PDF & Light Editorial \`@media print\` Engine (\`v47.0–v47.1\`):**
    *   *Assertion (PDF Filename & Toolbar Controls):* Validates \`formatZinePrintDocumentTitle\` (\`Zcene - <Title>\`), Desktop/Mobile Save as PDF buttons for both owners and shared \`/z/:id\` viewers, and temporary \`document.title\` swap/restoration around \`window.print()\`.
    *   *Assertion (Multi-Page Print Pagination & Deep Cuts):* Validates \`@layer base { @media print }\` unlocking all 6 nested viewport/fixed/scroll traps (without Tailwind \`!fixed\`/\`!h-screen\` cascade conflicts on \`GraphPage\`'s desktop magazine \`<aside>\`), light editorial palette, and Deep Cuts artist/label profile visibility in print DOM.
11. **Server-Side Account Deletion, GDPR Art. 17 Erasure & Anonymised P&L Preservation (\`v47.4\`):**
    *   *Assertion (Recency, Concurrency, Sole Admin Protection & Rules Lockdown):* Validates \`deleteUserAccount\` fail-closed sole Admin self-deletion hard-block (\`isProtectedAdminIdentity\` -> \`permission-denied\` / \`ADMIN_ACCOUNT_PROTECTED\` before any DB/Auth calls, with \`Delete Account\` hidden for Admin in \`Header.tsx\` and guarded in \`App.tsx\`), \`auth_time <= 300s\` (\`REQUIRES_RECENT_LOGIN\` + seamless Google popup re-auth retry), active curation lock guard (\`ACTIVE_CURATION_IN_PROGRESS\`), Admin-only \`users/{userId}\` delete lock (excluding the sole Admin UID) in \`firestore.rules\`, and Admin-read/server-write-only \`adminLedger/system/deletedAccountTelemetry/{archiveId}\`.
    *   *Assertion (Full Erasure & Zero-PII P&L Reconciliation):* Validates chunk-deletion of all user subcollections, legacy projects, \`sharedZcenes\`, locks, sessions, jobs, and Firebase Auth user, \`curationFailures\` PII scrubbing to \`"deleted_account"\`, zero-PII financial archive creation, and exact \`computeAggregateMetrics\` P&L reconciliation excluding forfeited balances from active unspent float.
12. **Landing Page Demo Parity (\`v47.7\`), Rule 38 Two-Layer Album-Anchored iTunes Fallback (\`v47.8\`), Guard Hardening (\`v47.9\`) & Compilation / Reissue / Format-Stripping Rescue (\`v47.10–v47.12\`):**
    *   *Assertion (HomePage Live-Parity Mockups & Zero Mount-Time Fetches):* Validates Multi-Scene Switcher Strip in \`ArtistFeatureVisual.tsx\`, live-parity The Get Up Kids Members, Scene Circle & 6 Essential Listening albums in \`CollectionIntelligenceVisual.tsx\`, \`Style resonance\` copy without em-dashes, and zero mount-time iTunes fetches via \`!isStaticMockup\`.
    *   *Assertion (Tier 3B Album-Anchored Fallback, Conflation Guard & One-Time Upgrade):* Validates 4-query-capped \`entity=song\` recovery (with \`cleanSongQueryAlbumTitle\` format-stripping and collapsed self-titled/generic exclusion), fail-closed guards (Various Artists, substring artists, hostile genres, year drift, multi-\`artistId\` ambiguity), exact \`#1511350574\` Exhibition conflated catalog filtering (blocking 1994–2003 Christian/New Age 1-track singles), generic-only \`"Demo"\` Tier 1 safeguard vs. \`Reason to Believe\` corroboration rejection, and Step 2 \`itunesScrapeVersion: 2\` one-time \`$0.00\` upgrade check.
    *   *Assertion (Apple Electronic \`"Hardcore"\`, Uncorroborated Debut-Era Gate & Empty-Catalog Fail-Closed):* Validates \`isAppleElectronicHardcoreGenre\` blocking bare Apple \`"Hardcore"\` against non-electronic hardcore/metalcore/punk subgenres (\`panic-us\` \`#15241026\`), \`passesUncorroboratedEraGate\` rejecting \`reason-to-believe-us\`, \`sunrise-pl\`, \`hands-tied-us\`, \`zwan-us\`, pre-formation homonyms, and missing \`foundedYear\` while preserving \`exhibition-us\` & \`christie-front-drive-us\`, anchored \`shouldRunRule38NotFoundUpgrade\`, and empty-reconciled fail-closed (\`certain-people-i-know-us\`).
    *   *Assertion (Compilation Track-Match Rescue, Collection+Track Corroboration, Format-Stripping, Multi-Album Reissue Drift & Leading \`"The "\` Fallback):* Validates conflation-pinned Compilation Rescue for \`mouthpiece-us\` (\`#161072028\` pinned strictly to \`#300974664\` across 2-track, 1-collectionName + 1-trackName, format-suffixed \`"What Was Said EP"\` / \`"Face Tomorrow 7-inch"\`, chronological \`"Mouthpiece EP"\` + \`"Demo 1991"\` prioritization, and 5th-title cross-scanning) and \`friction-us\` (\`#4940290\` pinned strictly to \`#1653010702\`), negative guards (1-of-2 track coincidence, 1 collectionName with 0 track matches, collapsed self-titled \`"Mouthpiece EP"\`, same-track duplicate, \`< 8\` track EP), \`jejune-us\` (\`#1457025031\`) multi-album 2025 reissue pass vs. single-album year-drift rejection, and Tier 1 Leading \`"The "\` fallback for \`the-rocking-horse-winner-us\` (\`#31536457\`).

    *   *Assertion (Mutual Non-Hostility Catalog-Corroborated Genre Guard, Emo/Rock Taxonomy Parity & Year-Aware Discography Deduplication — \`v47.14\`):* Validates live \`Fairweather\` (\`#31535979\`, \`genre: 'Emo'\`, mixed \`'Rock'\`/\`'Punk'\` catalog recovering \`"Alaska"\` 2001 + \`"Lusitania"\` 2003), \`isCatalogCorroboratedNonHostileGenre\` multi-album pass for unmapped editorial subgenres (\`'Sasscore / Nintendocore'\`) and crossovers (\`'Rap Rock'\`, \`'Jazz Rock'\`, \`'Electronic Rock'\`, \`'Soul Punk'\`) vs. cross-family non-umbrella Zcene genre / hostile Apple genre / bare Electronic \`'Hardcore'\` 1050 / single-album rejections, and year-aware \`deduplicateDiscographyItems\` eliminating duplicate \`Horizon\` (\`#493669654\`), \`Turning Point\` (\`#1537004455\`), *Good Apollo* Volume One/Two prefix collisions, and yearless duplicates while preserving multi-year self-titled albums (*American Football* 1999/2016/2019, *Weezer* 1994/2001).
    *   *Assertion (Cached-Artist 0-Call Bypass, Recalibrated \`/ 3\` Cold-Batch Cooldown & Write-Boundary \`_isReadOnly\` Hygiene — \`v47.15\`):* Validates Step 2 retirement of \`requiresVideoScraping\` / \`scrapeVideoIdBackend\` so qualified cached artists (\`youtubeVideoId: null\`) execute 0 Gemini calls, 0ms stagger, \`_isReadOnly: true\`, and 0ms rate-limit cooldown (matching cached labels), legacy \`'not-found'\` cached artists (\`itunesScrapeVersion < 3\`) clear stale \`_isReadOnly\` for one-time \`$0.00\` iTunes-only upgrades at \`batchAiCallsCount = 0\`, \`normalizeDetailsForWrite\` strips transient \`_isReadOnly\` before Firestore writes, cold-batch cooldown scales via \`batchAiCallsCount / 3\` (preserving the 25s cycle window on 100% cold 3-artist batches), and \`App.tsx\` guards single-artist enrichment against client-side \`runUpfrontFetchAndWrite\` in Cloud Curation mode.
    *   *Assertion (Structural Country-Suffix Boundary, Bidirectional Leading \`"The "\`, Tier 4 Text-Only Discography Preservation, Hostile-Profile Conflation Guard & Chained Baton Deduplication — \`v47.16\`):* Validates \`stripCountrySlug(name, expectedOriginOrIso)\` and \`extractTrailingCountryIso\` structural lowercase-slug & origin-aware guards (preserving display names like \`"At the Drive-In"\` and bare slugs with origin locks while rejecting 2-letter US state tokens in \`resolveExpectedOriginIsos("Indianapolis, IN")\` / \`"Portland, ME"\`), \`isCanonicalSeedMatch\` base-to-suffixed parity without \`"End It"\` vs \`"END"\` collisions, bidirectional \`artistNamesMatchWithOptionalThe\` rescuing \`"Murder City Devils"\` <-> \`"The Murder City Devils"\` across Tiers 1–3B, \`sanitizeTextOnlyDiscography\` preserving text-only releases on Tier 4 miss + \`CURRENT_ITUNES_SCRAPE_VERSION = 3\` self-healing \`at-the-drive-in-us\` and \`murder-city-devils-us\`, Tier 3B \`hostileProfileArtistIds\` requiring \`>= 2\` verified non-hostile releases on conflated hostile profiles (*Radon* \`#75264551\`), removal of truncated \`'Post-'\`/\`'Proto-'\` style tokens, single \`detailsCache\` serialization on chained job baton handoffs, and Step 4B canonical node groups (\`6\` country, \`7\` founded).
    *   *Assertion (Canonical Verified iTunes \`artistName\` Adoption, \`v3\` -> \`v4\` Self-Heal, Zero-Dual-Stubbing \`stripLeadingTheFromSlug\` Parity & Hyphen-Preserving Project Titles — \`v47.17\`):* Validates \`resolveVerifiedItunesArtistDisplayName\` adopting Apple Music's verified \`artistName\` (\`"The Murder City Devils"\` \`#3269301\`, \`"At the Drive-In"\` \`#41990355\`) into \`details.artist\`, top-level \`seedArtists\`, and \`node.label\` while skipping \`"Various Artists"\` and rejecting Tier 2 geographic tags (\`"Klear TH"\`) and multi-artist credits; \`shouldRunRule38ArtistNameUpgrade\` gating one-time \`$0.00\` \`itunesScrapeVersion === 3\` -> \`4\` upgrades with non-destructive artwork preservation on transient iTunes failures; \`stripLeadingTheFromSlug\` matching \`"murder-city-devils-us"\` <-> \`"The Murder City Devils"\` across \`isCanonicalSeedMatch\`, \`isEntitySeedMatch\`, \`isNodeInSeedList\`, \`resolveSceneRootDisplayNames\`, \`isAutoGeneratedProjectTitle\`, and backend \`dedupQuery\` without dual-stubbing; and Step Zero preservation of internal hyphens (\`"At the Drive-In"\`) and cached artist casing.
    *   *Assertion (Single Source of Truth Seed-Identity Architecture: Front-Door iTunes Naming Authority, Downstream Seed Lock, Cold Peer \`idRewriteMap\` Re-Keying & \`cacheKey\` <-> \`artistId\` Parity — \`v47.18\`):* Validates \`resolveItunesCanonicalArtistNameBackend\` (\`$0.00\`, \`1500ms\` fail-open) inside \`validateSeedOriginCallable\` snapping unambiguous seeds to Apple Music's canonical billing (\`"Murder City Devils"\` -> \`"The Murder City Devils"\` \`#3269301\`, \`"At The Drive In"\` -> \`"At the Drive-In"\` \`#41990355\`) with Pass 1 exact-match priority (\`"Supersuckers"\` / \`"Deftones"\`) and Escape Hatch protection (\`!isAmbiguous && !originHint && !genreHint\`); downstream seed-identity locks (\`hasLockedPreFlightIdentity\` in Column 2 and \`hasLockedWorkerSeedIdentity\` in Column 3) eliminating redundant Flash validation Calls #2 and #3 (1 Flash call per cold seed instead of 3); Step 2 dual \`slugDedup\`, cold non-seed peer re-keying across \`idRewriteMap\`, \`finalGraph.nodes\`/\`links\`, and \`sceneArtistSnippetsMap\` (with superseded \`origNorm\` cleanup), and Step 5/6 mathematical \`artistId === stripCountrySlug(cacheKey)\` parity; and Box 4 confirmation draft scene title/name synchronization and superseded pre-correction key pruning.
    *   *Assertion (Read-Only Pre-Flight Gateway, Case-Insensitive \`correctedInput\` Guard, Canonical \`seedIds\` / \`seedArtistIds\` \`-iso\` Self-Heal across Multi-Scene Forks & Localized Storefront Genre Normalization — \`v47.19\`):* Validates \`validateSeedOriginCallable\` performing zero speculative \`/artists\` writes prior to Box 4 confirmation (eliminating orphan stubs on Cancel / Escape Hatch), forcing \`correctedInput: false\` on case-only matches (\`"void"\` -> \`"Void"\`) while preserving \`correctedInput: true\` on colliding typos (\`"nrvana"\` -> \`"Nirvana"\`); \`normalizeProjectScene\` self-healing bare \`seedIds\` / \`seedArtistIds\` from \`graphData.nodes\` (preferring \`isSeed || isSceneSeed\` root artist nodes across single-root and multi-root scenes with \`computeSceneSetSignature\` invariance) and preserving \`["the-murder-city-devils-us", "the-hives-se"]\` across \`+ Add Scene\` and multi-scene forks via \`getAllProjectSeedIds\`; persistent \`Origin / Country\` and \`Genre (optional)\` Escape Hatch micro-labels; and regional storefront \`&lang=en_us\` + \`normalizeGenreText\` NFD diacritic folding and localized Apple Music genre alias mapping (\`"Hårdrock"\` -> \`"hard rock"\` resolving *The Hellacopters* \`#8039597\` in Tier 1 on \`SE\` storefront while keeping EDM \`"ハードコア"\` blocked as bare \`"hardcore"\` ID 1050).

## Database Purge Runbook Protocol (V47.19 Multi-Scene Architecture)

Note: The V47.19 Multi-Scene Infinite Board & Layered Zine architecture retains backward-compatible \`schemaVersion: 43\` across all Firestore project documents. Zero database purge is required for V47.19 operations.

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

### Option A (Surgical Topology Purge — Recommended Post-B2.12 Reset Protocol):
To upgrade legacy cached topologies to calibrated artist-only Box 5 weights (~10x faster curation than a full cold wipe by preserving verified entity biographies, discographies, and iTunes artwork):
* Clear workspace collections (projects, sharedZcenes, curationJobs, curationSessions) and reset ONLY topology fields (graphData: null, hasUniqueSpiderweb: false, synthesisRationale: null, isPrimarySeed: false) on cached seed docs.
* Preserve 100% of verified entity detailsCache profiles, Root-as-Router stubs, record label docs, user accounts, and tokenTransactions.
`;
