"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.verifyBetaPassword = void 0;
const https_1 = require("firebase-functions/v2/https");
const crypto = __importStar(require("crypto"));
/**
 * verifyBetaPassword
 *
 * Lightweight Firebase callable function that validates the private beta
 * access password against a secret stored in Google Cloud Secret Manager.
 *
 * The password is NEVER exposed to the frontend bundle — the client sends
 * a plaintext attempt; this function compares it server-side and returns
 * a cryptographic verification token.
 *
 * Secret setup (one-time, before first deploy):
 *   echo -n "YOUR_BETA_PASSWORD" | gcloud secrets create BETA_WALL_PASSWORD --data-file=-
 *
 * To rotate the password:
 *   echo -n "NEW_PASSWORD" | gcloud secrets versions add BETA_WALL_PASSWORD --data-file=-
 */
exports.verifyBetaPassword = (0, https_1.onCall)({
    secrets: ["BETA_WALL_PASSWORD"],
    timeoutSeconds: 30,
    memory: "512MiB",
}, async (request) => {
    const { password } = request.data;
    if (!password || typeof password !== "string") {
        throw new https_1.HttpsError("invalid-argument", "Missing password in request.");
    }
    const expected = process.env.BETA_WALL_PASSWORD;
    // If the secret is not yet configured in this environment (e.g. local
    // emulator without secret manager), reject all attempts rather than
    // accidentally granting open access.
    if (!expected) {
        console.error("[verifyBetaPassword] BETA_WALL_PASSWORD secret is not set.");
        throw new https_1.HttpsError("internal", "Server configuration error.");
    }
    if (password !== expected) {
        // Intentionally vague — don't leak whether the secret exists or not.
        throw new https_1.HttpsError("unauthenticated", "Invalid password.");
    }
    // Deterministic cryptographic HMAC verification token bound to the secret
    const token = crypto
        .createHmac("sha256", expected)
        .update("zcene_private_beta_access_authorized")
        .digest("hex");
    return { success: true, token };
});
//# sourceMappingURL=verifyBetaPassword.js.map