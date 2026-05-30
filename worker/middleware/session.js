import { jwtVerify } from 'jose';

const encoder = new TextEncoder();

export async function verifySession(c, next) {
  const authHeader = c.req.header('Authorization');
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return c.json({ error: 'Missing or invalid Authorization header' }, 401);
  }

  const token = authHeader.substring(7);

  if (!c.env.JWT_SECRET) {
    return c.json({ error: 'Internal server error: missing JWT secret' }, 500);
  }
  const secret = encoder.encode(c.env.JWT_SECRET);

  try {
    const { payload } = await jwtVerify(token, secret);
    c.set('jwtPayload', payload);
    await next();
  } catch (err) {
    return c.json({ error: 'Invalid or expired token' }, 401);
  }
}
