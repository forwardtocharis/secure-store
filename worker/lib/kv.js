export async function getWrappedKeys(KV) {
  const data = await KV.get('vault:wrapped-keys', 'json');
  return data || [];
}

export async function saveWrappedKeys(KV, keys) {
  await KV.put('vault:wrapped-keys', JSON.stringify(keys));
}
