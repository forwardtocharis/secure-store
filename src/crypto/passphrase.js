import argon2 from "argon2-browser";
import { base64Encode, base64Decode } from "./util.js";

export async function derivePassphraseKey(passphrase, saltB64) {
  const salt = saltB64 ? base64Decode(saltB64) : crypto.getRandomValues(new Uint8Array(16));
  const result = await argon2.hash({
    pass: passphrase,
    salt,
    type: argon2.ArgonType.Argon2id,
    mem: 65536,   // 64MB
    time: 3,
    parallelism: 4,
    hashLen: 32,
  });

  const unwrappingKey = await crypto.subtle.importKey(
    "raw", result.hash,
    { name: "AES-KW" },
    false,
    ["wrapKey", "unwrapKey"]
  );

  return { unwrappingKey, salt: base64Encode(salt) };
}
