import { Capacitor, registerPlugin } from '@capacitor/core';

const SecureStorage = registerPlugin('SecureStorage');

export async function isBiometricAvailable() {
  if (!Capacitor.isNativePlatform()) return false;
  try {
    const { available } = await SecureStorage.isBiometricAvailable();
    return available === true;
  } catch {
    return false;
  }
}

export async function saveSecureMEK(mekBase64) {
  if (!Capacitor.isNativePlatform()) return false;
  try {
    await SecureStorage.saveMEK({ mek: mekBase64 });
    return true;
  } catch (err) {
    console.error(`[BIOMETRIC] Failed to save MEK natively:`, err);
    throw err;
  }
}

// Returns true if a MEK ciphertext is stored in SharedPreferences.
// Does NOT touch the KeyStore or trigger a biometric prompt.
export async function isSecureMEKEnrolled() {
  if (!Capacitor.isNativePlatform()) return false;
  try {
    const { enrolled } = await SecureStorage.hasMEK();
    return enrolled === true;
  } catch {
    return false;
  }
}

// Triggers the native BiometricPrompt. The biometric challenge and MEK
// decryption happen atomically in native code — the hardware enforces auth.
// Throws "KEY_INVALIDATED" if the user re-enrolled biometrics since last save.
// Throws "BIOMETRIC_ERROR:{code}:{msg}" if the user cancels or hardware fails.
// Returns null if no MEK has been saved yet (first-run case).
export async function getSecureMEK() {
  if (!Capacitor.isNativePlatform()) return null;
  const result = await SecureStorage.getMEK();
  return result?.mek ?? null;
}

export async function clearSecureMEK() {
  if (!Capacitor.isNativePlatform()) return;
  await SecureStorage.clearMEK();
}

// ---------------------------------------------------------------------------
// Stored login credentials (email + password) — sealed in the same Android
// Keystore key as the MEK so a single fingerprint enrollment protects both.
// Used only on Android; web returns false / null silently.
// ---------------------------------------------------------------------------

export async function saveSecureCredentials(credentialsJson) {
  if (!Capacitor.isNativePlatform()) return false;
  try {
    await SecureStorage.saveCredentials({ credentials: credentialsJson });
    return true;
  } catch (err) {
    console.error('[BIOMETRIC] Failed to save credentials natively:', err);
    throw err;
  }
}

export async function isSecureCredentialsEnrolled() {
  if (!Capacitor.isNativePlatform()) return false;
  try {
    const { enrolled } = await SecureStorage.hasCredentials();
    return enrolled === true;
  } catch {
    return false;
  }
}

// Triggers BiometricPrompt and returns the decrypted credentials JSON string.
// Returns null if nothing is stored. Throws KEY_INVALIDATED / BIOMETRIC_ERROR
// in the same pattern as getSecureMEK.
export async function getSecureCredentials() {
  if (!Capacitor.isNativePlatform()) return null;
  const result = await SecureStorage.getCredentials();
  return result?.credentials ?? null;
}

export async function clearSecureCredentials() {
  if (!Capacitor.isNativePlatform()) return;
  await SecureStorage.clearCredentials();
}
