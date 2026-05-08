import test from 'node:test';
import assert from 'node:assert';
import { verifySession } from '../worker/middleware/session.js';
import auth from '../worker/routes/auth.js';

test('verifySession middleware fails when JWT_SECRET is missing', async () => {
  const c = {
    req: {
      header: (name) => {
        if (name === 'Authorization') return 'Bearer some-token';
        return null;
      }
    },
    env: {}, // Missing JWT_SECRET
    json: (data, status) => {
      return { data, status, body: data };
    }
  };
  const next = () => {};

  const res = await verifySession(c, next);
  assert.strictEqual(res.status, 500);
  assert.strictEqual(res.body.error, 'Internal server error: missing JWT secret');
});

test('auth verify route fails when JWT_SECRET is missing', async () => {
  // We mock the Hono context because auth.request depends on full Hono implementation
  // which requires jose to be installed in node_modules.
  // Since we can't install jose, we test the exported app's response by mocking its internal handler call if possible,
  // or we just accept that we can't run full integration tests here.

  // However, I can test the route by finding it in the hono app
  const route = auth.routes.find(r => r.path === '/verify' && r.method === 'POST');
  const handler = route.handler;

  const c = {
    req: {
      json: async () => ({ type: 'passphrase' }),
      header: (name) => {
        if (name === 'Authorization') return 'Bearer dummy-token';
        return null;
      }
    },
    res: { status: 200 },
    env: {
        KV: {
            get: async () => null,
            put: async () => {},
            delete: async () => {}
        }
    },
    json: (data, status) => {
        c.res.status = status || 200;
        return { status: c.res.status, body: data };
    }
  };

  let res = await verifySession(c, async () => {
    return await handler(c, () => {});
  });
  assert.strictEqual(res.status, 500);
  assert.strictEqual(res.body.error, 'Internal server error: missing JWT secret');
});

test('key isolation: User A cannot see User B\'s keys', async () => {
  const keysRoute = (await import('../worker/routes/keys.js')).default;
  const handler = keysRoute.routes.find(r => r.path === '/' && r.method === 'GET').handler;

  const mockKV = {
    store: {
      'user:user-a:wrapped-keys': JSON.stringify([{ id: 'key-a' }]),
      'user:user-b:wrapped-keys': JSON.stringify([{ id: 'key-b' }]),
    },
    get: async (key, type) => {
      const val = mockKV.store[key] || null;
      if (val && type === 'json') return JSON.parse(val);
      return val;
    }
  };

  // Mock for User A
  const cA = {
    get: (key) => ({ sub: 'user-a' }),
    env: { KV: mockKV },
    json: (data) => data
  };

  const resA = await handler(cA);
  assert.strictEqual(resA[0].id, 'key-a');
  assert.strictEqual(resA.length, 1);

  // Mock for User B
  const cB = {
    get: (key) => ({ sub: 'user-b' }),
    env: { KV: mockKV },
    json: (data) => data
  };

  const resB = await handler(cB);
  assert.strictEqual(resB[0].id, 'key-b');
  assert.strictEqual(resB.length, 1);
});
