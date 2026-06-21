import test from 'node:test';
import assert from 'node:assert';
import { VaultAPI, getApiBaseUrl, setApiBaseUrl } from '../src/api/client.js';
import { Capacitor } from '@capacitor/core';

// Mock localStorage globally
let mockStorage = {};
global.localStorage = {
  getItem: (key) => mockStorage[key] || null,
  setItem: (key, value) => { mockStorage[key] = value; },
  removeItem: (key) => { delete mockStorage[key]; }
};

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

test('getApiBaseUrl returns the expected API base URL', async () => {
  assert.strictEqual(typeof getApiBaseUrl(), 'string');
});

test('setApiBaseUrl sets URL memory and handles native localStorage correctly', async () => {
  // Clear mockStorage
  mockStorage = {};
  const originalIsNative = Capacitor.isNativePlatform;

  // Test web behavior
  Capacitor.isNativePlatform = () => false;
  setApiBaseUrl('https://web.test.local');
  assert.strictEqual(getApiBaseUrl(), 'https://web.test.local');
  assert.strictEqual(global.localStorage.getItem('vault:server'), null);

  setApiBaseUrl(null);
  assert.strictEqual(getApiBaseUrl(), '/api');
  assert.strictEqual(global.localStorage.getItem('vault:server'), null);

  // Test native behavior
  Capacitor.isNativePlatform = () => true;
  setApiBaseUrl('https://native.test.local');
  assert.strictEqual(getApiBaseUrl(), 'https://native.test.local');
  assert.strictEqual(global.localStorage.getItem('vault:server'), 'https://native.test.local');

  setApiBaseUrl(null);
  assert.strictEqual(getApiBaseUrl(), '/api');
  assert.strictEqual(global.localStorage.getItem('vault:server'), null);

  // Restore Capacitor mock
  Capacitor.isNativePlatform = originalIsNative;
});
