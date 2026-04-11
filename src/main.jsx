import React from 'react';
import { createRoot } from 'react-dom/client';
import { VaultProvider, useVault } from './store/vault.jsx';
import { Unlock } from './components/Unlock.jsx';
import { Vault } from './components/Vault.jsx';

function App() {
  const { mek, loading } = useVault();

  if (loading) return <div style={{ textAlign: 'center', padding: '2rem' }}>Loading Vault...</div>;

  return mek ? <Vault /> : <Unlock />;
}

const root = createRoot(document.getElementById('root'));
root.render(
  <VaultProvider>
    <App />
  </VaultProvider>
);
