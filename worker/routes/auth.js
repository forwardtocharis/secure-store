import { Hono } from 'hono';
import { SignJWT } from 'jose';
import { passphraseRateLimit } from '../middleware/rateLimit.js';
import { getWrappedKeys } from '../lib/kv.js';
import { getUsers, initializeUsers, saveUsers } from '../lib/users.js';
import { hashPassword, verifyPasswordWithMigration } from '../lib/password.js';
import { verifySession } from '../middleware/session.js';

const auth = new Hono();

// POST /api/auth/login - The "Gatekeeper" login (Layer 1)
auth.post('/login', async (c) => {
  const { email, password } = await c.req.json();

  // Initialize users from env secret if KV is empty
  await initializeUsers(c.env.KV, c.env.INITIAL_USERS);

  const users = await getUsers(c.env.KV);
  const user = users.find(u => u.email === email);

  // Always run verification even on no-match to prevent timing-based user enumeration
  const storedPassword = user?.password ?? 'pbkdf2:100000:00000000000000000000000000000000:0000000000000000000000000000000000000000000000000000000000000000';
  const { valid, needsUpgrade } = await verifyPasswordWithMigration(password, storedPassword);

  if (!user || !valid) {
    return c.json({ error: 'Invalid credentials' }, 401);
  }

  // One-time migration: upgrade legacy plaintext password to PBKDF2 hash on first login
  if (needsUpgrade) {
    const userIndex = users.findIndex(u => u.id === user.id);
    users[userIndex].password = await hashPassword(password);
    await saveUsers(c.env.KV, users);
  }

  if (!c.env.JWT_SECRET) {
    return c.json({ error: 'Internal server error: missing JWT secret' }, 500);
  }

  const secret = new TextEncoder().encode(c.env.JWT_SECRET);
  const token = await new SignJWT({ sub: user.id, email: user.email })
    .setProtectedHeader({ alg: 'HS256' })
    .setExpirationTime('2h')
    .sign(secret);

  const wrappedKeys = await getWrappedKeys(c.env.KV, user.id);
  return c.json({ token, email: user.email, wrappedKeys });
});

// POST /api/auth/login-passkey — disabled.
// Previously issued a JWT to anyone presenting a known credentialId without
// verifying a signature, so it was not real authentication. Re-enabling
// requires a real WebAuthn assertion verifier (e.g. @simplewebauthn/server)
// and persistent challenges; see plan in repo history.
auth.post('/login-passkey', async (c) => {
  return c.json({ error: 'Passkey login is disabled. Use email and password.' }, 410);
});

// All following routes require the Layer 1 JWT
auth.use('/verify', verifySession);
auth.use('/change-password', verifySession);

// POST /api/auth/verify - The "Unlock" authorization (Layer 2)
auth.post('/verify', passphraseRateLimit, async (c) => {
  const userId = c.get('jwtPayload').sub;
  const wrappedKeys = await getWrappedKeys(c.env.KV, userId);
  return c.json({ wrappedKeys });
});

// POST /api/auth/change-password
auth.post('/change-password', async (c) => {
  const { newPassword } = await c.req.json();
  const payload = c.get('jwtPayload');
  const userId = payload.sub;

  if (!newPassword || newPassword.length < 12) {
    return c.json({ error: 'Password must be at least 12 characters' }, 400);
  }

  const users = await getUsers(c.env.KV);
  const userIndex = users.findIndex(u => u.id === userId);

  if (userIndex === -1) {
    return c.json({ error: 'User not found' }, 404);
  }

  users[userIndex].password = await hashPassword(newPassword);
  await saveUsers(c.env.KV, users);

  return c.json({ success: true });
});

// POST /api/auth/register-passkey — disabled.
// The previous handler stored a client-supplied "publicKey" string without
// verifying any attestation, so the stored records (all "MOCKED_PUBLIC_KEY")
// were unusable for real verification. Re-enabling requires
// verifyRegistrationResponse + persistent challenges.
auth.post('/register-passkey', async (c) => {
  return c.json({ error: 'Passkey registration is disabled.' }, 410);
});

auth.post('/challenge', async (c) => {
  const challenge = crypto.getRandomValues(new Uint8Array(32));
  const challengeBase64 = btoa(String.fromCharCode(...challenge));
  return c.json({ challenge: challengeBase64 });
});

export default auth;
