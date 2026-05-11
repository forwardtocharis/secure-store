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
