import test from 'node:test';
import assert from 'node:assert';
import { VaultAPI } from '../src/api/client.js';

// Mock fetch globally for node environment
global.fetch = async (url, options) => {
  if (url.endsWith('/auth/login')) {
    const body = JSON.parse(options.body);
    if (body.email === 'test@example.com' && body.password === 'password') {
      return {
        ok: true,
        json: async () => ({ token: 'mock-jwt' })
      };
    }
    return {
      ok: false,
      json: async () => ({ error: 'Invalid credentials' })
    };
  }

  if (url.endsWith('/items/index')) {
    const auth = options.headers['Authorization'];
    if (auth === 'Bearer mock-jwt') {
      return {
        ok: true,
        json: async () => ({ iv: 'iv', ciphertext: 'cipher' })
      };
    }
    return {
      ok: false,
      json: async () => ({ error: 'Unauthorized' })
    };
  }

  return {
    ok: false,
    json: async () => ({ error: 'Not Found' })
  };
};

test('VaultAPI login and token persistence', async () => {
  const api = new VaultAPI();
  const res = await api.login('test@example.com', 'password');
  assert.strictEqual(res.token, 'mock-jwt');
  
  api.setToken(res.token);
  assert.strictEqual(api.token, 'mock-jwt');
  assert.strictEqual(api.headers['Authorization'], 'Bearer mock-jwt');
});

test('VaultAPI handles 401 unauthorized', async () => {
  const api = new VaultAPI();
  await assert.rejects(
    api.getIndex(),
    { message: 'Unauthorized' }
  );
});

test('VaultAPI injects token into requests', async () => {
  const api = new VaultAPI('mock-jwt');
  const res = await api.getIndex();
  assert.strictEqual(res.iv, 'iv');
});
