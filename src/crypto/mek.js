import { base64Encode, base64Decode } from './util.js';

export async function generateMEK() {
  return crypto.subtle.generateKey(
    { name: "AES-GCM", length: 256 },
    true,
    ["encrypt", "decrypt"]
  );
}

export async function wrapMEK(mek, wrappingKey) {
  const wrapped = await crypto.subtle.wrapKey(
    "raw",
    mek,
    wrappingKey,
    { name: "AES-KW" }
  );
  return base64Encode(wrapped);
}

export async function unwrapMEK(wrappedMEKb64, unwrappingKey) {
  const wrappedBytes = base64Decode(wrappedMEKb64);
  return crypto.subtle.unwrapKey(
    "raw",
    wrappedBytes,
    unwrappingKey,
    { name: "AES-KW" },
    { name: "AES-GCM", length: 256 },
    true,
    ["encrypt", "decrypt"]
  );
  // Throws DOMException if wrong key - this is how we detect a bad passphrase
}

export async function exportMEK(mek) {
  const raw = await crypto.subtle.exportKey("raw", mek);
  return base64Encode(raw);
}

export async function importMEK(mekBase64) {
  const raw = base64Decode(mekBase64);
  return crypto.subtle.importKey(
    "raw",
    raw,
    { name: "AES-GCM", length: 256 },
    true,
    ["encrypt", "decrypt"]
  );
}
