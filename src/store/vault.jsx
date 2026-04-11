import { createContext, useContext, useState, useEffect } from 'react';
import { api } from '../api/client.js';
import { decryptVaultItem, encryptVaultItem } from '../crypto/vault.js';

const VaultContext = createContext(null);

export function VaultProvider({ children }) {
  const [mek, setMek] = useState(null);
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);

  // Initialize from sessionStorage if possible
  useEffect(() => {
    const token = sessionStorage.getItem('vault:token');
    if (token) {
      api.setToken(token);
      // NOTE: MEK is intentionally not stored in sessionStorage by default
      // to force re-auth on refresh for higher security, as specified in the doc.
      // If we wanted refresh persistence, we'd store the MEK too.
    }
    setLoading(false);
  }, []);

  const login = async (newMek, token) => {
    sessionStorage.setItem('vault:token', token);
    api.setToken(token);
    setMek(newMek);
    await loadIndex(newMek);
  };

  const logout = () => {
    sessionStorage.removeItem('vault:token');
    api.setToken(null);
    setMek(null);
    setItems([]);
  };

  const loadIndex = async (currentMek = mek) => {
    try {
      const encryptedIndex = await api.getIndex();
      if (!encryptedIndex.ciphertext) {
        setItems([]);
        return;
      }
      const decrypted = await decryptVaultItem(currentMek, encryptedIndex);
      setItems(decrypted);
    } catch (err) {
      console.error("Failed to load index:", err);
    }
  };

  const saveIndex = async (newItems) => {
    // Ensure index only contains metadata (id, name, type, updatedAt)
    const indexData = newItems.map(item => ({
      id: item.id,
      name: item.name,
      type: item.type,
      updatedAt: item.updatedAt
    }));
    const encrypted = await encryptVaultItem(mek, indexData);
    await api.putIndex(encrypted.iv, encrypted.ciphertext);
    setItems(indexData);
  };

  const getItemFull = async (id) => {
    const encryptedItem = await api.getItem(id);
    return await decryptVaultItem(mek, encryptedItem);
  };

  const addItem = async (item) => {
    const encrypted = await encryptVaultItem(mek, item);
    await api.putItem(item.id, encrypted.iv, encrypted.ciphertext);

    // Update index with metadata
    const newItems = [...items, {
      id: item.id,
      name: item.name,
      type: item.type,
      updatedAt: item.updatedAt
    }];
    await saveIndex(newItems);
  };

  const updateItem = async (item) => {
    const encrypted = await encryptVaultItem(mek, item);
    await api.putItem(item.id, encrypted.iv, encrypted.ciphertext);

    const newItems = items.map(i => i.id === item.id ? {
      id: item.id,
      name: item.name,
      type: item.type,
      updatedAt: item.updatedAt
    } : i);
    await saveIndex(newItems);
  };

  const deleteItem = async (id) => {
    await api.deleteItem(id);
    const newItems = items.filter(i => i.id !== id);
    await saveIndex(newItems);
  };

  return (
    <VaultContext.Provider value={{
      mek, items, login, logout, loading, addItem, updateItem, deleteItem, refresh: loadIndex, getItemFull
    }}>
      {children}
    </VaultContext.Provider>
  );
}

export function useVault() {
  return useContext(VaultContext);
}
