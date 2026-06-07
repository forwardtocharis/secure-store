import test from 'node:test';
import assert from 'node:assert';
import auth from '../worker/routes/auth.js';

test('/register-passkey returns 410 Gone (no auth required to reach 410)', async () => {
  const res = await auth.request('/register-passkey', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ credentialId: 'foo', publicKey: 'bar', label: 'baz' })
  });
  assert.strictEqual(res.status, 410);
  const body = await res.json();
  assert.match(body.error, /disabled/i);
});
