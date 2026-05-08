import React, { useState, useEffect } from 'react';
import { api } from '../api/client.js';
import { useVault } from '../store/vault.jsx';
import { authenticatePasskey } from '../crypto/prf.js';
import { derivePassphraseKey } from '../crypto/passphrase.js';
import { unwrapMEK, generateMEK, wrapMEK } from '../crypto/mek.js';
import { encryptVaultItem } from '../crypto/vault.js';

export function Unlock() {
  const [keys, setKeys] = useState([]);
  const [passphrase, setPassphrase] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [mode, setMode] = useState('passphrase'); // passphrase, passkey, or recovery
  const { unlockVault } = useVault();

  useEffect(() => {
    api.getKeys().then(setKeys).catch(err => setError(err.message));
  }, []);

  const handlePassphraseUnlock = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    try {
      const ppKey = keys.find(k => k.type === 'passphrase');
      if (!ppKey) throw new Error('No passphrase configured.');

      const { unwrappingKey } = await derivePassphraseKey(passphrase, ppKey.salt);
      let mek;
      try {
        mek = await unwrapMEK(ppKey.wrappedMEK, unwrappingKey);
      } catch (err) {
        throw new Error('Incorrect vault passphrase');
      }

      await api.verifyAuth('passphrase');
      await unlockVault(mek);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const [recoveryInput, setRecoveryInput] = useState('');
  const handleRecoveryUnlock = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    try {
      const recKey = keys.find(k => k.type === 'recovery');
      if (!recKey) throw new Error('No recovery key registered.');

      // 1. Parse hex to bytes
      const rawKey = new Uint8Array(recoveryInput.match(/.{1,2}/g).map(byte => parseInt(byte, 16)));
      if (rawKey.length !== 32) throw new Error('Invalid recovery key length.');

      // 2. Import as AES-KW
      const unwrappingKey = await crypto.subtle.importKey(
        "raw", rawKey,
        { name: "AES-KW" },
        false,
        ["wrapKey", "unwrapKey"]
      );

      // 3. Unwrap
      const mek = await unwrapMEK(recKey.wrappedMEK, unwrappingKey);

      await api.verifyAuth('passphrase'); // We use passphrase type for simplicity
      await unlockVault(mek);
    } catch (err) {
      setError('Recovery failed: ' + err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleInitializeVault = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    try {
      // 1. Generate new Master Encryption Key (MEK)
      const newMek = await generateMEK();

      // 2. Derive wrapping key from the passphrase
      const { unwrappingKey, salt } = await derivePassphraseKey(passphrase);

      // 3. Wrap MEK
      const wrappedMEK = await wrapMEK(newMek, unwrappingKey);

      // 4. Save to server as the first key
      await api.addKey({
        type: 'passphrase',
        label: 'Primary Passphrase',
        wrappedMEK,
        iv: btoa(String.fromCharCode(...crypto.getRandomValues(new Uint8Array(12)))),
        salt
      });

      // 5. Initialize vault index (empty)
      const encryptedIndex = await encryptVaultItem(newMek, []);
      await api.putIndex(encryptedIndex.iv, encryptedIndex.ciphertext);

      // 6. Unlock
      await unlockVault(newMek);
    } catch (err) {
      setError('Initialization failed: ' + err.message);
    } finally {
      setLoading(false);
    }
  };

  const handlePasskeyUnlock = async () => {
    setLoading(true);
    setError('');
    try {
      const prfKey = keys.find(k => k.type === 'prf');
      if (!prfKey) throw new Error('No passkey enrolled.');

      const { assertion, unwrappingKey } = await authenticatePasskey(
        prfKey.credentialId,
        async () => {
          const res = await api.getChallenge();
          return Uint8Array.from(atob(res.challenge), c => c.charCodeAt(0));
        }
      );

      const mek = await unwrapMEK(prfKey.wrappedMEK, unwrappingKey);
      await api.verifyAuth('prf', assertion);
      await unlockVault(mek);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  if (keys.length === 0 && !loading && !error) {
    return (
      <div style={{ 
        minHeight: '100vh', display: 'flex', justifyContent: 'center', alignItems: 'center', 
        backgroundColor: 'var(--bg-deep)', padding: '2rem' 
      }}>
        <div className="animate-fade" style={{ width: '100%', maxWidth: '400px', textAlign: 'center' }}>
          <div style={{ 
            fontSize: '4rem', marginBottom: '1.5rem', 
            display: 'inline-block', padding: '1.5rem', 
            borderRadius: '50%', backgroundColor: 'rgba(0, 212, 255, 0.1)',
            boxShadow: '0 0 40px var(--accent-glow)',
            border: '1px solid var(--accent)'
          }}>
            🆕
          </div>
          <h1 style={{ marginBottom: '0.5rem' }}>Initialize Your Vault</h1>
          <p style={{ color: 'var(--text-dim)', marginBottom: '2.5rem' }}>Set a master passphrase to secure your vault. This cannot be recovered if lost!</p>
          
          <form onSubmit={handleInitializeVault}>
            <input 
              type="password" 
              placeholder="Create Master Passphrase" 
              value={passphrase} 
              onChange={e => setPassphrase(e.target.value)}
              required
              style={{ width: '100%', padding: '1rem', marginBottom: '1.5rem', fontSize: '1.1rem', textAlign: 'center' }}
            />
            <button 
              type="submit" 
              disabled={loading}
              style={{ 
                width: '100%', padding: '1rem', borderRadius: '10px', 
                backgroundColor: 'var(--accent)', color: '#000', border: 'none', 
                fontWeight: 'bold', fontSize: '1rem', opacity: loading ? 0.7 : 1
              }}
            >
              {loading ? 'Initializing...' : 'Create Vault'}
            </button>
          </form>
          {error && <p style={{ color: 'var(--error)', marginTop: '1.5rem', fontSize: '0.9rem' }}>{error}</p>}
        </div>
      </div>
    );
  }

  return (
    <div style={{ 
      minHeight: '100vh', display: 'flex', justifyContent: 'center', alignItems: 'center', 
      backgroundColor: 'var(--bg-deep)', padding: '2rem' 
    }}>
      <div className="animate-fade" style={{ width: '100%', maxWidth: '400px', textAlign: 'center' }}>
        <div style={{ 
          fontSize: '4rem', marginBottom: '1.5rem', 
          display: 'inline-block', padding: '1.5rem', 
          borderRadius: '50%', backgroundColor: 'var(--bg-surface)',
          boxShadow: '0 0 40px var(--accent-glow)',
          border: '1px solid var(--accent)'
        }}>
          🛡️
        </div>
        
        <h1 style={{ marginBottom: '0.5rem' }}>Unlock Vault</h1>
        <p style={{ color: 'var(--text-dim)', marginBottom: '2.5rem' }}>Enter your master credentials to decrypt.</p>

        <div style={{ display: 'flex', gap: '0.25rem', marginBottom: '2rem', padding: '0.25rem', backgroundColor: '#000', borderRadius: '10px' }}>
          <button 
            onClick={() => setMode('passphrase')} 
            style={{ 
              flex: 1, padding: '0.5rem', borderRadius: '8px', border: 'none', 
              backgroundColor: mode === 'passphrase' ? 'var(--bg-surface)' : 'transparent',
              color: mode === 'passphrase' ? 'var(--accent)' : 'var(--text-dim)',
              fontSize: '0.8rem', fontWeight: 'bold'
            }}
          >
            Passphrase
          </button>
          <button 
            onClick={() => setMode('passkey')} 
            style={{ 
              flex: 1, padding: '0.5rem', borderRadius: '8px', border: 'none', 
              backgroundColor: mode === 'passkey' ? 'var(--bg-surface)' : 'transparent',
              color: mode === 'passkey' ? 'var(--accent)' : 'var(--text-dim)',
              fontSize: '0.8rem', fontWeight: 'bold'
            }}
          >
            Passkey
          </button>
          <button 
            onClick={() => setMode('recovery')} 
            style={{ 
              flex: 1, padding: '0.5rem', borderRadius: '8px', border: 'none', 
              backgroundColor: mode === 'recovery' ? 'var(--bg-surface)' : 'transparent',
              color: mode === 'recovery' ? '#ffc800' : 'var(--text-dim)',
              fontSize: '0.8rem', fontWeight: 'bold'
            }}
          >
            Recovery
          </button>
        </div>

        {mode === 'passphrase' ? (
          <form onSubmit={handlePassphraseUnlock}>
            <input 
              type="password" 
              placeholder="Master Passphrase" 
              value={passphrase} 
              onChange={e => setPassphrase(e.target.value)}
              required
              style={{ width: '100%', padding: '1rem', marginBottom: '1.5rem', fontSize: '1.1rem', textAlign: 'center' }}
            />
            <button 
              type="submit" 
              disabled={loading}
              style={{ 
                width: '100%', padding: '1rem', borderRadius: '10px', 
                backgroundColor: 'var(--accent)', color: '#000', border: 'none', 
                fontWeight: 'bold', fontSize: '1rem', opacity: loading ? 0.7 : 1
              }}
            >
              {loading ? 'Decrypting...' : 'Open Vault'}
            </button>
          </form>
        ) : mode === 'passkey' ? (
          <button 
            onClick={handlePasskeyUnlock}
            disabled={loading}
            style={{ 
              width: '100%', padding: '1rem', borderRadius: '10px', 
              backgroundColor: 'var(--bg-surface)', color: 'var(--accent)', 
              border: '1px solid var(--accent)', fontWeight: 'bold', 
              fontSize: '1rem', opacity: loading ? 0.7 : 1
            }}
          >
            {loading ? 'Verifying...' : 'Use Biometrics / Passkey'}
          </button>
        ) : (
          <form onSubmit={handleRecoveryUnlock}>
            <input 
              type="text" 
              placeholder="Enter 64-character hex key" 
              value={recoveryInput} 
              onChange={e => setRecoveryInput(e.target.value)}
              required
              style={{ width: '100%', padding: '1rem', marginBottom: '1.5rem', fontSize: '0.9rem', textAlign: 'center', color: '#ffc800', border: '1px solid #ffc800' }}
            />
            <button 
              type="submit" 
              disabled={loading}
              style={{ 
                width: '100%', padding: '1rem', borderRadius: '10px', 
                backgroundColor: '#ffc800', color: '#000', border: 'none', 
                fontWeight: 'bold', fontSize: '1rem', opacity: loading ? 0.7 : 1
              }}
            >
              {loading ? 'Recovering...' : 'Restore Vault Access'}
            </button>
            <p style={{ fontSize: '0.75rem', color: 'var(--text-dim)', marginTop: '1rem' }}>
              Warning: Recovery will grant full access to the vault.
            </p>
          </form>
        )}

        {error && <p style={{ color: 'var(--error)', marginTop: '1.5rem', fontSize: '0.9rem' }}>{error}</p>}
      </div>
    </div>
  );
}
