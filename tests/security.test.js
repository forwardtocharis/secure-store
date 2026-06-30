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

test('auth login route fails when JWT_SECRET is missing', async () => {
  const route = auth.routes.find(r => r.path === '/login' && r.method === 'POST');
  const handler = route.handler;

  const mockUsers = [{
    id: 'user-id',
    email: 'test@example.com',
    // Mock valid password, using pbkdf2 prefix for password verification test
    password: 'pbkdf2:100000:00000000000000000000000000000000:0000000000000000000000000000000000000000000000000000000000000000'
  }];

  const c = {
    req: {
      json: async () => ({ email: 'test@example.com', password: 'password123' })
    },
    res: { status: 200 },
    env: {
        KV: {
            get: async (key) => {
                if (key === 'vault:users') return JSON.stringify(mockUsers);
                return null;
            },
            put: async () => {},
            delete: async () => {}
        }
    },
    json: (data, status) => {
        c.res.status = status || 200;
        return { status: c.res.status, body: data };
    }
  };

  // A valid pbkdf2 hash for 'password123' to pass the password verification step
  // and reach the JWT generation step where the error is thrown.
  const hashedPassword = 'pbkdf2:100000:5e09614a43bb7530f14950bdb09b7f2a:3aff6f24e4ee4053e2b06a4fe599b34fa0e3088c1c202efe545fe129b476eeed';

  // Re-define mock KV get to use the dynamically hashed password
  c.env.KV.get = async (key, type) => {
    if (key === 'vault:users') {
      const data = [{
        id: 'user-id',
        email: 'test@example.com',
        password: hashedPassword
      }];
      return type === 'json' ? data : JSON.stringify(data);
    }
    return null;
  };

  const res = await handler(c);
  assert.strictEqual(res.status, 500);
  assert.strictEqual(res.body.error, 'Internal server error: missing JWT secret');
});

test('verifySession rejects token not signed with HS256 algorithm', async () => {
  const { SignJWT } = await import('jose');
  const encoder = new TextEncoder();

  // Create a symmetric key for HS512 (to simulate an attack where a different algorithm is used)
  const secret = encoder.encode('my-super-secret-jwt-key-that-is-long-enough');

  // Sign with HS512 instead of HS256
  const maliciousToken = await new SignJWT({ sub: 'user-id' })
    .setProtectedHeader({ alg: 'HS512' })
    .setExpirationTime('2h')
    .sign(secret);

  const c = {
    req: {
      header: (name) => {
        if (name === 'Authorization') return `Bearer ${maliciousToken}`;
        return null;
      }
    },
    env: { JWT_SECRET: 'my-super-secret-jwt-key-that-is-long-enough' },
    json: (data, status) => {
      return { data, status, body: data };
    },
    set: () => {}
  };

  let nextCalled = false;
  const next = async () => { nextCalled = true; };

  const res = await verifySession(c, next);

  assert.strictEqual(nextCalled, false, 'next() should not be called');
  assert.strictEqual(res.status, 401);
  assert.strictEqual(res.body.error, 'Invalid or expired token');
});

test('files upload route rejects path traversal fileId', async () => {
  const filesRoute = (await import('../worker/routes/files.js')).default;
  const handler = filesRoute.routes.find(r => r.path === '/upload/:fileId' && r.method === 'PUT').handler;

  const c = {
    req: {
      param: () => ({ fileId: '../etc/passwd' })
    },
    json: (data, status) => {
      return { status, body: data };
    }
  };

  const res = await handler(c);
  assert.strictEqual(res.status, 400);
  assert.strictEqual(res.body.error, 'Invalid file ID format');
});

test('files download route rejects path traversal fileId', async () => {
  const filesRoute = (await import('../worker/routes/files.js')).default;
  const handler = filesRoute.routes.find(r => r.path === '/:fileId' && r.method === 'GET').handler;

  const c = {
    req: {
      param: () => ({ fileId: '../etc/passwd' })
    },
    json: (data, status) => {
      return { status, body: data };
    }
  };

  const res = await handler(c);
  assert.strictEqual(res.status, 400);
  assert.strictEqual(res.body.error, 'Invalid file ID format');
});
