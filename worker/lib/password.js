const ITERATIONS = 100_000;
const HASH_LENGTH = 32;
const ALGORITHM = 'SHA-256';

export async function hashPassword(password) {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const keyMaterial = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(password),
    'PBKDF2',
    false,
    ['deriveBits']
  );
  const hashBuffer = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', salt, iterations: ITERATIONS, hash: ALGORITHM },
    keyMaterial,
    HASH_LENGTH * 8
  );
  const hashArray = new Uint8Array(hashBuffer);
  const saltHex = bufToHex(salt);
  const hashHex = bufToHex(hashArray);
  return `pbkdf2:${ITERATIONS}:${saltHex}:${hashHex}`;
}

// Returns { valid: bool, needsUpgrade: bool }
// needsUpgrade is true when the stored password is legacy plaintext and the
// password matched — the caller should hash and re-save it immediately.
export async function verifyPasswordWithMigration(password, stored) {
  if (!stored) return { valid: false, needsUpgrade: false };
  if (!stored.startsWith('pbkdf2:')) {
    // Legacy plaintext — constant-time compare to prevent timing attacks
    const valid = timingSafeEqual(password, stored);
    return { valid, needsUpgrade: valid };
  }
  const valid = await verifyPassword(password, stored);
  return { valid, needsUpgrade: false };
}

export async function verifyPassword(password, stored) {
  if (!stored || !stored.startsWith('pbkdf2:')) return false;
  const [, iterStr, saltHex, expectedHashHex] = stored.split(':');
  const iterations = parseInt(iterStr, 10);
  const salt = hexToBuf(saltHex);
  const keyMaterial = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(password),
    'PBKDF2',
    false,
    ['deriveBits']
  );
  const hashBuffer = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', salt, iterations, hash: ALGORITHM },
    keyMaterial,
    HASH_LENGTH * 8
  );
  const hashHex = bufToHex(new Uint8Array(hashBuffer));
  return timingSafeEqual(hashHex, expectedHashHex);
}

const byteToHex = [];
for (let i = 0; i < 256; i++) {
  byteToHex[i] = i.toString(16).padStart(2, '0');
}

function bufToHex(buf) {
  let hex = '';
  for (let i = 0; i < buf.length; i++) {
    hex += byteToHex[buf[i]];
  }
  return hex;
}

function hexToBuf(hex) {
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < bytes.length; i++) {
    bytes[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  }
  return bytes;
}

// Constant-time string comparison to prevent timing attacks
function timingSafeEqual(a, b) {
  const aLen = a.length;
  const bLen = b.length;

  if (aLen === 0) {
    return bLen === 0;
  }

  const diffLength = aLen ^ bLen;
  let diff = diffLength;

  const b_safe = (diffLength === 0) ? b : a;

  for (let i = 0; i < aLen; i++) {
    diff |= a.charCodeAt(i) ^ b_safe.charCodeAt(i);
  }

  return diff === 0;
}
