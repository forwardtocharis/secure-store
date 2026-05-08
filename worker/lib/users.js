export async function getUsers(KV) {
  const data = await KV.get('vault:users', 'json');
  return data || [];
}

export async function saveUsers(KV, users) {
  await KV.put('vault:users', JSON.stringify(users));
}

export async function initializeUsers(KV, initialUsersJson) {
  const existingUsers = await getUsers(KV);
  if (existingUsers.length === 0 && initialUsersJson) {
    try {
      const initialUsers = JSON.parse(initialUsersJson);
      // In a real app, we should hash these passwords here,
      // but for initial setup simplicity we'll store them and
      // hash them on first login or keep them as is for this demo.
      // Better yet: we assume the user might change them.
      await saveUsers(KV, initialUsers.map(u => ({
        id: crypto.randomUUID(),
        email: u.email,
        password: u.password,
        passkeys: []
      })));
    } catch (err) {
      console.error("Failed to parse INITIAL_USERS", err);
    }
  }
}
