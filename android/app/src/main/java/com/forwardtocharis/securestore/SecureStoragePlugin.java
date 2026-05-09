package com.forwardtocharis.securestore;

import android.content.Context;
import android.content.SharedPreferences;
import android.os.Build;
import android.security.keystore.KeyGenParameterSpec;
import android.security.keystore.KeyPermanentlyInvalidatedException;
import android.security.keystore.KeyProperties;
import android.util.Base64;

import androidx.annotation.NonNull;
import androidx.biometric.BiometricManager;
import androidx.biometric.BiometricPrompt;
import androidx.core.content.ContextCompat;
import androidx.fragment.app.FragmentActivity;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import java.security.KeyStore;
import java.util.concurrent.Executor;

import javax.crypto.Cipher;
import javax.crypto.KeyGenerator;
import javax.crypto.SecretKey;
import javax.crypto.spec.GCMParameterSpec;

@CapacitorPlugin(name = "SecureStorage")
public class SecureStoragePlugin extends Plugin {

    private static final String KEYSTORE_ALIAS       = "securestore_mek_v1";
    private static final String PREFS_NAME           = "securestore_native";
    private static final String PREFS_KEY_CIPHERTEXT = "mek_ciphertext";
    private static final String PREFS_KEY_IV         = "mek_iv";
    private static final String ANDROID_KEYSTORE     = "AndroidKeyStore";
    private static final int    GCM_TAG_LENGTH_BITS  = 128;

    private volatile boolean promptActive = false;
    private PluginCall savedGetCall = null;

    // -------------------------------------------------------------------------
    // Public plugin methods
    // -------------------------------------------------------------------------

    @PluginMethod()
    public void isBiometricAvailable(PluginCall call) {
        BiometricManager bm = BiometricManager.from(getContext());
        int result = bm.canAuthenticate(BiometricManager.Authenticators.BIOMETRIC_STRONG);
        JSObject ret = new JSObject();
        ret.put("available", result == BiometricManager.BIOMETRIC_SUCCESS);
        ret.put("reason", biometricStatusString(result));
        call.resolve(ret);
    }

    @PluginMethod()
    public void saveMEK(PluginCall call) {
        String mekBase64 = call.getString("mek");
        if (mekBase64 == null || mekBase64.isEmpty()) {
            call.reject("Missing mek parameter");
            return;
        }

        try {
            byte[] mekBytes = Base64.decode(mekBase64, Base64.NO_WRAP);

            ensureKeystoreKey();

            KeyStore ks = KeyStore.getInstance(ANDROID_KEYSTORE);
            ks.load(null);
            SecretKey key = (SecretKey) ks.getKey(KEYSTORE_ALIAS, null);

            Cipher cipher = Cipher.getInstance("AES/GCM/NoPadding");
            cipher.init(Cipher.ENCRYPT_MODE, key);
            byte[] iv         = cipher.getIV();
            byte[] ciphertext = cipher.doFinal(mekBytes);

            getContext()
                .getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
                .edit()
                .putString(PREFS_KEY_CIPHERTEXT, Base64.encodeToString(ciphertext, Base64.NO_WRAP))
                .putString(PREFS_KEY_IV,         Base64.encodeToString(iv,         Base64.NO_WRAP))
                .apply();

            call.resolve();
        } catch (Exception e) {
            call.reject("saveMEK failed: " + e.getMessage(), e);
        }
    }

    @PluginMethod()
    public void getMEK(PluginCall call) {
        if (promptActive) {
            call.reject("BIOMETRIC_IN_PROGRESS");
            return;
        }

        SharedPreferences prefs = getContext().getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE);
        String ciphertextB64 = prefs.getString(PREFS_KEY_CIPHERTEXT, null);
        String ivB64         = prefs.getString(PREFS_KEY_IV, null);

        if (ciphertextB64 == null || ivB64 == null) {
            // No MEK stored yet — not an error, first-run case
            call.resolve();
            return;
        }

        byte[] ciphertext = Base64.decode(ciphertextB64, Base64.NO_WRAP);
        byte[] iv         = Base64.decode(ivB64,         Base64.NO_WRAP);

        try {
            KeyStore ks = KeyStore.getInstance(ANDROID_KEYSTORE);
            ks.load(null);

            if (!ks.containsAlias(KEYSTORE_ALIAS)) {
                call.reject("KEY_NOT_FOUND");
                return;
            }

            SecretKey key = (SecretKey) ks.getKey(KEYSTORE_ALIAS, null);
            Cipher cipher = Cipher.getInstance("AES/GCM/NoPadding");
            GCMParameterSpec spec = new GCMParameterSpec(GCM_TAG_LENGTH_BITS, iv);

            // Throws KeyPermanentlyInvalidatedException if biometrics were re-enrolled
            cipher.init(Cipher.DECRYPT_MODE, key, spec);

            promptActive = true;
            call.setKeepAlive(true);
            savedGetCall = call;

            showBiometricPrompt(call, new BiometricPrompt.CryptoObject(cipher), ciphertext);

        } catch (KeyPermanentlyInvalidatedException e) {
            handleKeyInvalidated(call);
        } catch (Exception e) {
            call.reject("getMEK init failed: " + e.getMessage(), e);
        }
    }

    @PluginMethod()
    public void clearMEK(PluginCall call) {
        // Only clear the ciphertext — the Keystore key itself is not sensitive
        // and will be reused when the MEK is saved again after next passphrase unlock
        getContext()
            .getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
            .edit()
            .remove(PREFS_KEY_CIPHERTEXT)
            .remove(PREFS_KEY_IV)
            .apply();
        call.resolve();
    }

    // -------------------------------------------------------------------------
    // Private helpers
    // -------------------------------------------------------------------------

    private void showBiometricPrompt(PluginCall call,
                                     BiometricPrompt.CryptoObject cryptoObject,
                                     byte[] ciphertext) {
        getActivity().runOnUiThread(() -> {
            Executor executor = ContextCompat.getMainExecutor(getContext());

            BiometricPrompt prompt = new BiometricPrompt(
                (FragmentActivity) getActivity(),
                executor,
                new BiometricPrompt.AuthenticationCallback() {

                    @Override
                    public void onAuthenticationSucceeded(
                            @NonNull BiometricPrompt.AuthenticationResult result) {
                        promptActive = false;
                        savedGetCall = null;
                        call.setKeepAlive(false);
                        try {
                            Cipher cipher = result.getCryptoObject().getCipher();
                            byte[] plaintext = cipher.doFinal(ciphertext);
                            JSObject ret = new JSObject();
                            ret.put("mek", Base64.encodeToString(plaintext, Base64.NO_WRAP));
                            call.resolve(ret);
                        } catch (Exception e) {
                            call.reject("Decryption failed: " + e.getMessage(), e);
                        }
                    }

                    @Override
                    public void onAuthenticationError(int errorCode,
                                                      @NonNull CharSequence errString) {
                        promptActive = false;
                        savedGetCall = null;
                        call.setKeepAlive(false);
                        call.reject("BIOMETRIC_ERROR:" + errorCode + ":" + errString);
                    }

                    @Override
                    public void onAuthenticationFailed() {
                        // A single bad scan — BiometricPrompt handles retry UI automatically.
                        // Do NOT reject here; the dialog stays open until lockout or cancel.
                    }
                }
            );

            BiometricPrompt.PromptInfo promptInfo = new BiometricPrompt.PromptInfo.Builder()
                .setTitle("Unlock SecureStore")
                .setSubtitle("Authenticate to access your vault")
                .setNegativeButtonText("Use Passphrase")
                .setAllowedAuthenticators(BiometricManager.Authenticators.BIOMETRIC_STRONG)
                .build();

            prompt.authenticate(promptInfo, cryptoObject);
        });
    }

    private void ensureKeystoreKey() throws Exception {
        KeyStore ks = KeyStore.getInstance(ANDROID_KEYSTORE);
        ks.load(null);
        if (ks.containsAlias(KEYSTORE_ALIAS)) return;

        KeyGenerator kg = KeyGenerator.getInstance(
            KeyProperties.KEY_ALGORITHM_AES, ANDROID_KEYSTORE);

        KeyGenParameterSpec.Builder builder = new KeyGenParameterSpec.Builder(
                KEYSTORE_ALIAS,
                KeyProperties.PURPOSE_ENCRYPT | KeyProperties.PURPOSE_DECRYPT)
            .setBlockModes(KeyProperties.BLOCK_MODE_GCM)
            .setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE)
            .setKeySize(256)
            .setUserAuthenticationRequired(true)
            // -1 = fresh biometric required for every single use.
            // Also causes the key to be permanently invalidated if biometric
            // enrollments change — prevents an attacker from adding their fingerprint.
            .setUserAuthenticationValidityDurationSeconds(-1);

        // API 30+: explicitly restrict to strong biometric only (not device PIN fallback)
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
            builder.setUserAuthenticationParameters(0, KeyProperties.AUTH_BIOMETRIC_STRONG);
        }

        kg.init(builder.build());
        kg.generateKey();
    }

    private void handleKeyInvalidated(PluginCall call) {
        // Biometrics changed since the key was generated — the ciphertext is
        // permanently unrecoverable. Delete both so the user can re-register
        // after unlocking via passphrase.
        try {
            KeyStore ks = KeyStore.getInstance(ANDROID_KEYSTORE);
            ks.load(null);
            ks.deleteEntry(KEYSTORE_ALIAS);
        } catch (Exception ignored) {}

        getContext()
            .getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
            .edit().clear().apply();

        promptActive = false;
        savedGetCall = null;
        call.reject("KEY_INVALIDATED");
    }

    private String biometricStatusString(int status) {
        switch (status) {
            case BiometricManager.BIOMETRIC_SUCCESS:                return "available";
            case BiometricManager.BIOMETRIC_ERROR_NO_HARDWARE:     return "no_hardware";
            case BiometricManager.BIOMETRIC_ERROR_HW_UNAVAILABLE:  return "hw_unavailable";
            case BiometricManager.BIOMETRIC_ERROR_NONE_ENROLLED:   return "none_enrolled";
            default:                                                return "unknown";
        }
    }
}
