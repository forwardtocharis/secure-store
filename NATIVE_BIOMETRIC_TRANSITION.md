# Android Native Biometric Transition Plan

This document outlines the transition of the SecureStore Android application from a WebAuthn PRF-based decryption model to a Hardware-Backed KeyStore model (Option A). 

## 🎯 Goal
Enable seamless, hardware-secured vault unlocking on Android using biometrics, bypassing the current PRF extension limitations of the Capacitor bridge while maintaining 100% cryptographic compatibility with the Web version.

---

## 🛠 Phase 1: Diagnostic & Foundation (Native Layer)
**Goal**: Fix the `SecureStorage` plugin failure and establish a reliable link to the Android KeyStore.

- [x] **1.1 Java Error Handling**: Wrap the `saveMEK` logic in `SecureStoragePlugin.java` with specific `try/catch` blocks for each security operation.
- [x] **1.2 API 30+ Compatibility**: Review and update `setUserAuthenticationParameters` to ensure it meets Android 16's stricter biometric requirements.
- [x] **1.3 Diagnostic Logging**: Add native Android `Log.e` calls that mirror to the JavaScript console to identify the exact line of failure.

**✅ Status**: COMPLETED. Granular logging and modern biometric parameters implemented.

---

## 🔐 Phase 2: The "Seed" Flow (Initial Login)
**Goal**: Populate the KeyStore during the user's first interaction.

- [x] **2.1 Post-Login Seeding**: Update `src/components/Login.jsx` to detect a successful passphrase login on Android and trigger a `saveSecureMEK` call.
- [x] **2.2 User Consent**: Add a UI prompt: "Enable biometric unlock for this device?"
- [x] **2.3 Persistence Check**: Verify the key persists across app restarts.

**✅ Status**: COMPLETED. Consent toggle added to Settings and first-time prompt added to Vault view.

---

## ⚡ Phase 3: The "Quick Unlock" Implementation
**Goal**: Implement the primary biometric decryption flow.

- [x] **3.1 Unlock Logic Branching**: Update `src/components/Unlock.jsx` to check for a natively stored MEK before offering the Passkey/PRF option on Android.
- [x] **3.2 Auto-Prompt**: Trigger the `BiometricPrompt` automatically upon landing on the Unlock screen.
- [x] **3.3 Decryption Bridge**: Ensure the MEK retrieved from the KeyStore is correctly formatted (Base64) for use by the `subtle.crypto` decryption logic.

**✅ Status**: COMPLETED. Seamless auto-unlock flow active on Android.

---

## 🛡️ Phase 4: Security Hardening & Lifecycle
**Goal**: Ensure the implementation is robust against system changes.

- [x] **4.1 Invalidation Handling**: Implement logic to handle `KEY_INVALIDATED` errors (which occur when the user adds/removes fingerprints in Android settings).
- [x] **4.2 Secure Logout**: Ensure `clearMEK` is called when the user explicitly logs out or "locks" the vault.
- [x] **4.3 Error Recovery**: Provide a clear path back to "Passphrase Login" if biometric auth fails or the key is invalidated.

**✅ Status**: COMPLETED. Key invalidation handled gracefully; explicit logout clears the local sensitive data.

---

## 🌐 Phase 5: Verification & Parity
**Goal**: Confirm cross-platform integrity.

- [ ] **5.1 Cross-Platform Sync**: Verify that an item created on Android (unlocked via KeyStore) can be decrypted on Web (unlocked via PRF).
- [ ] **5.2 Web Regression Test**: Ensure no Android-specific logic has leaked into the Web bundle or affected its PRF flow.

**✅ Criteria for Completion**: Full interoperability confirmed between Android and Web clients.

---

## 🔑 Phase 6: Stored-Credential Sign-In (Android One-Tap Login)
**Goal**: After a one-time email+password entry, every subsequent launch on
Android is a single biometric tap.

### Design
- **Layer 1 stays email+password.** No backend changes. The Cloudflare Worker free plan dictated avoiding heavyweight WebAuthn server libraries.
- **Stored credentials are sealed in the same Android Keystore key (`KEYSTORE_ALIAS = "securestore_mek_v1"`) that already protects the MEK.** One fingerprint enrollment protects both blobs; re-enrolling fingerprints invalidates both atomically (existing `handleKeyInvalidated` behavior).
- **Two SharedPreferences keys, one Keystore key.**
  - `mek_ciphertext` / `mek_iv` — existing MEK blob.
  - `creds_ciphertext` / `creds_iv` — new credentials blob (JSON of `{email, password}`).

### Plugin surface (`SecureStoragePlugin.java`)
- `saveCredentials({ credentials: string })` — biometric-gated encrypt + persist.
- `getCredentials()` — biometric-gated decrypt, returns `{ credentials: string }` or `null`.
- `hasCredentials()` — synchronous SharedPreferences check, returns `{ enrolled: boolean }`.
- `clearCredentials()` — wipes the credentials blob (Keystore key remains).

### Client flow (`Login.jsx`)
1. Mount: check `isSecureCredentialsEnrolled()`.
2. If enrolled → render single **"Unlock with Biometric"** button.
3. If not enrolled → render the email+password form.
4. After successful first login → modal: "Remember Login on This Device?"
5. Subsequent launches → biometric (credentials) → silent server login → JWT → Unlock screen → biometric (MEK) → vault. Two biometric prompts, no typing.

### Lifecycle change (revises Phase 4.2)
- `vault.jsx` `logout()` **no longer wipes the Keystore-sealed MEK.** Auto-lock and explicit logout preserve both the MEK and credential blobs so biometric re-unlock keeps working across sessions. The previous behavior wiped biometric setup on every auto-lock, which defeated the feature's purpose. To revoke either, use the corresponding toggle in Settings.

### Disabled endpoints (related)
- The mocked `/api/auth/login-passkey` and `/api/auth/register-passkey` endpoints now return HTTP 410 Gone. They were not real WebAuthn verifiers and never produced records that could be verified (`publicKey` was always the literal string `'MOCKED_PUBLIC_KEY'`). The "Sign in with Passkey" buttons have been removed from both web and Android clients. Real WebAuthn server-side verification is deferred — out of scope for the Cloudflare free plan; the accepted threat model is documented in `DEVELOPER_GUIDE.md` §9.

**✅ Status**: COMPLETED. Single-tap biometric sign-in active on Android.
