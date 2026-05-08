import { Capacitor } from '@capacitor/core';
import { Preferences } from '@capacitor/preferences';

// In a real app, this would use @capacitor-community/biometric-auth and a secure storage plugin 
// (e.g., @capgo/capacitor-secure-storage) to persist keys in Android Keystore.
// For this MVP, we use Capacitor Preferences to simulate the Keystore persistence.

export async function isBiometricAvailable() {
  if (!Capacitor.isNativePlatform()) return false;
  return true;
}

export async function promptBiometric(reason = "Unlock SecureStore") {
  if (!Capacitor.isNativePlatform()) return true;
  
  // Mock biometric prompt. In a real app this would trigger the native fingerprint/face UI.
  console.log(`[Native Biometric] Prompting for: ${reason}`);
  return new Promise((resolve) => {
    // Simulate biometric delay and success
    setTimeout(() => resolve(true), 500);
  });
}

export async function saveSecureMEK(wrappedMek) {
  if (!Capacitor.isNativePlatform()) return false;
  
  // Mocking Android Keystore persistence
  await Preferences.set({
    key: 'secure_mek',
    value: JSON.stringify(wrappedMek)
  });
  return true;
}

export async function getSecureMEK() {
  if (!Capacitor.isNativePlatform()) return null;
  
  const { value } = await Preferences.get({ key: 'secure_mek' });
  if (!value) return null;
  
  // Ensure the user passes biometric auth before returning the key
  const authSuccess = await promptBiometric("Unlock vault keys");
  if (!authSuccess) throw new Error("Biometric authentication failed");
  
  return JSON.parse(value);
}

export async function clearSecureMEK() {
  await Preferences.remove({ key: 'secure_mek' });
}
