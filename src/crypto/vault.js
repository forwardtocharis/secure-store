import { base64Encode, base64Decode } from './util.js';

export async function encryptVaultItem(mek, item) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const encoded = new TextEncoder().encode(JSON.stringify(item));

  const ciphertext = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv },
    mek,
    encoded
  );

  return {
    iv: base64Encode(iv),
    ciphertext: base64Encode(ciphertext)
  };
}

export async function decryptVaultItem(mek, stored) {
  const iv = base64Decode(stored.iv);
  const ciphertext = base64Decode(stored.ciphertext);

  const decrypted = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv },
    mek,
    ciphertext
  );

  const decoded = new TextDecoder().decode(decrypted);
  return JSON.parse(decoded);
}
