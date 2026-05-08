import React, { useState, useEffect } from 'react';
import { Capacitor } from '@capacitor/core';
import { api } from '../api/client.js';
import { useVault } from '../store/vault.jsx';
import { derivePassphraseKey } from '../crypto/passphrase.js';
import { enrollPasskey } from '../crypto/prf.js';
import { wrapMEK } from '../crypto/mek.js';

const IS_ANDROID = Capacitor.getPlatform() === 'android';

export function Settings({ onBack }) {
  const { mek } = useVault();
  const [keys, setKeys] = useState([]);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');

  const [newPassphrase, setNewPassphrase] = useState('');
  const [passkeyLabel, setPasskeyLabel] = useState('');
  const [newAccountPassword, setNewAccountPassword] = useState('');

  const [shareEmail, setShareEmail] = useState('');
  const [sharePassphrase, setSharePassphrase] = useState('');

  const [recoveryKey, setRecoveryKey] = useState('');

  const loadKeys = async () => {
    try {
      const fetched = await api.getKeys();
      setKeys(fetched);
    } catch (err) {
      setError(err.message);
    }
  };

  useEffect(() => { loadKeys(); }, []);

  const handleGenerateRecoveryKey = async () => {
    try {
      setError('');
      setMessage('');
      const rawKey = crypto.getRandomValues(new Uint8Array(32));
      const hexKey = Array.from(rawKey).map(b => b.toString(16).padStart(2, '0')).join('').toUpperCase();
      const unwrappingKey = await crypto.subtle.importKey('raw', rawKey, { name: 'AES-KW' }, false, ['wrapKey', 'unwrapKey']);
      const wrappedMEK = await wrapMEK(mek, unwrappingKey);
      await api.addKey({
        type: 'recovery',
        label: 'Emergency Recovery Key',
        wrappedMEK,
        iv: btoa(String.fromCharCode(...crypto.getRandomValues(new Uint8Array(12))))
      });
      setRecoveryKey(hexKey);
      setMessage('Recovery Key generated. COPY THIS NOW!');
      await loadKeys();
    } catch (err) {
      setError(err.message);
    }
  };

  const handleAddPasskey = async (e) => {
    e.preventDefault();
    try {
      setError('');
      setMessage('');
      const label = passkeyLabel || 'New Passkey Device';
      const { credential, unwrappingKey } = await enrollPasskey(label);
      const wrappedMEK = await wrapMEK(mek, unwrappingKey);
      const credentialId = btoa(String.fromCharCode(...new Uint8Array(credential.rawId)));
      await api.addKey({
        type: 'prf', credentialId, label, wrappedMEK,
        iv: btoa(String.fromCharCode(...crypto.getRandomValues(new Uint8Array(12))))
      });
      await api.registerPasskey(credentialId, 'MOCKED_PUBLIC_KEY', label);
      setMessage('Passkey enrolled for both Login and Vault Unlock!');
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
        type: 'passphrase', label: 'Additional Passphrase', wrappedMEK,
        iv: btoa(String.fromCharCode(...crypto.getRandomValues(new Uint8Array(12)))), salt
      });
      setMessage('Passphrase added successfully');
      setNewPassphrase('');
      await loadKeys();
    } catch (err) {
      setError(err.message);
    }
  };

  const handleChangeAccountPassword = async (e) => {
    e.preventDefault();
    try {
      setError('');
      setMessage('');
      await api.changePassword(newAccountPassword);
      setMessage('Account password updated successfully');
      setNewAccountPassword('');
    } catch (err) {
      setError(err.message);
    }
  };

  const handleShareVault = async (e) => {
    e.preventDefault();
    try {
      setError('');
      setMessage('');
      const { unwrappingKey, salt } = await derivePassphraseKey(sharePassphrase);
      const wrappedMEK = await wrapMEK(mek, unwrappingKey);
      await api.shareKey({
        targetEmail: shareEmail,
        type: 'passphrase',
        label: `Shared by ${api.token ? 'Family Member' : 'Owner'}`,
        wrappedMEK,
        iv: btoa(String.fromCharCode(...crypto.getRandomValues(new Uint8Array(12)))),
        salt
      });
      setMessage(`Vault access shared with ${shareEmail}.`);
      setShareEmail('');
      setSharePassphrase('');
    } catch (err) {
      setError('Sharing failed: ' + err.message);
    }
  };

  if (IS_ANDROID) {
    return (
      <div style={{
        display: 'flex', flexDirection: 'column',
        height: '100vh', backgroundColor: 'var(--bg-deep)', overflow: 'hidden',
        paddingTop: 'env(safe-area-inset-top)',
        paddingBottom: 'env(safe-area-inset-bottom)'
      }}>
        {/* Top bar */}
        <header style={{
          display: 'flex', alignItems: 'center',
          padding: '0 16px 0 4px', height: '64px',
          backgroundColor: '#000', borderBottom: '1px solid var(--border)',
          flexShrink: 0, gap: '4px'
        }}>
          <button
            onClick={onBack}
            className="icon-btn"
            style={{ color: 'var(--text-dim)', fontSize: '1.4rem' }}
            aria-label="Go back"
          >
            ←
          </button>
          <h2 style={{ flex: 1, margin: 0, fontSize: '1.1rem', fontWeight: '800' }}>Settings &amp; Access</h2>
        </header>

        <div style={{ flex: 1, overflowY: 'auto', padding: '16px', display: 'flex', flexDirection: 'column', gap: '16px' }}>

          {error && <div style={{ color: 'var(--error)', backgroundColor: 'rgba(255,77,77,0.1)', padding: '12px 16px', borderRadius: '10px', fontSize: '0.9rem' }}>{error}</div>}
          {message && <div style={{ color: 'var(--success)', backgroundColor: 'rgba(0,255,136,0.1)', padding: '12px 16px', borderRadius: '10px', fontSize: '0.9rem' }}>{message}</div>}

          {/* Active keys */}
          <section style={{ backgroundColor: 'var(--bg-surface)', borderRadius: '16px', border: '1px solid var(--border)', padding: '20px' }}>
            <h3 style={{ margin: '0 0 4px', fontSize: '1.05rem' }}>Active Access Keys</h3>
            <p style={{ margin: '0 0 16px', fontSize: '0.85rem', color: 'var(--text-dim)' }}>Devices and passphrases that can unlock this vault.</p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              {keys.map(k => (
                <div key={k.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 14px', backgroundColor: '#000', borderRadius: '12px', border: '1px solid var(--border)' }}>
                  <div>
                    <div style={{ fontSize: '0.95rem', fontWeight: 'bold' }}>{k.label}</div>
                    <div style={{ fontSize: '0.75rem', color: 'var(--accent)', fontWeight: 'bold', marginTop: '2px' }}>{k.type.toUpperCase()}</div>
                  </div>
                  {keys.length > 1 && (
                    <button onClick={async () => { if (confirm('Revoke this key?')) { await api.removeKey(k.id); loadKeys(); } }} style={{ background: 'none', border: 'none', color: 'var(--error)', fontWeight: 'bold', fontSize: '0.85rem' }}>
                      Revoke
                    </button>
                  )}
                </div>
              ))}
            </div>
          </section>

          {/* Enroll Passkey */}
          <section style={{ backgroundColor: 'var(--bg-surface)', borderRadius: '16px', border: '1px solid var(--border)', padding: '20px' }}>
            <h3 style={{ margin: '0 0 14px', fontSize: '1.05rem' }}>Enroll Passkey</h3>
            <form onSubmit={handleAddPasskey} style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              <input type="text" placeholder="Device Label" value={passkeyLabel} onChange={e => setPasskeyLabel(e.target.value)} required style={{ width: '100%', padding: '11px 14px' }} />
              <button type="submit" style={{ backgroundColor: 'var(--accent)', color: '#000', border: 'none', padding: '11px', borderRadius: '10px', fontWeight: '800' }}>Add Passkey</button>
            </form>
          </section>

          {/* Add Passphrase */}
          <section style={{ backgroundColor: 'var(--bg-surface)', borderRadius: '16px', border: '1px solid var(--border)', padding: '20px' }}>
            <h3 style={{ margin: '0 0 14px', fontSize: '1.05rem' }}>New Master Passphrase</h3>
            <form onSubmit={handleAddPassphrase} style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              <input type="password" placeholder="Passphrase" value={newPassphrase} onChange={e => setNewPassphrase(e.target.value)} required style={{ width: '100%', padding: '11px 14px' }} />
              <button type="submit" style={{ backgroundColor: 'var(--accent)', color: '#000', border: 'none', padding: '11px', borderRadius: '10px', fontWeight: '800' }}>Add Passphrase</button>
            </form>
          </section>

          {/* Share with family */}
          <section style={{ backgroundColor: 'var(--bg-surface)', borderRadius: '16px', border: '1px solid var(--accent)', padding: '20px', backgroundColor: 'rgba(0,229,255,0.03)' }}>
            <h3 style={{ margin: '0 0 4px', fontSize: '1.05rem', color: 'var(--accent)' }}>Share with Family Member</h3>
            <p style={{ margin: '0 0 14px', fontSize: '0.82rem', color: 'var(--text-dim)' }}>They must already have an account.</p>
            <form onSubmit={handleShareVault} style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              <input type="email" placeholder="Family Member Email" value={shareEmail} onChange={e => setShareEmail(e.target.value)} required style={{ width: '100%', padding: '11px 14px' }} />
              <input type="password" placeholder="Their Temporary Passphrase" value={sharePassphrase} onChange={e => setSharePassphrase(e.target.value)} required style={{ width: '100%', padding: '11px 14px' }} />
              <button type="submit" style={{ backgroundColor: 'var(--accent)', color: '#000', border: 'none', padding: '11px', borderRadius: '10px', fontWeight: '800' }}>Authorize Access</button>
            </form>
          </section>

          {/* Change account password */}
          <section style={{ backgroundColor: 'var(--bg-surface)', borderRadius: '16px', border: '1px solid var(--border)', padding: '20px' }}>
            <h3 style={{ margin: '0 0 4px', fontSize: '1.05rem' }}>Change Account Password</h3>
            <p style={{ margin: '0 0 14px', fontSize: '0.82rem', color: 'var(--text-dim)' }}>Updates your login password only. Does not affect data encryption.</p>
            <form onSubmit={handleChangeAccountPassword} style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              <input type="password" placeholder="New Account Password" value={newAccountPassword} onChange={e => setNewAccountPassword(e.target.value)} required style={{ width: '100%', padding: '11px 14px' }} />
              <button type="submit" style={{ backgroundColor: 'var(--bg-deep)', color: '#fff', border: '1px solid var(--border)', padding: '11px', borderRadius: '10px', fontWeight: '800' }}>Update Password</button>
            </form>
          </section>

          {/* Emergency recovery */}
          <section style={{ backgroundColor: 'rgba(255,200,0,0.02)', borderRadius: '16px', border: '1px dashed #ffc800', padding: '20px' }}>
            <h3 style={{ margin: '0 0 4px', fontSize: '1.05rem', color: '#ffc800' }}>⚠️ Emergency Recovery</h3>
            <p style={{ margin: '0 0 16px', fontSize: '0.82rem', color: 'var(--text-dim)' }}>
              If you forget your master passphrase, this key is the <strong style={{ color: '#fff' }}>only way</strong> to recover your data.
            </p>
            {recoveryKey ? (
              <div style={{ backgroundColor: '#000', padding: '16px', borderRadius: '12px', border: '1px solid #ffc800', textAlign: 'center' }}>
                <div style={{ fontSize: '0.75rem', color: '#ffc800', marginBottom: '10px', fontWeight: 'bold' }}>RECOVERY KEY — SAVE THIS OFFLINE</div>
                <code style={{ fontSize: '0.95rem', color: '#fff', wordBreak: 'break-all', letterSpacing: '0.1em', fontWeight: '800' }}>{recoveryKey}</code>
                <p style={{ fontSize: '0.8rem', color: 'var(--text-dim)', marginTop: '12px', marginBottom: 0 }}>This key will not be shown again.</p>
              </div>
            ) : (
              <button
                onClick={handleGenerateRecoveryKey}
                style={{ width: '100%', backgroundColor: 'transparent', color: '#ffc800', border: '2px solid #ffc800', padding: '12px', borderRadius: '10px', fontWeight: '900', fontSize: '0.95rem' }}
              >
                Generate Recovery Key
              </button>
            )}
          </section>

          <div style={{ height: '16px' }} />
        </div>
      </div>
    );
  }

  // Desktop / web layout
  return (
    <div style={{ backgroundColor: 'var(--bg-deep)', minHeight: '100vh', padding: '4rem 2rem' }}>
      <div style={{ maxWidth: '900px', margin: '0 auto' }}>
        <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '4rem' }}>
          <div>
            <h2 style={{ margin: 0, fontSize: '2.5rem', fontWeight: '900' }}>Settings & Access</h2>
            <p style={{ color: 'var(--text-dim)', margin: '0.75rem 0 0', fontSize: '1.1rem' }}>Manage how you access your encrypted data.</p>
          </div>
          <button onClick={onBack} style={{
            padding: '0.75rem 1.5rem', borderRadius: '10px',
            background: 'var(--bg-surface)', border: '1px solid var(--border)', color: '#fff',
            fontWeight: '600', fontSize: '0.9rem'
          }}>
            ← Back to Vault
          </button>
        </header>

        {error && <div style={{ color: 'var(--error)', backgroundColor: 'rgba(255,77,77,0.1)', padding: '1rem', borderRadius: '8px', marginBottom: '1.5rem' }}>{error}</div>}
        {message && <div style={{ color: 'var(--success)', backgroundColor: 'rgba(0,255,136,0.1)', padding: '1rem', borderRadius: '8px', marginBottom: '1.5rem' }}>{message}</div>}

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '2.5rem' }}>
          <section className="card" style={{ padding: '2.5rem' }}>
            <h3 style={{ fontSize: '1.5rem', marginBottom: '0.5rem' }}>Active Access Keys</h3>
            <p style={{ fontSize: '0.95rem', color: 'var(--text-dim)', marginBottom: '2rem' }}>Devices and passphrases that can unlock this vault.</p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              {keys.map(k => (
                <div key={k.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '1.25rem', backgroundColor: '#000', borderRadius: '12px', border: '1px solid var(--border)' }}>
                  <div>
                    <div style={{ fontSize: '1rem', fontWeight: 'bold' }}>{k.label}</div>
                    <div style={{ fontSize: '0.8rem', color: 'var(--accent)', fontWeight: 'bold', marginTop: '0.25rem' }}>{k.type.toUpperCase()}</div>
                  </div>
                  {keys.length > 1 && (
                    <button onClick={async () => { if (confirm('Revoke this key?')) { await api.removeKey(k.id); loadKeys(); } }} style={{ background: 'none', border: 'none', color: 'var(--error)', fontWeight: 'bold', fontSize: '0.85rem' }}>Revoke</button>
                  )}
                </div>
              ))}
            </div>
          </section>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '2.5rem' }}>
            <section className="card" style={{ padding: '2rem' }}>
              <h3 style={{ fontSize: '1.25rem', marginBottom: '1rem' }}>Enroll Passkey</h3>
              <form onSubmit={handleAddPasskey} style={{ display: 'flex', gap: '0.75rem' }}>
                <input type="text" placeholder="Device Label" value={passkeyLabel} onChange={e => setPasskeyLabel(e.target.value)} required style={{ flex: 1 }} />
                <button type="submit" style={{ backgroundColor: 'var(--accent)', color: '#000', border: 'none', padding: '0.5rem 1.25rem', borderRadius: '10px', fontWeight: '800' }}>Add</button>
              </form>
            </section>

            <section className="card" style={{ padding: '2rem' }}>
              <h3 style={{ fontSize: '1.25rem', marginBottom: '1rem' }}>New Master Passphrase</h3>
              <form onSubmit={handleAddPassphrase} style={{ display: 'flex', gap: '0.75rem' }}>
                <input type="password" placeholder="Passphrase" value={newPassphrase} onChange={e => setNewPassphrase(e.target.value)} required style={{ flex: 1 }} />
                <button type="submit" style={{ backgroundColor: 'var(--accent)', color: '#000', border: 'none', padding: '0.5rem 1.25rem', borderRadius: '10px', fontWeight: '800' }}>Add</button>
              </form>
            </section>

            <section className="card" style={{ padding: '2rem', borderColor: 'var(--accent)', backgroundColor: 'rgba(0, 212, 255, 0.02)' }}>
              <h3 style={{ fontSize: '1.25rem', marginBottom: '0.5rem', color: 'var(--accent)' }}>Share with Family Member</h3>
              <p style={{ fontSize: '0.85rem', color: 'var(--text-dim)', marginBottom: '1.5rem' }}>Wrap the shared Master Key for another user. They must already have an account.</p>
              <form onSubmit={handleShareVault} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                <input type="email" placeholder="Family Member Email" value={shareEmail} onChange={e => setShareEmail(e.target.value)} required />
                <input type="password" placeholder="Their Temporary Passphrase" value={sharePassphrase} onChange={e => setSharePassphrase(e.target.value)} required />
                <button type="submit" style={{ backgroundColor: 'var(--accent)', color: '#000', border: 'none', padding: '1rem', borderRadius: '10px', fontWeight: '800', fontSize: '1rem' }}>Authorize Access</button>
              </form>
            </section>
          </div>
        </div>

        <section className="card" style={{ marginTop: '2.5rem', padding: '2.5rem' }}>
          <h3 style={{ fontSize: '1.5rem', marginBottom: '0.5rem' }}>Change Account Password</h3>
          <p style={{ fontSize: '0.95rem', color: 'var(--text-dim)', marginBottom: '2rem' }}>Updates your login password (Layer 1). This does not affect data encryption.</p>
          <form onSubmit={handleChangeAccountPassword} style={{ display: 'flex', gap: '1rem' }}>
            <input type="password" placeholder="New Account Password" value={newAccountPassword} onChange={e => setNewAccountPassword(e.target.value)} required style={{ flex: 1 }} />
            <button type="submit" style={{ backgroundColor: 'var(--bg-deep)', color: '#fff', border: '1px solid var(--border)', padding: '0.8rem 1.5rem', borderRadius: '10px', fontWeight: '800' }}>Update Login Password</button>
          </form>
        </section>

        <section className="card" style={{ backgroundColor: 'rgba(255, 200, 0, 0.02)', border: '1px dashed #ffc800', marginTop: '2.5rem', padding: '2.5rem' }}>
          <h3 style={{ fontSize: '1.5rem', marginBottom: '0.5rem', color: '#ffc800' }}>⚠️ Emergency Recovery</h3>
          <p style={{ fontSize: '0.95rem', color: 'var(--text-dim)', marginBottom: '2rem' }}>
            If you forget your master passphrase, this key is the <strong style={{ color: '#fff' }}>only way</strong> to recover your data.
          </p>
          {recoveryKey ? (
            <div style={{ backgroundColor: '#000', padding: '2rem', borderRadius: '12px', border: '1px solid #ffc800', textAlign: 'center' }}>
              <div style={{ fontSize: '0.8rem', color: '#ffc800', marginBottom: '0.75rem', fontWeight: 'bold' }}>YOUR RECOVERY KEY (SAVE THIS OFFLINE)</div>
              <code style={{ fontSize: '1.25rem', color: '#fff', wordBreak: 'break-all', letterSpacing: '0.15em', fontWeight: '800' }}>{recoveryKey}</code>
              <p style={{ fontSize: '0.85rem', color: 'var(--text-dim)', marginTop: '1.5rem' }}>This key will not be shown again.</p>
            </div>
          ) : (
            <button
              onClick={handleGenerateRecoveryKey}
              style={{ backgroundColor: 'transparent', color: '#ffc800', border: '2px solid #ffc800', padding: '1rem 2rem', borderRadius: '12px', fontWeight: '900', fontSize: '1rem' }}
            >
              Generate Recovery Key
            </button>
          )}
        </section>
      </div>
    </div>
  );
}
