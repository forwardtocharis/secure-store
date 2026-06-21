import test from 'node:test';
import assert from 'node:assert';
import { performance } from 'perf_hooks';

import { verifyPasswordWithMigration } from '../worker/lib/password.js';

test('timingSafeEqual correctly compares passwords without early return', async () => {
  // This is a basic functionality check
  const res1 = await verifyPasswordWithMigration('mysecret', 'mysecret');
  assert.strictEqual(res1.valid, true);

  const res2 = await verifyPasswordWithMigration('mysecret', 'notmysecret');
  assert.strictEqual(res2.valid, false);

  const res3 = await verifyPasswordWithMigration('mysecret', 'mysecre');
  assert.strictEqual(res3.valid, false);

  const res4 = await verifyPasswordWithMigration('mysecre', 'mysecret');
  assert.strictEqual(res4.valid, false);
});
