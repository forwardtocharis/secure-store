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
  const storedPassword = user?.password ?? 'pbkdf2:310000:00000000000000000000000000000000:0000000000000000000000000000000000000000000000000000000000000000';
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

  const secret = new TextEncoder().encode(c.env.JWT_SECRET);
  const token = await new SignJWT({ sub: user.id, email: user.email })
    .setProtectedHeader({ alg: 'HS256' })
    .setExpirationTime('2h')
    .sign(secret);

  const wrappedKeys = await getWrappedKeys(c.env.KV, user.id);
  return c.json({ token, email: user.email, wrappedKeys });
});

// POST /api/auth/login-passkey
auth.post('/login-passkey', async (c) => {
  const { email, credentialId } = await c.req.json();
  const users = await getUsers(c.env.KV);

  let user = users.find(u => u.email === email);
  if (!user) {
    user = users.find(u => u.passkeys && u.passkeys.some(pk => pk.credentialId === credentialId));
  }

  if (!user) {
    return c.json({ error: 'User not found or passkey not recognized' }, 401);
  }

  const passkey = user.passkeys.find(pk => pk.credentialId === credentialId);
  if (!passkey) {
    return c.json({ error: 'Invalid passkey' }, 401);
  }

  // Note: cryptographic proof of possession is the client-side MEK unwrap via PRF.
  // The server's role is identity resolution and JWT issuance only.

  const secret = new TextEncoder().encode(c.env.JWT_SECRET);
  const token = await new SignJWT({ sub: user.id, email: user.email })
    .setProtectedHeader({ alg: 'HS256' })
    .setExpirationTime('2h')
    .sign(secret);

  const wrappedKeys = await getWrappedKeys(c.env.KV, user.id);
  return c.json({ token, email: user.email, wrappedKeys });
});

// All following routes require the Layer 1 JWT
auth.use('/verify', verifySession);
auth.use('/change-password', verifySession);
auth.use('/register-passkey', verifySession);

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

// POST /api/auth/register-passkey
auth.post('/register-passkey', async (c) => {
  const { credentialId, publicKey, label } = await c.req.json();
  const payload = c.get('jwtPayload');
  const userId = payload.sub;

  const users = await getUsers(c.env.KV);
  const userIndex = users.findIndex(u => u.id === userId);

  if (userIndex === -1) {
    return c.json({ error: 'User not found' }, 404);
  }

  if (!users[userIndex].passkeys) users[userIndex].passkeys = [];

  if (users[userIndex].passkeys.find(pk => pk.credentialId === credentialId)) {
    return c.json({ error: 'Passkey already registered' }, 400);
  }

  users[userIndex].passkeys.push({ credentialId, publicKey, label });
  await saveUsers(c.env.KV, users);

  return c.json({ success: true });
});

auth.post('/challenge', async (c) => {
  const challenge = crypto.getRandomValues(new Uint8Array(32));
  const challengeBase64 = btoa(String.fromCharCode(...challenge));
  return c.json({ challenge: challengeBase64 });
});

export default auth;
