import { hashPassword } from './password.js';

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
      const hashed = await Promise.all(initialUsers.map(async u => ({
        id: crypto.randomUUID(),
        email: u.email,
        password: await hashPassword(u.password),
        passkeys: []
      })));
      await saveUsers(KV, hashed);
    } catch (err) {
      console.error("Failed to parse INITIAL_USERS", err);
    }
  }
}
