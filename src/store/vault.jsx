import { createContext, useContext, useState, useEffect, useRef } from 'react';
import { api } from '../api/client.js';
import { decryptVaultItem, encryptVaultItem } from '../crypto/vault.js';

const VaultContext = createContext(null);

const INACTIVITY_LIMIT = 10 * 60 * 1000; // 10 minutes

export function VaultProvider({ children }) {
  const [identity, setIdentity] = useState(null); // { token, email }
  const [mek, setMek] = useState(null);
  const [items, setItems] = useState([]);
  const [wrappedKeys, setWrappedKeys] = useState(null);
  const [loading, setLoading] = useState(true);
  
  const activityTimeoutRef = useRef(null);

  // Auto-Lock Timer Logic
  const resetTimer = () => {
    if (activityTimeoutRef.current) clearTimeout(activityTimeoutRef.current);
    
    // Only set timer if the vault is unlocked (MEK is present)
    if (mek) {
      activityTimeoutRef.current = setTimeout(() => {
        console.log("Auto-locking vault due to inactivity...");
        logout();
      }, INACTIVITY_LIMIT);
    }
  };

  useEffect(() => {
    const token = sessionStorage.getItem('vault:token');
    const email = sessionStorage.getItem('vault:email');
    if (token) {
      api.setToken(token);
      setIdentity({ token, email });
    }
    setLoading(false);

    // Listen for activity
    const events = ['mousedown', 'mousemove', 'keypress', 'scroll', 'touchstart'];
    events.forEach(name => document.addEventListener(name, resetTimer));

    return () => {
      events.forEach(name => document.removeEventListener(name, resetTimer));
      if (activityTimeoutRef.current) clearTimeout(activityTimeoutRef.current);
    };
  }, [mek]); // Re-run when MEK changes to start/stop the timer

  const loginIdentity = async (token, email, autoMek = null, keys = null) => {
    sessionStorage.setItem('vault:token', token);
    sessionStorage.setItem('vault:email', email);
    api.setToken(token);
    setIdentity({ token, email });
    if (keys) setWrappedKeys(keys);
    if (autoMek) {
      await unlockVault(autoMek);
    }
  };

  const unlockVault = async (newMek) => {
    setMek(newMek);
    await loadIndex(newMek);
    resetTimer(); // Start the clock immediately on unlock
  };

  const logout = () => {
    sessionStorage.removeItem('vault:token');
    sessionStorage.removeItem('vault:email');
    api.setToken(null);
    setIdentity(null);
    setMek(null);
    setItems([]);
    if (activityTimeoutRef.current) clearTimeout(activityTimeoutRef.current);
  };

  const loadIndex = async (currentMek = mek) => {
    try {
      const encryptedIndex = await api.getIndex();
      if (!encryptedIndex || !encryptedIndex.ciphertext) {
        setItems([]);
        return;
      }
      const decrypted = await decryptVaultItem(currentMek, encryptedIndex);
      setItems(decrypted);
    } catch (err) {
      console.error("Failed to load index:", err);
      // If index fails to decrypt, the MEK might be invalid; lock it.
      if (err.name === 'OperationError') logout();
    }
  };

  const saveIndex = async (newItems) => {
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
      identity, mek, items, wrappedKeys, loginIdentity, unlockVault, logout, loading, addItem, updateItem, deleteItem, refresh: loadIndex, getItemFull
    }}>
      {children}
    </VaultContext.Provider>
  );
}

export function useVault() {
  return useContext(VaultContext);
}
