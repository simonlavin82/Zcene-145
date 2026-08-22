# Firebase CLI Execution Rule

When executing Firebase commands in this workspace, ALWAYS prefix them with `npx firebase-tools`.

The global `firebase` binary is not installed or mapped in this environment, so running raw `firebase` commands (like `firebase deploy`) will fail with a `command not found` error.

**Correct Usage Examples:**
- `npx firebase-tools deploy --only functions`
- `npx firebase-tools use default`
- `npx firebase-tools emulators:start`

**INCORRECT Usage:**
- `firebase deploy --only functions`
