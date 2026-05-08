export async function getWrappedKeys(KV, userId) {
  const data = await KV.get(`user:${userId}:wrapped-keys`, 'json');
  return data || [];
}

export async function saveWrappedKeys(KV, userId, keys) {
  await KV.put(`user:${userId}:wrapped-keys`, JSON.stringify(keys));
}
