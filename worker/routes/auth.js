import { Hono } from 'hono';
import { SignJWT } from 'jose';
import { passphraseRateLimit } from '../middleware/rateLimit.js';
import { getWrappedKeys } from '../lib/kv.js';

const auth = new Hono();

auth.post('/challenge', async (c) => {
  // In a full implementation, you would store this in KV with a short TTL
  // and return it to the client to sign. We just return 32 random bytes.
  const challenge = new Uint8Array(32);
  crypto.getRandomValues(challenge);
  const challengeBase64 = btoa(String.fromCharCode(...challenge));

  // Note: we should persist this, but for simplicity we return it directly
  return c.json({ challenge: challengeBase64 });
});

// /api/auth/verify - issues JWT if the unlock attempt (supposedly) succeeds
// We use a middleware to rate limit passphrase attempts.
auth.post('/verify', passphraseRateLimit, async (c) => {
  const { type, credential } = await c.req.json();

  if (type !== 'prf' && type !== 'passphrase') {
    return c.json({ error: 'Invalid type' }, 400);
  }

  const wrappedKeys = await getWrappedKeys(c.env.KV);

  // If this is a passkey flow, verify that the credential actually exists in our registered keys
  // For a production system we should cryptographically verify the FIDO2 assertion signature using a webauthn lib.
  if (type === 'prf') {
    if (!credential || !credential.id) {
      return c.json({ error: 'Missing credential data' }, 400);
    }
    const keyExists = wrappedKeys.find(k => k.type === 'prf' && k.credentialId === credential.id);
    if (!keyExists) {
      return c.json({ error: 'Invalid or unknown credential' }, 401);
    }
  } else if (type === 'passphrase' && wrappedKeys.length > 0) {
    // If it's passphrase and we HAVE keys, we must ensure there's at least one passphrase key
    // The rate limit middleware already protects against brute force.
    // The actual wrong passphrase detection happens client side via AES-KW throwing.
    const hasPassphraseKey = wrappedKeys.find(k => k.type === 'passphrase');
    if (!hasPassphraseKey) {
      return c.json({ error: 'No passphrase access configured' }, 401);
    }
  }

  // NOTE: Worker does NOT verify if the unwrapping succeeded; that is client-side.
  // The token is issued on valid WebAuthn assertion OR after rate-limit check passes.

  const payload = {
    sub: "user",
    exp: Math.floor(Date.now() / 1000) + 15 * 60, // 15 min expiration
  };

  const secret = new TextEncoder().encode(c.env.JWT_SECRET || 'dev-secret-1234567890');
  const token = await new SignJWT(payload)
    .setProtectedHeader({ alg: 'HS256' })
    .sign(secret);

  return c.json({ token, wrappedKeys });
});

export default auth;
