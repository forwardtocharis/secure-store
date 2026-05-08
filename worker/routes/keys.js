import { Hono } from 'hono';
import { getWrappedKeys, saveWrappedKeys } from '../lib/kv.js';
import { verifySession } from '../middleware/session.js';

const keys = new Hono();

keys.use('*', verifySession);

// GET /api/keys returns wrapped-keys list for the authenticated user
keys.get('/', async (c) => {
  const userId = c.get('jwtPayload').sub;
  const wrappedKeys = await getWrappedKeys(c.env.KV, userId);
  return c.json(wrappedKeys);
});

// POST /api/keys Appends new wrapped key entry for the authenticated user
keys.post('/', async (c) => {
  const userId = c.get('jwtPayload').sub;
  const body = await c.req.json();
  const { type, credentialId, label, wrappedMEK, iv, salt } = body;

  if (!type || !label || !wrappedMEK || !iv) {
    return c.json({ error: 'Missing required fields' }, 400);
  }

  const newKey = {
    id: crypto.randomUUID(),
    type,
    credentialId,
    label,
    wrappedMEK,
    iv,
    salt
  };

  const wrappedKeys = await getWrappedKeys(c.env.KV, userId);
  wrappedKeys.push(newKey);
  await saveWrappedKeys(c.env.KV, userId, wrappedKeys);

  return c.json(newKey, 201);
});

// POST /api/keys/share - Allow an authorized user to "onboard" another family member
keys.post('/share', async (c) => {
  const currentUserId = c.get('jwtPayload').sub;
  const { targetEmail, type, label, wrappedMEK, iv, salt } = await c.req.json();

  if (!targetEmail || !wrappedMEK || !iv) {
    return c.json({ error: 'Missing required fields' }, 400);
  }

  // 1. Find the target user by email
  const { getUsers } = await import('../lib/users.js');
  const users = await getUsers(c.env.KV);
  const targetUser = users.find(u => u.email === targetEmail);

  if (!targetUser) {
    return c.json({ error: 'Target user not found' }, 404);
  }

  // 2. Add the key to the target user's list
  const newKey = {
    id: crypto.randomUUID(),
    type,
    label,
    wrappedMEK,
    iv,
    salt
  };

  const targetWrappedKeys = await getWrappedKeys(c.env.KV, targetUser.id);
  targetWrappedKeys.push(newKey);
  await saveWrappedKeys(c.env.KV, targetUser.id, targetWrappedKeys);

  return c.json({ success: true, targetUser: targetUser.email });
});

// DELETE /api/keys/:id
keys.delete('/:id', async (c) => {
  const userId = c.get('jwtPayload').sub;
  const id = c.req.param('id');
  const wrappedKeys = await getWrappedKeys(c.env.KV, userId);

  if (wrappedKeys.length <= 1) {
    return c.json({ error: 'Cannot delete the last key' }, 400);
  }

  const updatedKeys = wrappedKeys.filter(k => k.id !== id);
  if (updatedKeys.length === wrappedKeys.length) {
    return c.json({ error: 'Key not found' }, 404);
  }

  await saveWrappedKeys(c.env.KV, userId, updatedKeys);
  return c.json({ success: true });
});

export default keys;
