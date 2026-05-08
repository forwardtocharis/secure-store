import React from 'react';
import { createRoot } from 'react-dom/client';
import './index.css';
import { VaultProvider, useVault } from './store/vault.jsx';
import { Login } from './components/Login.jsx';
import { Unlock } from './components/Unlock.jsx';
import { Vault } from './components/Vault.jsx';
import { ErrorBoundary } from './components/ErrorBoundary.jsx';
import { CapacitorPasskey } from '@capgo/capacitor-passkey';

// Automatically shim the browser's navigator.credentials API to route to the native device OS.
CapacitorPasskey.autoShimWebAuthn();

function App() {
  const { identity, mek, loading, logout } = useVault();

  if (loading) return <div style={{ textAlign: 'center', padding: '2rem' }}>Loading Vault...</div>;

  return (
    <ErrorBoundary onPanic={logout}>
      {!identity ? (
        <div style={{ textAlign: 'center' }}>
          <Login />
        </div>
      ) : (
        mek ? <Vault /> : <Unlock />
      )}
    </ErrorBoundary>
  );
}

const root = createRoot(document.getElementById('root'));
root.render(
  <VaultProvider>
    <App />
  </VaultProvider>
);
