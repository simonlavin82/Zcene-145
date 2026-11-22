# Security Specification - Zcene

## Data Invariants
1. A user can only access their own profile, stack, session, and projects.
2. `SharedZcenes` are public for reading but can only be created by signed-in users and deleted by their authors.
3. User emails must be verified.
4. Timestamps (`createdAt`, `updatedAt`) must be strictly controlled via `request.time`.
5. IDs must follow a strict alphanumeric pattern.
6. Token Wallet balances (`users/{uid}.tokenBalance`) and transactions (`users/{uid}/tokenTransactions`) are strictly server-authoritative and write-locked against client mutation in `firestore.rules`.
7. Settlement dual-writes of `apiUsage` and `costUsd` are strictly isolated to settlement transactions (`['spend_live_synthesis', 'spend_direct_hit']`), protecting pre-flight rows from cost inflation.
8. Workspace deletions strictly follow a 2-Stage 30-Day Trash lifecycle (`status: 'trashed'`, `purgeAt: trashedAt + 30d`). Permanent deletion transitions to `status: 'deleted'`, nullifying heavy topology blobs while permanently preserving financial telemetry headers (`tokensSpent`, `apiUsage`, `deepWebApiUsage`, `anchorResolution`). Hard `deleteDoc` is permanently write-locked.
9. `curationJobs/{jobId}` is strictly write-locked against client `create` and `update` in `firestore.rules`; only Cloud Functions (Admin SDK) can create or advance curation job state.
10. Per-user 1-at-a-time curation concurrency is enforced uniformly (including Admin) via server-owned `curationLocks/{userId}` (`allow get: if isOwner(userId) || isAdmin(); allow list, write: if false;`) with automatic stale-lock recovery, auto-refund, and idempotent sunk-cost failure audit receipts written exclusively via Admin SDK to `adminLedger/system/curationFailures/{eventId}` (`allow read: if isAdmin(); allow write: if false;`).
11. All backend mutation/proxy endpoints require verified Firebase Auth (`requireAuthenticatedCaller` on `healOrphanedAsset` and `simulateStripeTopUpCallable`; Firebase Bearer ID token verification on `server.js` `POST /api/artist/scrape-video-id`), and `adminGrantTokens` is strictly gated on `caller.isAdmin` (`ADMIN_UID + ADMIN_EMAIL + email_verified === true`).
12. Firebase App Check (`ReCaptchaEnterpriseProvider`) is initialized on the client via `VITE_RECAPTCHA_SITE_KEY` and wired across all 9 `onCall` Cloud Functions via `ENFORCE_APP_CHECK` (Monitor Mode default `false` prior to enforcement cutover). Simulated top-ups are controlled by a single server env kill-switch (`ALLOW_SIMULATED_TOPUP === "true"`).
13. Self-serve account deletion flows exclusively through the server-side `deleteUserAccount` Cloud Function (`users/{userId}` `allow delete: if isAdmin();` in `firestore.rules`), enforcing `auth_time <= 300s`, blocking deletion during active curation locks, performing complete chunked GDPR Art. 17 erasure across all user collections and Firebase Auth, scrubbing PII from `curationFailures`, and preserving one zero-PII aggregate financial summary in `adminLedger/system/deletedAccountTelemetry/{archiveId}` (`allow read: if isAdmin(); allow write: if false;`).

## The "Dirty Dozen" Payloads

### 1. Identity Spoofing (User Profile)
**Attempt**: Create a user profile with a different `userId`.
**Payload**: `setDoc(doc(db, 'users', 'victim_uid'), { email: 'attacker@gmail.com', ... })`
**Expectation**: PERMISSION_DENIED (isOwner check fails).

### 2. Privilege Escalation (Shadow Admin)
**Attempt**: Inject an `isAdmin` field into the user document.
**Payload**: `updateDoc(doc(db, 'users', 'my_uid'), { isAdmin: true })`
**Expectation**: PERMISSION_DENIED (affectedKeys().hasOnly gate).

### 3. Orphaned Stack (ID Poisoning)
**Attempt**: Create a stack item with a 2MB string as ID.
**Payload**: `setDoc(doc(db, 'users/my_uid/stack', 'very_long_string...'), { ... })`
**Expectation**: PERMISSION_DENIED (isValidId size check).

### 4. Cross-User Data Access (Stack Leak)
**Attempt**: List another user's stack.
**Payload**: `getDocs(collection(db, 'users/victim_uid/stack'))`
**Expectation**: PERMISSION_DENIED (isOwner check).

### 5. Timestamp Manipulation (Time Travel)
**Attempt**: Set `createdAt` to a date in the past during creation.
**Payload**: `addDoc(collection(db, 'sharedZcenes'), { createdAt: new Date('2000-01-01'), ... })`
**Expectation**: PERMISSION_DENIED (createdAt == request.time).

### 6. Resource Exhaustion (Denial of Wallet)
**Attempt**: Create a `SharedZcene` with a massive `graphData` string (e.g., 5MB).
**Payload**: `addDoc(collection(db, 'sharedZcenes'), { graphData: 'A'.repeat(5000000), ... })`
**Expectation**: PERMISSION_DENIED (size check in isValidSharedZcene).

### 7. State Shortcutting (Project Tampering)
**Attempt**: Update a project's `createdAt` field.
**Payload**: `updateDoc(doc(db, 'projects', 'pid'), { createdAt: request.time })`
**Expectation**: PERMISSION_DENIED (affectedKeys() only allows 'name', 'seedArtists', etc.).

### 8. PII Blanket Read (User Discovery)
**Attempt**: Query all users to find their emails.
**Payload**: `query(collection(db, 'users'))`
**Expectation**: PERMISSION_DENIED (no list rule for /users).

### 9. Query Trust Attack (Shared Zcene Scraping)
**Attempt**: List all `sharedZcenes`.
**Payload**: `getDocs(collection(db, 'sharedZcenes'))`
**Expectation**: PERMISSION_DENIED (allow list requires resource.data.authorId == auth.uid).

### 10. Immutable Field Breach (Author Change)
**Attempt**: Change the `authorId` of a `SharedZcene`.
**Payload**: `updateDoc(doc(db, 'sharedZcenes', 'sid'), { authorId: 'new_uid' })`
**Expectation**: PERMISSION_DENIED (no update rule for sharedZcenes).

### 11. Type Confusion (Stack Poisoning)
**Attempt**: Set `dateSaved` to a boolean.
**Payload**: `addDoc(collection(db, 'stack'), { dateSaved: true, ... })`
**Expectation**: PERMISSION_DENIED (isValidStackItem type check).

### 12. Ghost Field Injection (User Profile)
**Attempt**: Add a `lastLoginIp` field to the user document.
**Payload**: `updateDoc(doc(db, 'users', 'my_uid'), { lastLoginIp: '1.2.3.4' })`
**Expectation**: PERMISSION_DENIED (affectedKeys().hasOnly gate).

### 13. Client-Side Wallet Forgery (Token Balance Mutation)
**Attempt**: Client attempts to directly increment `tokenBalance` or inject a fabricated `tokenTransactions` receipt.
**Payload**: `updateDoc(doc(db, 'users', 'my_uid'), { tokenBalance: 9999 })` or `setDoc(doc(db, 'users/my_uid/tokenTransactions', 'fake_tx'), { tokens: 50, type: 'top_up' })`
**Expectation**: PERMISSION_DENIED (write-locked in `firestore.rules`; only Admin SDK / Cloud Functions can mutate wallet balances and mint transaction receipts).

### 14. Hard Project Document Deletion Bypass (2-Stage Trash Bypass)
**Attempt**: Client calls `deleteDoc` directly on an owned project workspace to circumvent the 2-Stage Trash compaction protocol.
**Payload**: `deleteDoc(doc(db, 'users/my_uid/projects', 'pid'))`
**Expectation**: PERMISSION_DENIED (hard deletions are write-locked in `firestore.rules`; projects must transition through `status: 'trashed'` with `purgeAt: trashedAt + 30d` and compacted `status: 'deleted'`).

### 15. Settlement Cost Inflation Hijack (Telemetry Dual-Write Injection)
**Attempt**: Client attempts to update pre-flight transaction receipts or mutate `apiUsage` / `costUsd` telemetry.
**Payload**: `updateDoc(doc(db, 'users/my_uid/tokenTransactions', 'preflight_tx'), { costUsd: 1.50 })`
**Expectation**: PERMISSION_DENIED (token transaction documents are immutable and write-locked; Cloud Functions strictly isolate dual-writes to settlement types `['spend_live_synthesis', 'spend_direct_hit']`).

### 16. Forged Curation Job / Concurrency Lock Bypass
**Attempt**: Client attempts to directly write a fake `curationJobs/{jobId}` or delete/overwrite `curationLocks/{uid}` to bypass token settlement or run parallel curations.
**Payload**: `setDoc(doc(db, 'curationJobs', 'fake_job'), { status: 'pending' })` or `deleteDoc(doc(db, 'curationLocks', 'my_uid'))`
**Expectation**: PERMISSION_DENIED (`curationJobs` create/update and `curationLocks` list/write are strictly `if false` in `firestore.rules`).

### 17. Unauthenticated Global Asset Mutation or Proxy Scraping
**Attempt**: Unauthenticated caller attempts to update `/artists/{cacheKey}` / `/labels/{cacheKey}` or invoke `healOrphanedAsset` / `POST /api/artist/scrape-video-id`.
**Payload**: `updateDoc(doc(db, 'artists', 'fugazi-us'), { summary: 'spam' })` or unauthenticated `POST /api/artist/scrape-video-id`
**Expectation**: PERMISSION_DENIED / `401 Unauthorized` (parenthesized `isSignedIn() && (...)` precedence in `firestore.rules`; `requireAuthenticatedCaller` in Cloud Functions; `verifyIdToken` in `server.js`).

### 18. Non-Admin Support Credit Abuse or Disabled Simulation Top-Up
**Attempt**: Standard user invokes `adminGrantTokens`, or any user invokes `simulateStripeTopUpCallable` after `ALLOW_SIMULATED_TOPUP` is disabled for live Stripe launch.
**Payload**: `adminGrantTokens({ email: 'me@example.com', amount: 500 })` or `simulateStripeTopUpCallable({ quantity: 50, waiverAccepted: true })` with `ALLOW_SIMULATED_TOPUP !== "true"`
**Expectation**: `permission-denied` (`adminGrantTokens` strictly checks `caller.isAdmin`; `simulateStripeTopUpCallable` strictly checks `process.env.ALLOW_SIMULATED_TOPUP === "true"`).

### 19. Client-Side Account Deletion / Anonymised Ledger Tamper Bypass
**Attempt**: Authenticated user attempts direct `deleteDoc(doc(db, 'users', myUid))` to bypass server-side erasure & P&L archival, or attempts to write/read `adminLedger/system/deletedAccountTelemetry/{archiveId}`.
**Payload**: `deleteDoc(doc(db, 'users', 'my_uid'))` or `setDoc(doc(db, 'adminLedger/system/deletedAccountTelemetry', 'fake'), { totalAiCostUsd: 0 })`
**Expectation**: PERMISSION_DENIED (`users/{userId}` `allow delete` is Admin-only; `deletedAccountTelemetry` is Admin-read, server-write-only).
