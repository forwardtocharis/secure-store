import { Hono } from 'hono';
import { getWrappedKeys, saveWrappedKeys } from '../lib/kv.js';
import { verifySession } from '../middleware/session.js';

const keys = new Hono();

// GET /api/keys returns wrapped-keys list
keys.get('/', async (c) => {
  const wrappedKeys = await getWrappedKeys(c.env.KV);
  return c.json(wrappedKeys);
});

keys.use('*', verifySession);

// POST /api/keys Appends new wrapped key entry
keys.post('/', async (c) => {
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

  const wrappedKeys = await getWrappedKeys(c.env.KV);
  wrappedKeys.push(newKey);
  await saveWrappedKeys(c.env.KV, wrappedKeys);

  return c.json(newKey, 201);
});

// DELETE /api/keys/:id
keys.delete('/:id', async (c) => {
  const id = c.req.param('id');
  const wrappedKeys = await getWrappedKeys(c.env.KV);

  if (wrappedKeys.length <= 1) {
    return c.json({ error: 'Cannot delete the last key' }, 400);
  }

  const updatedKeys = wrappedKeys.filter(k => k.id !== id);
  if (updatedKeys.length === wrappedKeys.length) {
    return c.json({ error: 'Key not found' }, 404);
  }

  await saveWrappedKeys(c.env.KV, updatedKeys);
  return c.json({ success: true });
});

export default keys;
