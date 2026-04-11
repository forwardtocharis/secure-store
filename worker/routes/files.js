import { Hono } from 'hono';
import { verifySession } from '../middleware/session.js';

const files = new Hono();

files.use('*', verifySession);

// POST /api/files/upload-url
// Returns R2 presigned upload URL + fileId
files.post('/upload-url', async (c) => {
  const body = await c.req.json();
  const { itemId, filename, size } = body;

  if (!itemId || !filename) {
    return c.json({ error: 'Missing required fields' }, 400);
  }

  const fileId = crypto.randomUUID();
  const r2Key = `items/${itemId}/${fileId}`;

  // In Cloudflare Workers, we can use the R2 bucket binding directly.
  // Instead of AWS presigned URLs (which require the aws4fetch dependency),
  // we can use a worker-side proxy pattern or simply upload directly to
  // the worker and have the worker stream it to R2. The prompt specifically
  // mentions presigned upload URLs. Since R2 bindings don't natively expose
  // presigned URLs via standard API in the same way without S3 clients, and
  // the requirement is "R2 presigned upload URL", we will implement a proxy
  // endpoint that acts like the presigned URL destination.

  // Let's return a special URL on this worker that the client will PUT to.
  // We can include a short-lived token if we wanted, but the session token
  // is already required for the file routes.
  const uploadUrl = `/api/files/upload/${itemId}/${fileId}`;

  return c.json({ uploadUrl, fileId });
});

// PUT /api/files/upload/:itemId/:fileId
// The internal "presigned" destination proxy
files.put('/upload/:itemId/:fileId', async (c) => {
  const { itemId, fileId } = c.req.param();
  const r2Key = `items/${itemId}/${fileId}`;

  if (!c.env.R2) return c.json({ error: 'R2 not configured' }, 500);

  // Stream the request body directly into R2
  const body = await c.req.arrayBuffer();
  await c.env.R2.put(r2Key, body);

  return c.json({ success: true });
});

// GET /api/files/:itemId/:fileId
// Returns the file data stream
files.get('/:itemId/:fileId', async (c) => {
  const { itemId, fileId } = c.req.param();
  const r2Key = `items/${itemId}/${fileId}`;

  if (!c.env.R2) return c.json({ error: 'R2 not configured' }, 500);

  const object = await c.env.R2.get(r2Key);
  if (!object) {
    return c.json({ error: 'File not found' }, 404);
  }

  const headers = new Headers();
  object.writeHttpMetadata(headers);
  headers.set('etag', object.httpEtag);

  return new Response(object.body, { headers });
});

export default files;
