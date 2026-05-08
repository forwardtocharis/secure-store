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
  console.log("PRF Enrollment Extension Results:", JSON.stringify(extensionResults, null, 2));
  const prfOutput = extensionResults?.prf?.results?.first;
  
  if (!prfOutput) {
    console.error("PRF Enrollment Failed:", extensionResults);
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
  console.log("Full WebAuthn Extension Results:", JSON.stringify(extensionResults, null, 2));
  
  const prfOutput = extensionResults?.prf?.results?.first;

  if (!prfOutput) {
    const isEnabled = extensionResults?.prf?.enabled;
    console.error("PRF Authentication Failed. Extension Data:", {
      prfSupportedByBrowser: !!navigator.credentials.getExtensions?.().prf,
      prfEnabledInResult: isEnabled,
      hasResults: !!extensionResults?.prf?.results,
      hostname: location.hostname
    });
    
    if (isEnabled === false) {
      throw new Error("PRF extension was explicitly disabled by the authenticator. This usually means the passkey was registered on a different domain or without PRF support.");
    }
    
    throw new Error("PRF output missing. If you just updated the app, you may need to re-enroll your passkey in Settings to enable the PRF extension for this specific domain.");
  }

  const unwrappingKey = await derivePRFKey(prfOutput);
  return { assertion, unwrappingKey };
}

async function getChecksum(buffer) {
  const hash = await crypto.subtle.digest("SHA-256", buffer);
  return Array.from(new Uint8Array(hash)).map(b => b.toString(16).padStart(2, '0')).join('').slice(0, 8);
}

export async function derivePRFKey(prfOutput) {
  const checksum = await getChecksum(prfOutput);
  console.log(`Deriving key from PRF output (len: ${prfOutput.byteLength}, checksum: ${checksum})`);
  const raw = await crypto.subtle.importKey("raw", prfOutput, "HKDF", false, ["deriveKey"]);
  return crypto.subtle.deriveKey(
    { name: "HKDF", hash: "SHA-256", salt: PRF_SALT, info: new TextEncoder().encode("mek-wrapping-v1") },
    raw,
    { name: "AES-KW", length: 256 },
    false,
    ["wrapKey", "unwrapKey"]
  );
}
