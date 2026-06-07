import { Hono } from 'hono';
import { cors } from 'hono/cors';

import auth from './routes/auth.js';
import keys from './routes/keys.js';
import items from './routes/items.js';
import files from './routes/files.js';

const app = new Hono();

const ALLOWED_ORIGINS = [
  'https://secure-store.pages.dev',
  'http://localhost:4173',
  'http://127.0.0.1:4173',
  'http://localhost',
  'https://localhost',
  'capacitor://localhost',
];

app.use('/api/*', cors({
  origin: (origin) => ALLOWED_ORIGINS.includes(origin) ? origin : null,
  allowMethods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowHeaders: ['Content-Type', 'Authorization'],
  maxAge: 600,
}));

app.route('/api/auth', auth);
app.route('/api/keys', keys);
app.route('/api/items', items);
app.route('/api/files', files);

app.get('/', (c) => c.text('Vault Worker Running'));

app.onError((err, c) => {
  console.error(err);
  return c.json({ error: 'Internal Server Error' }, 500);
});

export default app;
