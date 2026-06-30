import { Hono } from 'hono';
import { verifySession } from '../middleware/session.js';

const files = new Hono();

files.use('*', verifySession);

// POST /api/files/upload-url
// Returns the internal proxy URL + fileId
files.post('/upload-url', async (c) => {
  const body = await c.req.json();
  const { filename, size } = body;

  if (!filename) {
    return c.json({ error: 'Missing required fields' }, 400);
  }

  const fileId = crypto.randomUUID();
  const uploadUrl = `/api/files/upload/${fileId}`;

  return c.json({ uploadUrl, fileId });
});

// PUT /api/files/upload/:fileId
// STREAMING UPLOAD: Pipes request body directly to R2
files.put('/upload/:fileId', async (c) => {
  const { fileId } = c.req.param();

  // Validate fileId is a valid UUID to prevent path traversal
  const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  if (!UUID_REGEX.test(fileId)) {
    return c.json({ error: 'Invalid file ID format' }, 400);
  }

  const r2Key = `vault/files/${fileId}`;

  if (!c.env.R2) return c.json({ error: 'R2 not configured' }, 500);

  // CRITICAL: We use c.req.raw.body which is a ReadableStream.
  try {
    const stream = c.req.raw.body;
    if (!stream) {
      return c.json({ error: 'Empty request body' }, 400);
    }

    const contentLength = c.req.header('Content-Length');
    const contentType = c.req.header('Content-Type') || 'application/octet-stream';

    await c.env.R2.put(r2Key, stream, {
      httpMetadata: { contentType },
      // Optional: R2 can use the length for validation
      ...(contentLength && { size: parseInt(contentLength) })
    });
    return c.json({ success: true });
  } catch (err) {
    console.error('Streaming upload failed:', err);
    return c.json({ error: 'Upload failed' }, 500);
  }
});

// GET /api/files/:fileId
// STREAMING DOWNLOAD: Pipes R2 stream directly to Response
files.get('/:fileId', async (c) => {
  const { fileId } = c.req.param();

  // Validate fileId is a valid UUID to prevent path traversal
  const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  if (!UUID_REGEX.test(fileId)) {
    return c.json({ error: 'Invalid file ID format' }, 400);
  }

  const r2Key = `vault/files/${fileId}`;

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
