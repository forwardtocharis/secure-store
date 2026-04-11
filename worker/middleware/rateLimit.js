const PASSPHRASE_MAX_ATTEMPTS = 5;
const LOCKOUT_DURATION_MS = 15 * 60 * 1000;

export async function passphraseRateLimit(c, next) {
  const ip = c.req.header("CF-Connecting-IP") || 'local-ip';
  const key = `vault:ratelimit:${ip}`;

  // Note: in a real environment with KV, we'd do c.env.KV.get
  // Adding simple fallback so tests don't immediately crash if KV isn't mock injected
  let record = { attempts: 0 };
  if (c.env.KV) {
    const stored = await c.env.KV.get(key, "json");
    if (stored) record = stored;
  }

  if (record.lockedUntil && Date.now() < record.lockedUntil) {
    return c.json({ error: "Too many attempts. Try again later." }, 429);
  }

  await next();

  // Increment on every passphrase attempt (success resets)
  if (c.res.status === 200) {
    if (c.env.KV) await c.env.KV.delete(key);
  } else {
    record.attempts += 1;
    if (record.attempts >= PASSPHRASE_MAX_ATTEMPTS) {
      record.lockedUntil = Date.now() + LOCKOUT_DURATION_MS;
    }
    if (c.env.KV) {
      await c.env.KV.put(key, JSON.stringify(record), { expirationTtl: 3600 });
    }
  }
}
