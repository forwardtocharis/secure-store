import test from 'node:test';
import assert from 'node:assert';
import { generateMEK, wrapMEK, unwrapMEK } from '../src/crypto/mek.js';
import { encryptVaultItem, decryptVaultItem } from '../src/crypto/vault.js';
// import { derivePassphraseKey } from '../src/crypto/passphrase.js';
import { derivePRFKey } from '../src/crypto/prf.js';
import { base64Decode, base64urlDecode, base64urlEncode, buf2hex, serializeCredential } from '../src/crypto/util.js';

test('base64urlDecode correctly decodes base64url strings', () => {
  // Test with padding needed (e.g. "SGVsbG8" -> "SGVsbG8=")
  const helloDecoded = base64urlDecode('SGVsbG8');
  const expectedHello = new Uint8Array([72, 101, 108, 108, 111]);
  assert.deepStrictEqual(helloDecoded, expectedHello, 'Decodes "SGVsbG8" correctly');

  // Test with characters that differ from standard base64 (- and _)
  // "~~~" in base64url is "fn5-"
  const tildesDecoded = base64urlDecode('fn5-');
  const expectedTildes = new Uint8Array([126, 126, 126]);
  assert.deepStrictEqual(tildesDecoded, expectedTildes, 'Decodes "fn5-" correctly');

  // "???" in base64url is "Pz8_"
  const questionMarksDecoded = base64urlDecode('Pz8_');
  const expectedQuestionMarks = new Uint8Array([63, 63, 63]);
  assert.deepStrictEqual(questionMarksDecoded, expectedQuestionMarks, 'Decodes "Pz8_" correctly');
});

test('base64urlEncode correctly encodes ArrayBuffers', () => {
  const helloBuffer = new Uint8Array([72, 101, 108, 108, 111]).buffer;
  const helloEncoded = base64urlEncode(helloBuffer);
  assert.strictEqual(helloEncoded, 'SGVsbG8', 'Encodes "Hello" without padding');

  const tildesBuffer = new Uint8Array([126, 126, 126]).buffer;
  const tildesEncoded = base64urlEncode(tildesBuffer);
  assert.strictEqual(tildesEncoded, 'fn5-', 'Encodes with - instead of +');

  const questionMarksBuffer = new Uint8Array([63, 63, 63]).buffer;
  const questionMarksEncoded = base64urlEncode(questionMarksBuffer);
  assert.strictEqual(questionMarksEncoded, 'Pz8_', 'Encodes with _ instead of /');
});

test('buf2hex correctly converts buffers to hex strings', () => {
  const buffer = new Uint8Array([0, 15, 16, 255]).buffer;
  const hex = buf2hex(buffer);
  assert.strictEqual(hex, '000f10ff', 'Converts buffer to zero-padded hex string');
});

test('base64Decode correctly decodes base64 strings', () => {
  // "Hello" in base64 is "SGVsbG8="
  const helloDecoded = base64Decode('SGVsbG8=');
  const expectedHello = new Uint8Array([72, 101, 108, 108, 111]);
  assert.deepStrictEqual(helloDecoded, expectedHello, 'Decodes "Hello" correctly');

  // "Hello, World!" in base64 is "SGVsbG8sIFdvcmxkIQ=="
  const helloWorldDecoded = base64Decode('SGVsbG8sIFdvcmxkIQ==');
  const expectedHelloWorld = new Uint8Array([72, 101, 108, 108, 111, 44, 32, 87, 111, 114, 108, 100, 33]);
  assert.deepStrictEqual(helloWorldDecoded, expectedHelloWorld, 'Decodes "Hello, World!" correctly');

  // Empty string
  const emptyDecoded = base64Decode('');
  assert.deepStrictEqual(emptyDecoded, new Uint8Array([]), 'Decodes empty string correctly');

  // Invalid base64 string
  assert.throws(
    () => base64Decode('!@#'),
    (err) => err instanceof Error && err.name === 'InvalidCharacterError',
    'Throws error for invalid base64 string'
  );
});

test('MEK generation, wrapping and unwrapping with AES-KW', async () => {
  const mek = await generateMEK();
  assert.ok(mek, 'MEK generated');

  // Generate a random unwrapping key (AES-KW)
  const wrappingKey = await crypto.subtle.generateKey(
    { name: "AES-KW", length: 256 },
    true,
    ["wrapKey", "unwrapKey"]
  );

  const wrappedMEK = await wrapMEK(mek, wrappingKey);
  assert.strictEqual(typeof wrappedMEK, 'string', 'Wrapped MEK is a base64 string');

  const unwrappedMEK = await unwrapMEK(wrappedMEK, wrappingKey);
  assert.ok(unwrappedMEK, 'MEK unwrapped successfully');

  // Test with wrong key
  const wrongKey = await crypto.subtle.generateKey(
    { name: "AES-KW", length: 256 },
    true,
    ["wrapKey", "unwrapKey"]
  );

  await assert.rejects(
    unwrapMEK(wrappedMEK, wrongKey),
    (err) => {
      assert.ok(err instanceof DOMException, 'Should be a DOMException');
      assert.strictEqual(err.name, 'OperationError');
      return true;
    },
    'Unwrapping with wrong key should throw OperationError'
  );

  // Test with corrupted ciphertext
  const corruptedMEK = wrappedMEK.substring(0, wrappedMEK.length - 8) + 'AAAAAAAA';
  await assert.rejects(
    unwrapMEK(corruptedMEK, wrappingKey),
    (err) => {
      assert.ok(err instanceof DOMException, 'Should be a DOMException');
      assert.strictEqual(err.name, 'OperationError');
      return true;
    },
    'Unwrapping corrupted MEK should throw OperationError'
  );

  // Test with invalid base64
  await assert.rejects(
    unwrapMEK('!!!NotBase64!!!', wrappingKey),
    (err) => {
      // atob throws InvalidCharacterError in many environments
      assert.ok(err instanceof Error);
      return true;
    },
    'Unwrapping invalid base64 should throw'
  );
});

/* We skip argon2-browser because it has URL parsing issues in this node environment
test('Passphrase derivation to unwrapping key', async () => {
  const { unwrappingKey, salt } = await derivePassphraseKey('correct horse battery staple');
  assert.ok(unwrappingKey, 'Unwrapping key derived');
  assert.strictEqual(typeof salt, 'string', 'Salt returned as base64 string');
  assert.strictEqual(unwrappingKey.algorithm.name, 'AES-KW', 'Derived key is for AES-KW');

  // Derive again with the same salt should give same key (we can test it works by wrapping/unwrapping)
  const mek = await generateMEK();
  const wrapped = await wrapMEK(mek, unwrappingKey);

  const { unwrappingKey: unwrappingKey2 } = await derivePassphraseKey('correct horse battery staple', salt);
  const unwrapped = await unwrapMEK(wrapped, unwrappingKey2);
  assert.ok(unwrapped, 'Able to unwrap with re-derived key');

  const { unwrappingKey: wrongKey } = await derivePassphraseKey('wrong password', salt);
  await assert.rejects(
    unwrapMEK(wrapped, wrongKey),
    (err) => {
      assert.strictEqual(err.name, 'OperationError');
      return true;
    },
    'Wrong passphrase fails to unwrap'
  );
});
*/

test('PRF key derivation to unwrapping key', async () => {
  const prfOutput = crypto.getRandomValues(new Uint8Array(32));
  const unwrappingKey = await derivePRFKey(prfOutput);

  assert.ok(unwrappingKey, 'Unwrapping key derived from PRF output');
  assert.strictEqual(unwrappingKey.algorithm.name, 'AES-KW', 'Derived key is for AES-KW');

  const mek = await generateMEK();
  const wrapped = await wrapMEK(mek, unwrappingKey);
  const unwrapped = await unwrapMEK(wrapped, unwrappingKey);

  assert.ok(unwrapped, 'Able to unwrap with PRF-derived key');
});

test('Vault item encryption and decryption', async () => {
  const mek = await generateMEK();
  const item = {
    id: "123",
    type: "note",
    name: "Secret Note",
    fields: [
      { label: "Content", value: "This is a secret", sensitive: true }
    ]
  };

  const stored = await encryptVaultItem(mek, item);
  assert.strictEqual(typeof stored.iv, 'string', 'IV is base64 string');
  assert.strictEqual(typeof stored.ciphertext, 'string', 'Ciphertext is base64 string');

  const decrypted = await decryptVaultItem(mek, stored);
  assert.deepStrictEqual(decrypted, item, 'Decrypted item matches original');
});

test('serializeCredential correctly serializes a credential', () => {
  const cred = {
    id: "cred-123",
    type: "public-key",
    rawId: new Uint8Array([1, 2, 3, 4]).buffer,
    response: {
      clientDataJSON: new Uint8Array([5, 6, 7, 8]).buffer,
    }
  };

  const serialized = serializeCredential(cred);

  assert.strictEqual(serialized.id, "cred-123");
  assert.strictEqual(serialized.type, "public-key");
  assert.strictEqual(serialized.rawId, "AQIDBA");
  assert.strictEqual(serialized.response.clientDataJSON, "BQYHCA");
  assert.strictEqual(serialized.response.attestationObject, undefined);
  assert.strictEqual(serialized.response.authenticatorData, undefined);
  assert.strictEqual(serialized.response.signature, undefined);
  assert.strictEqual(serialized.response.userHandle, undefined);

  // With optional fields
  const credOptional = {
    ...cred,
    response: {
      ...cred.response,
      attestationObject: new Uint8Array([9, 10, 11, 12]).buffer,
      authenticatorData: new Uint8Array([13, 14, 15, 16]).buffer,
      signature: new Uint8Array([17, 18, 19, 20]).buffer,
      userHandle: new Uint8Array([21, 22, 23, 24]).buffer,
    }
  };

  const serializedOptional = serializeCredential(credOptional);

  assert.strictEqual(serializedOptional.response.attestationObject, "CQoLDA");
  assert.strictEqual(serializedOptional.response.authenticatorData, "DQ4PEA");
  assert.strictEqual(serializedOptional.response.signature, "ERITFA");
  assert.strictEqual(serializedOptional.response.userHandle, "FRYXGA");

  // With some optional fields missing
  const credSomeMissing = {
    ...cred,
    response: {
      ...cred.response,
      attestationObject: new Uint8Array([9, 10, 11, 12]).buffer,
      userHandle: new Uint8Array([21, 22, 23, 24]).buffer,
    }
  };

  const serializedSomeMissing = serializeCredential(credSomeMissing);
  assert.strictEqual(serializedSomeMissing.response.attestationObject, "CQoLDA");
  assert.strictEqual(serializedSomeMissing.response.authenticatorData, undefined);
  assert.strictEqual(serializedSomeMissing.response.signature, undefined);
  assert.strictEqual(serializedSomeMissing.response.userHandle, "FRYXGA");
});
