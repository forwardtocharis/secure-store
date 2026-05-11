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
    console.log(`[BIOMETRIC] Attempting to save MEK natively. Length: ${mekBase64?.length}`);
    await SecureStorage.saveMEK({ mek: mekBase64 });
    console.log(`[BIOMETRIC] MEK saved successfully.`);
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
