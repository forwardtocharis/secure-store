import { Hono } from 'hono';
import { verifySession } from '../middleware/session.js';

const items = new Hono();

items.use('*', verifySession);

// GET /api/items/index
items.get('/index', async (c) => {
  const index = await c.env.KV.get('vault:index', 'json');
  return c.json(index || { iv: '', ciphertext: '' });
});

// PUT /api/items/index
items.put('/index', async (c) => {
  const body = await c.req.json();
  const { iv, ciphertext } = body;
  await c.env.KV.put('vault:index', JSON.stringify({ iv, ciphertext }));
  return c.json({ success: true });
});

// GET /api/items/:id
items.get('/:id', async (c) => {
  const id = c.req.param('id');
  const item = await c.env.KV.get(`vault:item:${id}`, 'json');
  if (!item) return c.json({ error: 'Item not found' }, 404);
  return c.json(item);
});

// PUT /api/items/:id
items.put('/:id', async (c) => {
  const id = c.req.param('id');
  const body = await c.req.json();
  const { iv, ciphertext } = body;
  await c.env.KV.put(`vault:item:${id}`, JSON.stringify({ iv, ciphertext }));
  return c.json({ success: true });
});

// DELETE /api/items/:id
items.delete('/:id', async (c) => {
  const id = c.req.param('id');
  await c.env.KV.delete(`vault:item:${id}`);
  return c.json({ success: true });
});

export default items;
