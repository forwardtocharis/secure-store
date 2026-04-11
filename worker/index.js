import { Hono } from 'hono';
import { cors } from 'hono/cors';

import auth from './routes/auth.js';
import keys from './routes/keys.js';
import items from './routes/items.js';
import files from './routes/files.js';

const app = new Hono();

app.use('/api/*', cors());

app.route('/api/auth', auth);
app.route('/api/keys', keys);
app.route('/api/items', items);
app.route('/api/files', files);

app.get('/', (c) => c.text('Vault Worker Running'));

export default app;
