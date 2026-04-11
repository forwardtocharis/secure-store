import React, { useState, useEffect } from 'react';
import { api } from '../api/client.js';
import { useVault } from '../store/vault.jsx';
import { authenticatePasskey } from '../crypto/prf.js';
import { derivePassphraseKey } from '../crypto/passphrase.js';
import { unwrapMEK, generateMEK, wrapMEK } from '../crypto/mek.js';

export function Unlock() {
  const [keys, setKeys] = useState([]);
  const [passphrase, setPassphrase] = useState('');
  const [error, setError] = useState('');
  const [mode, setMode] = useState('passkey'); // passkey or passphrase
  const { login } = useVault();

  useEffect(() => {
    api.getKeys().then(setKeys).catch(err => setError(err.message));
  }, []);

  const handlePasskeyUnlock = async () => {
    try {
      setError('');
      // Find a PRF key
      const prfKey = keys.find(k => k.type === 'prf');
      if (!prfKey && keys.length > 0) {
        throw new Error('No passkey enrolled on this device.');
      }

      const { assertion, unwrappingKey } = await authenticatePasskey(
        prfKey ? prfKey.credentialId : null,
        async () => {
          const res = await api.getChallenge();
          // The challenge from API is base64
          return Uint8Array.from(atob(res.challenge), c => c.charCodeAt(0));
        }
      );

      // Attempt to unwrap MEK
      if (!prfKey) throw new Error("Should not reach here without a PRF key if not setting up");
      const mek = await unwrapMEK(prfKey.wrappedMEK, unwrappingKey);

      // Verify with backend
      const { token } = await api.verifyAuth('prf', assertion);
      await login(mek, token);

    } catch (err) {
      setError(err.message);
    }
  };

  const handlePassphraseUnlock = async (e) => {
    e.preventDefault();
    try {
      setError('');
      const ppKey = keys.find(k => k.type === 'passphrase');
      if (!ppKey) {
        throw new Error('No passphrase configured.');
      }

      const { unwrappingKey } = await derivePassphraseKey(passphrase, ppKey.salt);

      let mek;
      try {
        mek = await unwrapMEK(ppKey.wrappedMEK, unwrappingKey);
      } catch (err) {
        throw new Error('Incorrect passphrase');
      }

      const { token } = await api.verifyAuth('passphrase');
      await login(mek, token);

    } catch (err) {
      setError(err.message);
    }
  };

  const handleInitialSetup = async (e) => {
    e.preventDefault();
    try {
      setError('');
      const mek = await generateMEK();
      const { unwrappingKey, salt } = await derivePassphraseKey(passphrase);
      const wrappedMEK = await wrapMEK(mek, unwrappingKey);

      // We don't have a token yet to post keys, so we need a special bootstrap,
      // but for this implementation we assume the first token is just granted
      // or we bypass the token check for the first key. Let's get a token first.
      const payload = await api.verifyAuth('passphrase');
      api.setToken(payload.token);

      await api.addKey({
        type: 'passphrase',
        label: 'Recovery Passphrase',
        wrappedMEK,
        iv: btoa(String.fromCharCode(...crypto.getRandomValues(new Uint8Array(12)))),
        salt
      });

      await login(mek, payload.token);
    } catch (err) {
      setError(err.message);
    }
  };

  if (keys.length === 0) {
    return (
      <div style={{ maxWidth: 400, margin: '2rem auto', padding: '1rem', border: '1px solid #ccc' }}>
        <h2>Initialize Vault</h2>
        <p>Set a strong recovery passphrase to initialize your secure vault.</p>
        <form onSubmit={handleInitialSetup}>
          <input
            type="password"
            placeholder="Recovery Passphrase"
            value={passphrase}
            onChange={e => setPassphrase(e.target.value)}
            required
            style={{ width: '100%', marginBottom: '1rem', padding: '0.5rem' }}
          />
          <button type="submit" style={{ width: '100%', padding: '0.5rem' }}>Create Vault</button>
        </form>
        {error && <p style={{ color: 'red' }}>{error}</p>}
      </div>
    );
  }

  return (
    <div style={{ maxWidth: 400, margin: '2rem auto', padding: '1rem', border: '1px solid #ccc' }}>
      <h2>Unlock Vault</h2>
      <div style={{ display: 'flex', marginBottom: '1rem' }}>
        <button onClick={() => setMode('passkey')} style={{ flex: 1, fontWeight: mode === 'passkey' ? 'bold' : 'normal' }}>Passkey</button>
        <button onClick={() => setMode('passphrase')} style={{ flex: 1, fontWeight: mode === 'passphrase' ? 'bold' : 'normal' }}>Passphrase</button>
      </div>

      {mode === 'passkey' ? (
        <div style={{ textAlign: 'center', padding: '2rem 0' }}>
          <button onClick={handlePasskeyUnlock} style={{ padding: '0.5rem 1rem' }}>Unlock with Passkey</button>
        </div>
      ) : (
        <form onSubmit={handlePassphraseUnlock}>
          <input
            type="password"
            placeholder="Enter Passphrase"
            value={passphrase}
            onChange={e => setPassphrase(e.target.value)}
            required
            style={{ width: '100%', marginBottom: '1rem', padding: '0.5rem', boxSizing: 'border-box' }}
          />
          <button type="submit" style={{ width: '100%', padding: '0.5rem' }}>Unlock</button>
        </form>
      )}
      {error && <p style={{ color: 'red' }}>{error}</p>}
    </div>
  );
}
