import React, { useState, useEffect } from 'react';
import { api } from '../api/client.js';
import { useVault } from '../store/vault.jsx';
import { derivePassphraseKey } from '../crypto/passphrase.js';
import { enrollPasskey } from '../crypto/prf.js';
import { wrapMEK } from '../crypto/mek.js';

export function Settings({ onBack }) {
  const { mek } = useVault();
  const [keys, setKeys] = useState([]);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');

  // Passphrase form
  const [newPassphrase, setNewPassphrase] = useState('');

  // Passkey form
  const [passkeyLabel, setPasskeyLabel] = useState('');

  const loadKeys = async () => {
    try {
      const fetched = await api.getKeys();
      setKeys(fetched);
    } catch (err) {
      setError(err.message);
    }
  };

  useEffect(() => {
    loadKeys();
  }, []);

  const handleAddPasskey = async (e) => {
    e.preventDefault();
    try {
      setError('');
      setMessage('');
      const label = passkeyLabel || 'New Passkey Device';
      const { credential, unwrappingKey } = await enrollPasskey(label);

      const wrappedMEK = await wrapMEK(mek, unwrappingKey);

      await api.addKey({
        type: 'prf',
        credentialId: btoa(String.fromCharCode(...new Uint8Array(credential.rawId))),
        label,
        wrappedMEK,
        iv: btoa(String.fromCharCode(...crypto.getRandomValues(new Uint8Array(12))))
      });

      setMessage('Passkey enrolled successfully');
      setPasskeyLabel('');
      await loadKeys();
    } catch (err) {
      setError(err.message);
    }
  };

  const handleAddPassphrase = async (e) => {
    e.preventDefault();
    try {
      setError('');
      setMessage('');

      const { unwrappingKey, salt } = await derivePassphraseKey(newPassphrase);
      const wrappedMEK = await wrapMEK(mek, unwrappingKey);

      await api.addKey({
        type: 'passphrase',
        label: 'Additional Passphrase',
        wrappedMEK,
        iv: btoa(String.fromCharCode(...crypto.getRandomValues(new Uint8Array(12)))),
        salt
      });

      setMessage('Passphrase added successfully');
      setNewPassphrase('');
      await loadKeys();
    } catch (err) {
      setError(err.message);
    }
  };

  const handleRevokeKey = async (id) => {
    try {
      setError('');
      setMessage('');
      await api.removeKey(id);
      setMessage('Key revoked');
      await loadKeys();
    } catch (err) {
      setError(err.message);
    }
  };

  return (
    <div style={{ maxWidth: 600, margin: '2rem auto', padding: '1rem', border: '1px solid #ccc' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
        <h2>Settings & Access</h2>
        <button onClick={onBack}>Back to Vault</button>
      </div>

      {error && <p style={{ color: 'red' }}>{error}</p>}
      {message && <p style={{ color: 'green' }}>{message}</p>}

      <h3>Current Access Keys</h3>
      <ul style={{ listStyle: 'none', padding: 0 }}>
        {keys.map(k => (
          <li key={k.id} style={{ display: 'flex', justifyContent: 'space-between', padding: '0.5rem', borderBottom: '1px solid #eee' }}>
            <div>
              <strong>{k.label}</strong> <span style={{ fontSize: '0.8em', color: '#666' }}>({k.type})</span>
            </div>
            {keys.length > 1 && (
              <button onClick={() => handleRevokeKey(k.id)} style={{ color: 'red' }}>Revoke</button>
            )}
          </li>
        ))}
      </ul>

      <hr style={{ margin: '2rem 0' }} />

      <h3>Add New Device (Passkey)</h3>
      <p style={{ fontSize: '0.9em' }}>Enrolls the current device using WebAuthn/biometrics.</p>
      <form onSubmit={handleAddPasskey} style={{ display: 'flex', gap: '0.5rem', marginBottom: '2rem' }}>
        <input
          type="text"
          placeholder="Device Label (e.g. My Phone)"
          value={passkeyLabel}
          onChange={e => setPasskeyLabel(e.target.value)}
          required
          style={{ flex: 1, padding: '0.5rem' }}
        />
        <button type="submit" style={{ padding: '0.5rem' }}>Enroll Device</button>
      </form>

      <h3>Add Shared Passphrase</h3>
      <p style={{ fontSize: '0.9em' }}>Add another passphrase to allow another user (or yourself on another browser) to unlock the vault.</p>
      <form onSubmit={handleAddPassphrase} style={{ display: 'flex', gap: '0.5rem' }}>
        <input
          type="password"
          placeholder="New Passphrase"
          value={newPassphrase}
          onChange={e => setNewPassphrase(e.target.value)}
          required
          style={{ flex: 1, padding: '0.5rem' }}
        />
        <button type="submit" style={{ padding: '0.5rem' }}>Add Passphrase</button>
      </form>
    </div>
  );
}
