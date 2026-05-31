import { useState, useEffect } from 'react';
import { api, setApiBaseUrl, getApiBaseUrl } from '../api/client.js';
import { useVault } from '../store/vault.jsx';
import { Capacitor } from '@capacitor/core';
import {
  isBiometricAvailable,
  isSecureCredentialsEnrolled,
  getSecureCredentials,
  saveSecureCredentials,
  clearSecureCredentials,
} from '../crypto/native-auth.js';

const IS_ANDROID = Capacitor.getPlatform() === 'android';
const REMEMBER_DECLINED_KEY = 'vault:credentials_asked';

export function Login() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [serverUrl, setServerUrl] = useState(() => getApiBaseUrl());

  // Android-only state for the biometric-credential path.
  const [credsEnrolled, setCredsEnrolled] = useState(false);
  const [biometricSupported, setBiometricSupported] = useState(false);
  const [showRememberPrompt, setShowRememberPrompt] = useState(false);
  const [pendingCredentials, setPendingCredentials] = useState(null);
  const [forcePasswordForm, setForcePasswordForm] = useState(false);

  const { loginIdentity } = useVault();

  useEffect(() => {
    if (!IS_ANDROID) return;
    let mounted = true;
    (async () => {
      try {
        const [available, enrolled] = await Promise.all([
          isBiometricAvailable(),
          isSecureCredentialsEnrolled(),
        ]);
        if (mounted) {
          setBiometricSupported(available);
          setCredsEnrolled(enrolled);
        }
      } catch (e) {
        console.warn('Credential availability check failed:', e);
      }
    })();
    return () => { mounted = false; };
  }, []);

  const handleSaveServer = () => {
    setApiBaseUrl(serverUrl);
    setShowSettings(false);
  };

  const completeLogin = async (creds) => {
    const { token, email: userEmail, wrappedKeys: keys } = await api.login(creds.email, creds.password);
    // On Android, offer to remember credentials after first successful login —
    // unless they're already stored or the user previously declined.
    const declined = IS_ANDROID && localStorage.getItem(REMEMBER_DECLINED_KEY) === 'true';
    if (IS_ANDROID && biometricSupported && !credsEnrolled && !declined) {
      setPendingCredentials({ ...creds, token, userEmail, keys });
      setShowRememberPrompt(true);
      return;
    }
    await loginIdentity(token, userEmail, null, keys);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      await completeLogin({ email, password });
    } catch (err) {
      console.error(`[LOGIN FAILED]`, err);
      setError(err.message || 'Login failed');
    } finally {
      setLoading(false);
    }
  };

  const handleUnlockWithStored = async () => {
    setError('');
    setLoading(true);
    try {
      const json = await getSecureCredentials();
      if (!json) {
        // Stored credentials disappeared (e.g. cleared elsewhere); fall back.
        setCredsEnrolled(false);
        setForcePasswordForm(true);
        return;
      }
      const stored = JSON.parse(json);
      try {
        const { token, email: userEmail, wrappedKeys: keys } = await api.login(stored.email, stored.password);
        await loginIdentity(token, userEmail, null, keys);
      } catch (apiErr) {
        // 401 → stored credentials are stale (password changed elsewhere).
        if (/invalid credentials/i.test(apiErr.message) || apiErr.message?.includes('401')) {
          await clearSecureCredentials().catch(() => {});
          setCredsEnrolled(false);
          setForcePasswordForm(true);
          setEmail(stored.email || '');
          setError('Your saved credentials are out of date. Please sign in again.');
        } else {
          throw apiErr;
        }
      }
    } catch (err) {
      if (err.message?.includes('KEY_INVALIDATED')) {
        setCredsEnrolled(false);
        setForcePasswordForm(true);
        setError('Your biometrics changed. Sign in with your password to re-enable biometric login.');
      } else if (err.message?.includes('BIOMETRIC_ERROR')) {
        // User canceled — leave them on this screen, no error message needed.
      } else {
        setError(err.message || 'Biometric unlock failed');
      }
    } finally {
      setLoading(false);
    }
  };

  const handleAcceptRemember = async () => {
    if (!pendingCredentials) return;
    setLoading(true);
    try {
      await saveSecureCredentials(JSON.stringify({
        email: pendingCredentials.email,
        password: pendingCredentials.password,
      }));
      setCredsEnrolled(true);
      localStorage.removeItem(REMEMBER_DECLINED_KEY);
      const { token, userEmail, keys } = pendingCredentials;
      setShowRememberPrompt(false);
      setPendingCredentials(null);
      await loginIdentity(token, userEmail, null, keys);
    } catch (err) {
      // Biometric canceled or failed — proceed with login anyway.
      const { token, userEmail, keys } = pendingCredentials;
      setShowRememberPrompt(false);
      setPendingCredentials(null);
      await loginIdentity(token, userEmail, null, keys);
    } finally {
      setLoading(false);
    }
  };

  const handleDeclineRemember = async () => {
    if (!pendingCredentials) return;
    localStorage.setItem(REMEMBER_DECLINED_KEY, 'true');
    const { token, userEmail, keys } = pendingCredentials;
    setShowRememberPrompt(false);
    setPendingCredentials(null);
    await loginIdentity(token, userEmail, null, keys);
  };

  // -------------------------------------------------------------------------
  // Render branches
  // -------------------------------------------------------------------------

  // Android "Remember credentials?" modal — shown after successful first login.
  if (showRememberPrompt) {
    return (
      <div style={{
        minHeight: '100vh', display: 'flex', justifyContent: 'center', alignItems: 'center',
        padding: '2rem', backgroundColor: 'var(--bg-deep)'
      }}>
        <div className="animate-fade card" style={{ width: '100%', maxWidth: 420, textAlign: 'center' }}>
          <div style={{
            fontSize: '3.5rem', marginBottom: '1.5rem',
            display: 'inline-block', padding: '1.25rem',
            borderRadius: '50%', backgroundColor: 'rgba(0, 212, 255, 0.05)',
            border: '1px solid var(--accent)'
          }}>
            ☝️
          </div>
          <h2 style={{ margin: '0 0 1rem', fontSize: '1.5rem' }}>Remember Login on This Device?</h2>
          <p style={{ color: 'var(--text-dim)', marginBottom: '2rem', fontSize: '1rem' }}>
            Sign in with your fingerprint next time. Your credentials are sealed in the same
            hardware key that protects your vault.
          </p>
          <button
            onClick={handleAcceptRemember}
            disabled={loading}
            style={{
              width: '100%', padding: '1.1rem', borderRadius: '12px',
              backgroundColor: 'var(--accent)', color: 'var(--text-on-accent)', border: 'none',
              fontWeight: '900', fontSize: '1.05rem', marginBottom: '0.75rem',
              opacity: loading ? 0.7 : 1
            }}
          >
            Yes, Remember
          </button>
          <button
            onClick={handleDeclineRemember}
            disabled={loading}
            style={{
              width: '100%', padding: '1.1rem', borderRadius: '12px',
              backgroundColor: 'transparent', color: 'var(--text-dim)',
              border: '1px solid var(--border)', fontWeight: '700', fontSize: '0.95rem',
              opacity: loading ? 0.7 : 1
            }}
          >
            Not Now
          </button>
        </div>
      </div>
    );
  }

  // Android with stored credentials → single "Unlock" button.
  const showStoredUnlock = IS_ANDROID && credsEnrolled && !forcePasswordForm;

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
        <p style={{ color: 'var(--text-dim)', marginBottom: '3rem', fontSize: '1.1rem' }}>
          {showStoredUnlock ? 'Tap to sign in with your biometric.' : 'Please log in to access your vault.'}
        </p>

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

        {showStoredUnlock ? (
          <>
            <button
              type="button"
              onClick={handleUnlockWithStored}
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
                marginBottom: '1rem',
                boxShadow: '0 10px 30px var(--accent-glow)'
              }}
            >
              {loading ? 'Authenticating...' : 'Unlock with Biometric'}
            </button>
            <button
              type="button"
              onClick={() => { setForcePasswordForm(true); setError(''); }}
              disabled={loading}
              style={{
                width: '100%', padding: '0.9rem', borderRadius: '10px',
                border: '1px solid var(--border)', backgroundColor: 'transparent',
                color: 'var(--text-dim)', fontWeight: '700', fontSize: '0.9rem',
                opacity: loading ? 0.7 : 1
              }}
            >
              Sign in with Password
            </button>
          </>
        ) : (
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

            {IS_ANDROID && credsEnrolled && forcePasswordForm && (
              <button
                type="button"
                onClick={() => { setForcePasswordForm(false); setError(''); }}
                disabled={loading}
                style={{
                  width: '100%', padding: '0.9rem', borderRadius: '10px',
                  border: '1px solid var(--border)', backgroundColor: 'transparent',
                  color: 'var(--text-dim)', fontWeight: '700', fontSize: '0.9rem',
                  opacity: loading ? 0.7 : 1
                }}
              >
                ← Use Biometric Instead
              </button>
            )}
          </form>
        )}

        <div style={{ marginTop: '2rem', borderTop: '1px solid var(--border)', paddingTop: '1.5rem' }}>
          {Capacitor.isNativePlatform() && (
            showSettings ? (
              <div>
                <label style={{ display: 'block', marginBottom: '0.6rem', fontSize: '0.85rem', fontWeight: 'bold', color: 'var(--text-dim)', letterSpacing: '0.05em' }}>SERVER ENDPOINT</label>
                <input
                  type="text"
                  value={serverUrl}
                  onChange={e => setServerUrl(e.target.value)}
                  placeholder="https://your-server.com/api"
                  style={{ width: '100%', padding: '1rem', marginBottom: '1rem', fontSize: '1rem' }}
                />
                <div style={{ display: 'flex', gap: '1rem' }}>
                  <button type="button" onClick={() => setShowSettings(false)} style={{ flex: 1, padding: '1rem', borderRadius: '10px', background: 'transparent', color: 'var(--text-dim)', border: '1px solid var(--border)' }}>Cancel</button>
                  <button type="button" onClick={handleSaveServer} style={{ flex: 1, padding: '1rem', borderRadius: '10px', background: 'var(--accent)', color: '#000', border: 'none', fontWeight: 'bold' }}>Save</button>
                </div>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => setShowSettings(true)}
                style={{ background: 'none', border: 'none', color: 'var(--text-dim)', fontSize: '0.85rem', textDecoration: 'underline' }}
              >
                Configure Server Endpoint
              </button>
            )
          )}
        </div>
      </div>
    </div>
  );
}
