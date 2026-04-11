import React, { useState } from 'react';
import { useVault } from '../store/vault.jsx';
import { ItemEditor } from './ItemEditor.jsx';
import { Settings } from './Settings.jsx';

export function Vault() {
  const { items, logout, deleteItem } = useVault();
  const [editingItem, setEditingItem] = useState(null);
  const [isCreating, setIsCreating] = useState(false);
  const [showSettings, setShowSettings] = useState(false);

  if (showSettings) {
    return <Settings onBack={() => setShowSettings(false)} />;
  }

  if (editingItem || isCreating) {
    return (
      <ItemEditor
        item={editingItem}
        onClose={() => { setEditingItem(null); setIsCreating(false); }}
      />
    );
  }

  return (
    <div style={{ maxWidth: 600, margin: '2rem auto', padding: '1rem', border: '1px solid #ccc' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
        <h2>My Vault</h2>
        <div>
          <button onClick={() => setShowSettings(true)} style={{ marginRight: '0.5rem' }}>Settings</button>
          <button onClick={logout}>Lock</button>
        </div>
      </div>

      <button onClick={() => setIsCreating(true)} style={{ width: '100%', padding: '0.5rem', marginBottom: '1rem' }}>
        + Add New Item
      </button>

      {items.length === 0 ? (
        <p>No items in your vault yet.</p>
      ) : (
        <ul style={{ listStyle: 'none', padding: 0 }}>
          {items.map(item => (
            <li key={item.id} style={{ display: 'flex', justifyContent: 'space-between', padding: '0.5rem', borderBottom: '1px solid #eee' }}>
              <div>
                <strong>{item.name}</strong> <span style={{ fontSize: '0.8em', color: '#666' }}>({item.type})</span>
              </div>
              <div>
                <button onClick={() => setEditingItem(item)} style={{ marginRight: '0.5rem' }}>View/Edit</button>
                <button onClick={() => deleteItem(item.id)} style={{ color: 'red' }}>Delete</button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
