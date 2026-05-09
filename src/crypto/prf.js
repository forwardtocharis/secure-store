import { Capacitor } from '@capacitor/core';
import { base64urlDecode } from './util.js';

// WebAuthn PRF salts MUST be exactly 32 bytes long for maximum compatibility.
const PRF_SALT = new Uint8Array(32);
new TextEncoder().encodeInto("vault-prf-v1-fixed-salt-32-bytes", PRF_SALT);

// In a Capacitor Android WebView, location.hostname is 'localhost', which fails
// RP ID validation. Use the actual production domain when running natively.
const RP_ID = Capacitor.isNativePlatform() ? 'secure-store.pages.dev' : location.hostname;

export async function enrollPasskey(label) {
  const credential = await navigator.credentials.create({
    publicKey: {
      challenge: crypto.getRandomValues(new Uint8Array(32)),
      rp: { name: "SecureStore Vault", id: RP_ID },
      user: {
        id: crypto.getRandomValues(new Uint8Array(16)),
        name: label,
        displayName: label,
      },
      pubKeyCredParams: [{ type: "public-key", alg: -7 }, { type: "public-key", alg: -257 }],
      extensions: { prf: { eval: { first: PRF_SALT } } },
      authenticatorSelection: {
        userVerification: "required",
        residentKey: "required",
      },
    },
  });

  const extensionResults = typeof credential.getClientExtensionResults === 'function'
    ? credential.getClientExtensionResults()
    : (credential.clientExtensionResults ?? {});
  const prfOutput = extensionResults?.prf?.results?.first;
  
  if (!prfOutput) {
    console.error("PRF Enrollment Failed:", extensionResults);
    throw new Error("PRF extension not supported or failed on this device. Ensure you are using a modern browser and a compatible authenticator (TouchID, FaceID, Windows Hello, or a Security Key).");
  }

  const unwrappingKey = await derivePRFKey(prfOutput);
  return { credential, unwrappingKey };
}

export async function authenticatePasskey(credentialId, fetchChallenge) {
  const supportedExtensions = navigator.credentials.getExtensions ? navigator.credentials.getExtensions() : {};
  console.log("Starting Passkey Authentication...", { 
    credentialId, RP_ID, hostname: location.hostname,
    prfSupported: !!supportedExtensions.prf 
  });
  
  const challenge = await fetchChallenge();
  console.log("Challenge received from server:", challenge);

  const options = {
    publicKey: {
      challenge: challenge.buffer || challenge,
      rpId: RP_ID,
      userVerification: "preferred",
      timeout: 60000,
      extensions: { prf: { eval: { first: PRF_SALT } } },
    },
  };

  if (credentialId) {
    options.publicKey.allowCredentials = [{ type: "public-key", id: base64urlDecode(credentialId) }];
  }

  console.log("Requesting navigator.credentials.get with options:", JSON.parse(JSON.stringify(options, (key, value) => {
    if (value instanceof Uint8Array) return `Uint8Array(${value.length})`;
    if (value instanceof ArrayBuffer) return `ArrayBuffer(${value.byteLength})`;
    return value;
  })));
  
  try {
    const assertion = await navigator.credentials.get(options);
    console.log("Assertion received from authenticator.");
    
    const extensionResults = typeof assertion.getClientExtensionResults === 'function'
      ? assertion.getClientExtensionResults()
      : (assertion.clientExtensionResults ?? {});
    const prfOutput = extensionResults?.prf?.results?.first;

    if (!prfOutput) {
      const isEnabled = extensionResults?.prf?.enabled;
      console.error("PRF Authentication Failed. Extension Data:", {
        prfSupportedByBrowser: !!navigator.credentials.getExtensions?.().prf,
        prfEnabledInResult: isEnabled,
        hasResults: !!extensionResults?.prf?.results,
        hostname: RP_ID
      });
      
      if (isEnabled === false) {
        throw new Error("PRF extension was explicitly disabled by the authenticator. This usually means the passkey was registered on a different domain or without PRF support.");
      }
      
      throw new Error("PRF output missing. If you just updated the app, you may need to re-enroll your passkey in Settings to enable the PRF extension for this specific domain.");
    }

    const unwrappingKey = await derivePRFKey(prfOutput);
    return { assertion, unwrappingKey };
  } catch (err) {
    console.error("WebAuthn get() failed:", err);
    throw err;
  }
}

export async function derivePRFKey(prfOutput) {
  const raw = await crypto.subtle.importKey("raw", prfOutput, "HKDF", false, ["deriveKey"]);
  return crypto.subtle.deriveKey(
    { name: "HKDF", hash: "SHA-256", salt: PRF_SALT, info: new TextEncoder().encode("mek-wrapping-v1") },
    raw,
    { name: "AES-KW", length: 256 },
    false,
    ["wrapKey", "unwrapKey"]
  );
}
