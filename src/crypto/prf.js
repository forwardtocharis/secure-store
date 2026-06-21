import { Capacitor } from '@capacitor/core';
import { base64urlDecode } from './util.js';

// WebAuthn PRF salts MUST be exactly 32 bytes long for maximum compatibility.
const PRF_SALT = new Uint8Array(32);
new TextEncoder().encodeInto("vault-prf-v1-fixed-salt-32-bytes", PRF_SALT);

// In a Capacitor Android WebView, location.hostname is 'localhost', which fails
// RP ID validation. Use the actual production domain when running natively.
const RP_ID = Capacitor.isNativePlatform() ? 'secure-store.pages.dev' : (typeof location !== 'undefined' ? location.hostname : 'localhost');

export async function enrollPasskey(label) {
  const createOptions = {
    publicKey: {
      challenge: crypto.getRandomValues(new Uint8Array(32)).buffer,
      rp: { name: "SecureStore Vault", id: RP_ID },
      user: {
        id: crypto.getRandomValues(new Uint8Array(16)).buffer,
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
  };

  const abortController = new AbortController();
  createOptions.signal = abortController.signal;
  console.log("enrollPasskey: calling navigator.credentials.create(). Origin:", location.origin);
  console.log("enrollPasskey: [DEBUG] createOptions:", JSON.parse(JSON.stringify(createOptions, (k, v) => {
    if (v instanceof Uint8Array) return Array.from(v);
    if (v instanceof ArrayBuffer) return Array.from(new Uint8Array(v));
    return v;
  })));

  let credential;
  try {
    credential = await navigator.credentials.create(createOptions);
    console.log("enrollPasskey: [DEBUG] RAW credential object:", credential);
    console.log("enrollPasskey: [DEBUG] credential.constructor.name:", credential?.constructor?.name);
    console.log("enrollPasskey: [DEBUG] typeof getClientExtensionResults:", typeof credential?.getClientExtensionResults);
    if (typeof credential?.getClientExtensionResults === 'function') {
      console.log("enrollPasskey: [DEBUG] getClientExtensionResults() output:", credential.getClientExtensionResults());
    }
  } catch (err) {
    console.error("enrollPasskey: credentials.create() threw:", {
      name: err.name,
      message: err.message,
      stack: err.stack,
      err
    });
    throw err;
  }

  console.log("enrollPasskey: credential created", credential?.type, credential?.id);

  const extensionResults = typeof credential.getClientExtensionResults === 'function'
    ? credential.getClientExtensionResults()
    : (credential.clientExtensionResults ?? {});
  
  const prfOutput = extensionResults?.prf?.results?.first;
  
  console.log("enrollPasskey: PRF extension results summary:", {
    fullResults: extensionResults,
    prf: extensionResults?.prf,
    enabled: extensionResults?.prf?.enabled,
    hasOutput: !!prfOutput,
  });

  if (!prfOutput) {
    console.error("enrollPasskey: PRF output MISSING. Extension results were:", extensionResults);
    throw new Error("PRF extension not supported or failed on this device. Ensure you are using a modern browser and a compatible authenticator (TouchID, FaceID, Windows Hello, or a Security Key).");
  }

  const unwrappingKey = await derivePRFKey(prfOutput);
  return { credential, unwrappingKey };
}

export async function authenticatePasskey(credentialId, fetchChallenge) {
  console.log("Starting Passkey Authentication...", {
    credentialId, RP_ID, hostname: location.hostname,
  });

  const challenge = await fetchChallenge();
  console.log("Challenge received from server:", challenge);

  // Always send the PRF extension — browsers/authenticators that don't support
  // it will simply ignore it. Gating on getClientCapabilities() was causing it
  // to be omitted even on supporting platforms (caps.prf reflects platform
  // authenticator state, not browser extension support).
  const rawChallenge = challenge instanceof Uint8Array ? challenge.buffer : challenge;

  const options = {
    mediation: 'optional',
    publicKey: {
      challenge: rawChallenge,
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

  const abortController = new AbortController();
  options.signal = abortController.signal;

  let assertion;
  try {
    assertion = await navigator.credentials.get(options);
  } catch (err) {
    console.error("WebAuthn get() failed:", { name: err.name, message: err.message });
    throw err;
  }

  if (!assertion) {
    throw new Error("No credential returned. The passkey prompt may have been dismissed.");
  }

  console.log("Assertion received from authenticator.");

  const extensionResults = typeof assertion.getClientExtensionResults === 'function'
    ? assertion.getClientExtensionResults()
    : (assertion.clientExtensionResults ?? {});
  const prfOutput = extensionResults?.prf?.results?.first;
  console.log("PRF extension results:", { hasPrf: !!extensionResults?.prf, hasResults: !!extensionResults?.prf?.results, hasOutput: !!prfOutput });

  if (!prfOutput) {
    console.warn("PRF output missing. Proceeding with Layer 1 login only.");
    return { assertion, unwrappingKey: null };
  }

  const unwrappingKey = await derivePRFKey(prfOutput);
  return { assertion, unwrappingKey };
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
