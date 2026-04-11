import { base64urlDecode } from './util.js';

const PRF_SALT = new TextEncoder().encode("vault-prf-v1");

export async function enrollPasskey(label) {
  const credential = await navigator.credentials.create({
    publicKey: {
      challenge: crypto.getRandomValues(new Uint8Array(32)),
      rp: { name: "Personal Vault", id: location.hostname },
      user: {
        id: crypto.getRandomValues(new Uint8Array(16)),
        name: label,
        displayName: label,
      },
      pubKeyCredParams: [{ type: "public-key", alg: -7 }],
      extensions: { prf: { eval: { first: PRF_SALT } } },
      authenticatorSelection: {
        userVerification: "required",
        residentKey: "required",
      },
    },
  });

  const prfOutput = credential.getClientExtensionResults()?.prf?.results?.first;
  if (!prfOutput) throw new Error("PRF extension not supported by this authenticator");

  const unwrappingKey = await derivePRFKey(prfOutput);
  return { credential, unwrappingKey };
}

// Assume fetchChallenge is injected or imported if doing API calls
export async function authenticatePasskey(credentialId, fetchChallenge) {
  const challenge = await fetchChallenge(); // GET /api/auth/challenge
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

  const prfOutput = assertion.getClientExtensionResults()?.prf?.results?.first;
  if (!prfOutput) throw new Error("PRF output missing");

  const unwrappingKey = await derivePRFKey(prfOutput);
  return { assertion, unwrappingKey };
}

export async function derivePRFKey(prfOutput) {
  const raw = await crypto.subtle.importKey("raw", prfOutput, "HKDF", false, ["deriveKey"]);
  return crypto.subtle.deriveKey(
    { name: "HKDF", hash: "SHA-256", salt: PRF_SALT, info: new TextEncoder().encode("mek-wrapping") },
    raw,
    { name: "AES-KW", length: 256 },
    false,
    ["wrapKey", "unwrapKey"]
  );
}
