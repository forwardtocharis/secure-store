import { jwtVerify } from 'jose';

export async function verifySession(c, next) {
  const authHeader = c.req.header('Authorization');
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return c.json({ error: 'Missing or invalid Authorization header' }, 401);
  }

  const token = authHeader.substring(7);
  const secret = new TextEncoder().encode(c.env.JWT_SECRET || 'dev-secret-1234567890');

  try {
    const { payload } = await jwtVerify(token, secret);
    c.set('jwtPayload', payload);
    await next();
  } catch (err) {
    return c.json({ error: 'Invalid or expired token' }, 401);
  }
}
