import React, { useState } from 'react';
import { api } from '../api/client.js';
import { useVault } from '../store/vault.jsx';

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
      const { token } = await api.login(email, password);
      loginIdentity(token, email);
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
      // 1. Get challenge
      const { challenge } = await api.getChallenge();
      
      // 2. Authenticate
      const assertion = await navigator.credentials.get({
        publicKey: {
          challenge: Uint8Array.from(atob(challenge), c => c.charCodeAt(0)),
          userVerification: "required",
        }
      });

      const credentialId = btoa(String.fromCharCode(...new Uint8Array(assertion.rawId)));
      
      // 3. Login with backend
      const { token } = await api.loginPasskey(email || 'default', credentialId, assertion);
      loginIdentity(token, email || 'default');
    } catch (err) {
      setError('Passkey login failed: ' + err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{
      maxWidth: 400,
      margin: '10vh auto',
      padding: '2rem',
      backgroundColor: '#1a1a1a',
      borderRadius: '12px',
      boxShadow: '0 8px 32px rgba(0,0,0,0.5)',
      color: '#fff',
      fontFamily: 'system-ui, sans-serif'
    }}>
      <h1 style={{ textAlign: 'center', marginBottom: '2rem', color: '#00d4ff' }}>SecureStore</h1>
      <p style={{ textAlign: 'center', color: '#888', marginBottom: '2rem' }}>Please log in to access your vault.</p>
      
      <form onSubmit={handleSubmit}>
        <div style={{ marginBottom: '1rem' }}>
          <label style={{ display: 'block', marginBottom: '0.5rem', fontSize: '0.9rem' }}>Email / Username</label>
          <input
            type="text"
            value={email}
            onChange={e => setEmail(e.target.value)}
            placeholder="admin"
            required
            style={{
              width: '100%',
              padding: '0.75rem',
              borderRadius: '6px',
              border: '1px solid #333',
              backgroundColor: '#0a0a0a',
              color: '#fff',
              boxSizing: 'border-box'
            }}
          />
        </div>
        <div style={{ marginBottom: '1.5rem' }}>
          <label style={{ display: 'block', marginBottom: '0.5rem', fontSize: '0.9rem' }}>Password</label>
          <input
            type="password"
            value={password}
            onChange={e => setPassword(e.target.value)}
            placeholder="••••••••"
            required
            style={{
              width: '100%',
              padding: '0.75rem',
              borderRadius: '6px',
              border: '1px solid #333',
              backgroundColor: '#0a0a0a',
              color: '#fff',
              boxSizing: 'border-box'
            }}
          />
        </div>
        
        {error && (
          <div style={{ color: '#ff4d4d', marginBottom: '1rem', fontSize: '0.85rem', textAlign: 'center' }}>
            {error}
          </div>
        )}

        <button
          type="submit"
          disabled={loading}
          style={{
            width: '100%',
            padding: '0.75rem',
            borderRadius: '6px',
            border: 'none',
            backgroundColor: '#00d4ff',
            color: '#000',
            fontWeight: 'bold',
            cursor: 'pointer',
            opacity: loading ? 0.7 : 1,
            transition: 'all 0.2s',
            marginBottom: '1rem'
          }}
        >
          {loading ? 'Logging in...' : 'Sign In'}
        </button>

        <button
          type="button"
          onClick={handlePasskeyLogin}
          disabled={loading}
          style={{
            width: '100%',
            padding: '0.75rem',
            borderRadius: '6px',
            border: '1px solid #333',
            backgroundColor: 'transparent',
            color: '#00d4ff',
            fontWeight: 'bold',
            cursor: 'pointer',
            opacity: loading ? 0.7 : 1,
            transition: 'all 0.2s'
          }}
        >
          Sign in with Passkey
        </button>
      </form>
    </div>
  );
}
