import React, { useState } from 'react';
import { api } from '../api/client.js';
import { useVault } from '../store/vault.jsx';
import { serializeCredential } from '../crypto/util.js';
import { authenticatePasskey } from '../crypto/prf.js';
import { unwrapMEK } from '../crypto/mek.js';

export function Login() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const { loginIdentity } = useVault();

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const { token, email: userEmail, wrappedKeys: keys } = await api.login(email, password);
      loginIdentity(token, userEmail, null, keys);
    } catch (err) {
      setError(err.message || 'Login failed');
    } finally {
      setLoading(false);
    }
  };

  const handlePasskeyLogin = async () => {
    setError('');
    setLoading(true);
    try {
      // 1. Get combined assertion + PRF secret
      const { assertion, unwrappingKey } = await authenticatePasskey(
        null, // Use resident key lookup
        async () => {
          const res = await api.getChallenge();
          return Uint8Array.from(atob(res.challenge), c => c.charCodeAt(0));
        }
      );

      const credentialId = btoa(String.fromCharCode(...new Uint8Array(assertion.rawId)));
      const serializedAssertion = serializeCredential(assertion);
      
      // 2. Login with backend (now returns keys too)
      const { token, email: userEmail, wrappedKeys } = await api.loginPasskey(email || null, credentialId, serializedAssertion);
      
      // 3. Try to auto-unlock if PRF is supported
      let autoMek = null;
      if (unwrappingKey && wrappedKeys) {
        const prfKeyData = wrappedKeys.find(k => k.type === 'prf' && k.credentialId === credentialId);
        if (prfKeyData) {
          try {
            autoMek = await unwrapMEK(prfKeyData.wrappedMEK, unwrappingKey);
            console.log("Single-Tap Unlock Success!");
          } catch (err) {
            console.warn("Single-Tap PRF unwrap failed (likely domain mismatch), falling back to Layer 1 login.", err);
          }
        }
      }

      await loginIdentity(token, userEmail, autoMek, wrappedKeys);
    } catch (err) {
      setError('Passkey login failed: ' + err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{
      minHeight: '100vh',
      display: 'flex',
      flexDirection: 'column',
      justifyContent: 'center',
      alignItems: 'center',
      padding: '2rem',
      backgroundColor: 'var(--bg-deep)'
    }}>
      <div className="animate-fade card" style={{
        width: '100%',
        maxWidth: 420,
        textAlign: 'center'
      }}>
        <div style={{ 
          fontSize: '4rem', marginBottom: '2rem', 
          display: 'inline-block', padding: '1.5rem', 
          borderRadius: '50%', backgroundColor: 'rgba(0, 212, 255, 0.05)',
          boxShadow: '0 0 50px var(--accent-glow)',
          border: '1px solid var(--accent)'
        }}>
          🛡️
        </div>
        <h1 style={{ margin: '0 0 0.75rem', color: 'var(--accent)', fontSize: '2.5rem', fontWeight: '900' }}>SecureStore</h1>
        <p style={{ color: 'var(--text-dim)', marginBottom: '3rem', fontSize: '1.1rem' }}>Please log in to access your vault.</p>
        
        <form onSubmit={handleSubmit} style={{ textAlign: 'left' }}>
          <div style={{ marginBottom: '1.5rem' }}>
            <label style={{ display: 'block', marginBottom: '0.6rem', fontSize: '0.85rem', fontWeight: 'bold', color: 'var(--text-dim)', letterSpacing: '0.05em' }}>EMAIL / USERNAME</label>
            <input
              type="text"
              value={email}
              onChange={e => setEmail(e.target.value)}
              placeholder="admin"
              required
              style={{
                width: '100%',
                padding: '1.25rem',
                fontSize: '1.1rem'
              }}
            />
          </div>
          <div style={{ marginBottom: '2.5rem' }}>
            <label style={{ display: 'block', marginBottom: '0.6rem', fontSize: '0.85rem', fontWeight: 'bold', color: 'var(--text-dim)', letterSpacing: '0.05em' }}>PASSWORD</label>
            <input
              type="password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              placeholder="••••••••"
              required
              style={{
                width: '100%',
                padding: '1.25rem',
                fontSize: '1.1rem'
              }}
            />
          </div>
          
          {error && (
            <div style={{ 
              color: 'var(--error)', 
              backgroundColor: 'rgba(255,77,77,0.1)', 
              padding: '1rem', 
              borderRadius: '10px', 
              marginBottom: '1.5rem', 
              fontSize: '0.95rem', 
              textAlign: 'center',
              border: '1px solid rgba(255,77,77,0.2)'
            }}>
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            style={{
              width: '100%',
              padding: '1.25rem',
              borderRadius: '14px',
              border: 'none',
              backgroundColor: 'var(--accent)',
              color: 'var(--text-on-accent)',
              fontWeight: '900',
              fontSize: '1.1rem',
              cursor: 'pointer',
              opacity: loading ? 0.7 : 1,
              transition: 'all 0.2s',
              marginBottom: '1rem',
              boxShadow: '0 10px 30px var(--accent-glow)'
            }}
          >
            {loading ? 'Signing in...' : 'Sign In'}
          </button>

          <button
            type="button"
            onClick={handlePasskeyLogin}
            disabled={loading}
            style={{
              width: '100%',
              padding: '1.25rem',
              borderRadius: '12px',
              border: '1px solid var(--border)',
              backgroundColor: 'transparent',
              color: 'var(--accent)',
              fontWeight: '800',
              fontSize: '1rem',
              cursor: 'pointer',
              opacity: loading ? 0.7 : 1,
              transition: 'all 0.2s'
            }}
          >
            Sign in with Passkey
          </button>
        </form>
      </div>
    </div>
  );
}
