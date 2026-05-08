import { base64urlDecode } from './util.js';

// WebAuthn PRF salts MUST be exactly 32 bytes long for maximum compatibility.
const PRF_SALT = new Uint8Array(32);
new TextEncoder().encodeInto("vault-prf-v1-fixed-salt-32-bytes", PRF_SALT);

export async function enrollPasskey(label) {
  const credential = await navigator.credentials.create({
    publicKey: {
      challenge: crypto.getRandomValues(new Uint8Array(32)),
      rp: { name: "SecureStore Vault", id: location.hostname },
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

  const extensionResults = credential.getClientExtensionResults();
  const prfOutput = extensionResults?.prf?.results?.first;
  
  if (!prfOutput) {
    console.error("PRF Enrollment Results:", extensionResults);
    throw new Error("PRF extension not supported or failed on this device. Ensure you are using a modern browser and a compatible authenticator (TouchID, FaceID, Windows Hello, or a Security Key).");
  }

  const unwrappingKey = await derivePRFKey(prfOutput);
  return { credential, unwrappingKey };
}

export async function authenticatePasskey(credentialId, fetchChallenge) {
  const challenge = await fetchChallenge();
  const assertion = await navigator.credentials.get({
    publicKey: {
      challenge,
      allowCredentials: credentialId
        ? [{ type: "public-key", id: base64urlDecode(credentialId) }]
        : [],
      userVerification: "required",
      extensions: { prf: { eval: { first: PRF_SALT } } },
    },
  });

  const extensionResults = assertion.getClientExtensionResults();
  const prfOutput = extensionResults?.prf?.results?.first;

  if (!prfOutput) {
    console.error("PRF Authentication Results:", extensionResults);
    // If the browser doesn't return PRF, it might be due to a browser bug or the authenticator losing the PRF state.
    throw new Error("PRF output missing. This can happen if the browser or authenticator does not support the PRF extension for this specific credential.");
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
