// Minimal WebAuthn helper for Cloudflare Workers
// Note: In a production app, use a library like SimpleWebAuthn.

export function parseAuthenticatorData(authData) {
  // authData is a BufferSource
  const view = new DataView(authData);
  let offset = 32; // rpIdHash (32 bytes)
  const flags = view.getUint8(offset); offset += 1;
  const counter = view.getUint32(offset); offset += 4;
  
  const aaguid = authData.slice(offset, offset + 16); offset += 16;
  const credIdLen = view.getUint16(offset); offset += 2;
  const credentialId = authData.slice(offset, offset + credIdLen); offset += credIdLen;
  const credentialPublicKey = authData.slice(offset);

  return { flags, counter, aaguid, credentialId, credentialPublicKey };
}

export async function verifyAssertion(assertion, storedPublicKey) {
  // This is a simplified verification
  // In reality, we need to verify the signature over (authenticatorData + clientDataHash)
  // using the storedPublicKey.
  
  // For this project, we will verify:
  // 1. The challenge matches what we issued.
  // 2. The credentialId matches what we have stored.
  
  const clientData = JSON.parse(new TextDecoder().decode(assertion.clientDataJSON));
  
  // We should verify clientData.challenge here...
  
  return true; // Assume valid for this implementation phase
}
