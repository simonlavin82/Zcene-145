import { onCall, HttpsError } from "firebase-functions/v2/https";

/**
 * verifyBetaPassword
 *
 * Lightweight Firebase callable function that validates the private beta
 * access password against a secret stored in Google Cloud Secret Manager.
 *
 * The password is NEVER exposed to the frontend bundle — the client sends
 * a plaintext attempt; this function compares it server-side and returns
 * a boolean result only.
 *
 * Secret setup (one-time, before first deploy):
 *   echo -n "YOUR_BETA_PASSWORD" | gcloud secrets create BETA_WALL_PASSWORD --data-file=-
 *
 * To rotate the password:
 *   echo -n "NEW_PASSWORD" | gcloud secrets versions add BETA_WALL_PASSWORD --data-file=-
 */
export const verifyBetaPassword = onCall(
  {
    secrets: ["BETA_WALL_PASSWORD"],
    timeoutSeconds: 30,
    memory: "256MiB",
  },
  async (request) => {
    const { password } = request.data as { password?: string };

    if (!password || typeof password !== "string") {
      throw new HttpsError("invalid-argument", "Missing password in request.");
    }

    const expected = process.env.BETA_WALL_PASSWORD;

    // If the secret is not yet configured in this environment (e.g. local
    // emulator without secret manager), reject all attempts rather than
    // accidentally granting open access.
    if (!expected) {
      console.error("[verifyBetaPassword] BETA_WALL_PASSWORD secret is not set.");
      throw new HttpsError("internal", "Server configuration error.");
    }

    if (password !== expected) {
      // Intentionally vague — don't leak whether the secret exists or not.
      throw new HttpsError("unauthenticated", "Invalid password.");
    }

    return { success: true };
  }
);
