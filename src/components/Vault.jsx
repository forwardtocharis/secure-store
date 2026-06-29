import { useState, useMemo, useEffect } from 'react';
import { Capacitor } from '@capacitor/core';
import { useVault } from '../store/vault.jsx';
import { ItemEditor } from './ItemEditor.jsx';
import { Settings } from './Settings.jsx';
import { isBiometricAvailable, isSecureMEKEnrolled, saveSecureMEK } from '../crypto/native-auth.js';
import { exportMEK } from '../crypto/mek.js';

const IS_ANDROID = Capacitor.getPlatform() === 'android';

const TYPE_ICONS = { entity: '📂', login: '🔑', document: '📄', note: '📝', identity: '🪪' };
const TYPE_LABELS = { entity: 'Entity', login: 'Password', document: 'Document', note: 'Note', identity: 'Identity' };

export function Vault() {
  const { items, logout, deleteItem, identity, mek } = useVault();
  const [editingItem, setEditingItem] = useState(null);
  const [isCreating, setIsCreating] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [filterType, setFilterType] = useState('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [showSearch, setShowSearch] = useState(false);
  const [showBiometricPrompt, setShowBiometricPrompt] = useState(false);

  // Check for biometric consent on Android
  useEffect(() => {
    if (IS_ANDROID && !showSettings && !editingItem && !isCreating) {
      const checkBiometrics = async () => {
        try {
          const available = await isBiometricAvailable();
          const stored = await isSecureMEKEnrolled();
          const asked = localStorage.getItem('vault:biometric_asked');
          
          if (available && !stored && !asked) {
            setShowBiometricPrompt(true);
          }
        } catch (e) {
          console.warn("Biometric check failed:", e);
        }
      };
      checkBiometrics();
    }
  }, [showSettings, editingItem, isCreating]);

  const handleEnableBiometric = async () => {
    try {
      const exported = await exportMEK(mek);
      await saveSecureMEK(exported);
      localStorage.setItem('vault:biometric_asked', 'true');
      setShowBiometricPrompt(false);
    } catch (err) {
      console.error("Failed to enable biometrics:", err);
      alert("Failed to enable biometric unlock: " + err.message);
    }
  };

  const handleDeclineBiometric = () => {
    localStorage.setItem('vault:biometric_asked', 'true');
    setShowBiometricPrompt(false);
  };

  const filteredItems = useMemo(() => {
    const queryLower = searchQuery.toLowerCase();
    return items.filter(item => {
      const matchesType = filterType === 'all' || item.type === filterType;
      const matchesSearch = item.name.toLowerCase().includes(queryLower);
      return matchesType && matchesSearch;
    });
  }, [items, filterType, searchQuery]);

  const stats = useMemo(() => {
    return items.reduce((acc, item) => {
      if (item.type === 'login') acc.logins++;
      else if (item.type === 'document') acc.docs++;
      else if (item.type === 'note') acc.notes++;
      else if (item.type === 'entity') acc.entities++;
      return acc;
    }, { total: items.length, logins: 0, docs: 0, notes: 0, entities: 0 });
  }, [items]);

  if (showSettings) return <Settings onBack={() => setShowSettings(false)} />;

  if (editingItem || isCreating) {
    return (
      <ItemEditor
        item={editingItem}
        onClose={() => { setEditingItem(null); setIsCreating(false); }}
      />
    );
  }

  if (IS_ANDROID) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', height: '100vh', backgroundColor: 'var(--bg-deep)', overflow: 'hidden' }}>

        {/* Top App Bar */}
        <header style={{
          display: 'flex',
          alignItems: 'center',
          padding: '0 8px 0 16px',
          minHeight: '64px',
          height: 'auto',
          backgroundColor: '#000',
          borderBottom: '1px solid var(--border)',
          flexShrink: 0,
          gap: '4px',
          paddingTop: 'env(safe-area-inset-top)'
        }}>
          <span style={{ fontSize: '1.3rem' }}>🛡️</span>
          <h1 style={{
            flex: 1,
            margin: '0 0 0 8px',
            fontSize: '1.2rem',
            fontWeight: '900',
            color: 'var(--accent)',
            letterSpacing: '-0.02em'
          }}>
            SecureStore
          </h1>
          <button
            onClick={() => {
              setShowSearch(s => !s);
              if (showSearch) setSearchQuery('');
            }}
            className="icon-btn"
            style={{ color: showSearch ? 'var(--accent)' : 'var(--text-dim)' }}
            aria-label="Search"
          >
            🔍
          </button>
          <button
            onClick={logout}
            className="icon-btn"
            style={{ color: 'var(--text-dim)' }}
            aria-label="Lock vault"
          >
            🔒
          </button>
        </header>

        {/* Collapsible Search Bar */}
        {showSearch && (
          <div style={{
            padding: '8px 16px',
            backgroundColor: 'var(--bg-surface)',
            borderBottom: '1px solid var(--border)',
            flexShrink: 0
          }}>
            <div style={{ position: 'relative' }}>
              <input
                autoFocus
                type="text"
                placeholder="Search vault..."
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                style={{
                  width: '100%',
                  padding: '10px 40px 10px 16px',
                  fontSize: '1rem',
                  borderRadius: '24px',
                  backgroundColor: 'var(--bg-card)'
                }}
              />
              {searchQuery && (
                <button
                  onClick={() => setSearchQuery('')}
                  style={{
                    position: 'absolute', right: '8px', top: '50%',
                    transform: 'translateY(-50%)',
                    background: 'var(--border)', border: 'none', color: '#fff',
                    width: '24px', height: '24px', borderRadius: '50%',
                    fontSize: '0.7rem', display: 'flex', alignItems: 'center', justifyContent: 'center'
                  }}
                >✕</button>
              )}
            </div>
          </div>
        )}

        {/* Biometric Consent Prompt */}
        {showBiometricPrompt && (
          <div className="animate-fade" style={{
            margin: '16px', padding: '20px',
            borderRadius: '16px', background: 'linear-gradient(135deg, var(--accent) 0%, #00d4ff 100%)',
            color: '#000', boxShadow: '0 10px 30px var(--accent-glow)',
            position: 'relative', zIndex: 50, display: 'flex', flexDirection: 'column', gap: '12px'
          }}>
            <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
              <span style={{ fontSize: '1.5rem' }}>☝️</span>
              <div style={{ flex: 1 }}>
                <div style={{ fontWeight: '900', fontSize: '1rem' }}>Enable Biometric Unlock?</div>
                <div style={{ fontSize: '0.85rem', fontWeight: '600', opacity: 0.9 }}>Access your vault instantly using your fingerprint or face. Your key stays in the hardware.</div>
              </div>
            </div>
            <div style={{ display: 'flex', gap: '10px', marginTop: '4px' }}>
              <button 
                onClick={handleEnableBiometric}
                style={{ flex: 1, padding: '10px', borderRadius: '10px', backgroundColor: '#000', color: '#fff', border: 'none', fontWeight: '900', fontSize: '0.9rem' }}
              >
                Enable Now
              </button>
              <button 
                onClick={handleDeclineBiometric}
                style={{ flex: 1, padding: '10px', borderRadius: '10px', backgroundColor: 'transparent', color: '#000', border: '1.5px solid #000', fontWeight: '800', fontSize: '0.9rem' }}
              >
                Maybe Later
              </button>
            </div>
          </div>
        )}

        {/* Item List */}
        <main style={{ flex: 1, overflowY: 'auto', overscrollBehavior: 'contain' }}>
          {filteredItems.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '5rem 2rem', color: 'var(--text-dim)' }}>
              <div style={{ fontSize: '3rem', marginBottom: '1rem' }}>
                {searchQuery ? '🧐' : '📭'}
              </div>
              <p style={{ margin: '0 0 1rem' }}>
                {searchQuery ? `No matches for "${searchQuery}"` : 'No items in this category.'}
              </p>
              {searchQuery && (
                <button
                  onClick={() => setSearchQuery('')}
                  style={{ color: 'var(--accent)', background: 'none', border: 'none', fontWeight: 'bold', fontSize: '1rem' }}
                >
                  Clear Search
                </button>
              )}
            </div>
          ) : (
            filteredItems.map(item => (
              <MobileVaultRow
                key={item.id}
                item={item}
                onEdit={() => setEditingItem(item)}
                onDelete={() => { if (confirm('Delete this item?')) deleteItem(item.id); }}
              />
            ))
          )}
          {/* Spacer so FAB doesn't cover last item */}
          <div style={{ height: '88px' }} />
        </main>

        {/* FAB */}
        <button
          onClick={() => setIsCreating(true)}
          style={{
            position: 'fixed',
            bottom: 'calc(64px + env(safe-area-inset-bottom) + 16px)',
            right: '20px',
            width: '56px',
            height: '56px',
            borderRadius: '16px',
            backgroundColor: 'var(--accent)',
            color: '#000',
            border: 'none',
            fontSize: '1.75rem',
            fontWeight: 'bold',
            boxShadow: '0 4px 20px var(--accent-glow)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 100
          }}
          aria-label="Add new item"
        >
          +
        </button>

        {/* Bottom Navigation */}
        <nav style={{
          position: 'fixed',
          bottom: 0,
          left: 0,
          right: 0,
          height: 'calc(64px + env(safe-area-inset-bottom))',
          paddingBottom: 'env(safe-area-inset-bottom)',
          backgroundColor: '#000',
          borderTop: '1px solid var(--border)',
          display: 'flex',
          alignItems: 'stretch',
          zIndex: 200
        }}>
          <BottomNavItem label="All" icon="📦" active={filterType === 'all'} count={stats.total} onClick={() => setFilterType('all')} />
          <BottomNavItem label="Passwords" icon="🔑" active={filterType === 'login'} count={stats.logins} onClick={() => setFilterType('login')} />
          <BottomNavItem label="Documents" icon="📄" active={filterType === 'document'} count={stats.docs} onClick={() => setFilterType('document')} />
          <BottomNavItem label="Notes" icon="📝" active={filterType === 'note'} count={stats.notes} onClick={() => setFilterType('note')} />
          <BottomNavItem label="Settings" icon="⚙️" active={false} onClick={() => setShowSettings(true)} />
        </nav>
      </div>
    );
  }

  // Desktop / web layout
  return (
    <div style={{ display: 'flex', minHeight: '100vh', backgroundColor: 'var(--bg-deep)' }}>
      {/* Sidebar */}
      <aside style={{
        width: '300px',
        borderRight: '1px solid var(--border)',
        padding: '3rem 1.5rem',
        display: 'flex',
        flexDirection: 'column',
        position: 'fixed',
        height: '100vh',
        backgroundColor: '#000'
      }}>
        <h1 style={{ color: 'var(--accent)', fontSize: '1.75rem', marginBottom: '3rem', display: 'flex', alignItems: 'center', gap: '0.75rem', fontWeight: '900' }}>
          <span style={{ fontSize: '1.5rem' }}>🛡️</span> SecureStore
        </h1>

        <nav style={{ flex: 1 }}>
          <SidebarItem label="All Items" icon="📦" active={filterType === 'all'} onClick={() => setFilterType('all')} count={stats.total} />
          <SidebarItem label="Entities" icon="📂" active={filterType === 'entity'} onClick={() => setFilterType('entity')} count={stats.entities} />
          <SidebarItem label="Passwords" icon="🔑" active={filterType === 'login'} onClick={() => setFilterType('login')} count={stats.logins} />
          <SidebarItem label="Documents" icon="📄" active={filterType === 'document'} onClick={() => setFilterType('document')} count={stats.docs} />
          <SidebarItem label="Notes" icon="📝" active={filterType === 'note'} onClick={() => setFilterType('note')} count={stats.notes} />
          <div style={{ margin: '2rem 0', borderTop: '1px solid var(--border)' }} />
          <SidebarItem label="Vault Settings" icon="⚙️" onClick={() => setShowSettings(true)} />
        </nav>

        <div style={{
          marginTop: 'auto',
          padding: '1.5rem',
          borderRadius: '16px',
          backgroundColor: 'var(--bg-surface)',
          border: '1px solid var(--border)',
          boxShadow: '0 10px 20px rgba(0,0,0,0.2)'
        }}>
          <div style={{ fontSize: '0.75rem', color: 'var(--text-dim)', marginBottom: '0.75rem', fontWeight: 'bold', letterSpacing: '0.05em' }}>LOGGED IN AS</div>
          <div style={{ fontSize: '0.95rem', fontWeight: '800', marginBottom: '1.5rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {identity?.email}
          </div>
          <button onClick={logout} style={{
            width: '100%',
            padding: '0.75rem',
            borderRadius: '10px',
            border: '1px solid var(--error)',
            color: 'var(--error)',
            backgroundColor: 'transparent',
            fontSize: '0.85rem',
            fontWeight: '800'
          }}>
            Lock Vault
          </button>
        </div>
      </aside>

      {/* Main Content */}
      <main style={{ flex: 1, marginLeft: '300px', padding: '4rem', overflowY: 'auto' }}>
        <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '4rem' }}>
          <div style={{ flex: 1 }}>
            <h2 style={{ margin: 0, fontSize: '2.5rem', fontWeight: '900' }}>Your Vault</h2>
            <div style={{ display: 'flex', gap: '1rem', marginTop: '2rem', maxWidth: '700px' }}>
              <div style={{ position: 'relative', flex: 1 }}>
                <span style={{ position: 'absolute', left: '1.25rem', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-dim)', fontSize: '1.2rem' }}>🔍</span>
                <input
                  type="text"
                  placeholder="Search vault items..."
                  value={searchQuery}
                  onChange={e => setSearchQuery(e.target.value)}
                  style={{
                    width: '100%',
                    padding: '1rem 1.5rem 1rem 3.5rem',
                    borderRadius: '14px',
                    fontSize: '1.1rem',
                    backgroundColor: 'var(--bg-surface)',
                    border: '1px solid var(--border)',
                    boxShadow: '0 4px 12px rgba(0,0,0,0.1)'
                  }}
                />
                {searchQuery && (
                  <button
                    onClick={() => setSearchQuery('')}
                    style={{
                      position: 'absolute', right: '0.75rem', top: '50%', transform: 'translateY(-50%)',
                      background: 'var(--border)', border: 'none', color: '#fff', padding: '0.4rem',
                      borderRadius: '50%', width: '24px', height: '24px', display: 'flex', alignItems: 'center', justifyContent: 'center',
                      fontSize: '0.7rem'
                    }}
                  >✕</button>
                )}
              </div>
            </div>
          </div>
          <button
            onClick={() => setIsCreating(true)}
            style={{
              padding: '1rem 2rem',
              borderRadius: '12px',
              backgroundColor: 'var(--accent)',
              color: '#000',
              border: 'none',
              fontWeight: '900',
              fontSize: '1.1rem',
              boxShadow: '0 0 30px var(--accent-glow)',
              marginLeft: '2.5rem'
            }}
          >
            + Add New
          </button>
        </header>

        {filteredItems.length === 0 ? (
          <div style={{
            textAlign: 'center',
            padding: '5rem',
            border: '2px dashed var(--border)',
            borderRadius: '20px',
            color: 'var(--text-dim)'
          }}>
            <div style={{ fontSize: '3rem', marginBottom: '1rem' }}>{searchQuery ? '🧐' : '📭'}</div>
            <p>{searchQuery ? `No matches for "${searchQuery}"` : 'No items found in this category.'}</p>
            {searchQuery && (
              <button onClick={() => setSearchQuery('')} style={{ color: 'var(--accent)', background: 'none', border: 'none', fontWeight: 'bold' }}>
                Clear Search
              </button>
            )}
          </div>
        ) : (
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))',
            gap: '1.5rem'
          }}>
            {filteredItems.map(item => (
              <VaultCard
                key={item.id}
                item={item}
                onEdit={() => setEditingItem(item)}
                onDelete={() => deleteItem(item.id)}
              />
            ))}
          </div>
        )}
      </main>
    </div>
  );
}

function MobileVaultRow({ item, onEdit, onDelete }) {
  const icon = TYPE_ICONS[item.type] || '📁';
  const typeLabel = TYPE_LABELS[item.type] || item.type;

  return (
    <div
      className="mobile-list-row"
      onClick={onEdit}
    >
      <div style={{
        width: '44px',
        height: '44px',
        borderRadius: '12px',
        backgroundColor: 'var(--bg-surface)',
        border: '1px solid var(--border)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontSize: '1.3rem',
        flexShrink: 0
      }}>
        {icon}
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{
          fontWeight: '700',
          fontSize: '1rem',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
          color: 'var(--text-main)'
        }}>
          {item.name}
        </div>
        <div style={{
          fontSize: '0.78rem',
          color: 'var(--text-dim)',
          textTransform: 'uppercase',
          letterSpacing: '0.04em',
          marginTop: '3px'
        }}>
          {typeLabel}
        </div>
      </div>
      <div style={{ fontSize: '0.75rem', color: 'var(--text-dim)', flexShrink: 0, marginRight: '4px' }}>
        {new Date(item.updatedAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
      </div>
      <button
        onClick={e => { e.stopPropagation(); onDelete(); }}
        style={{
          background: 'none',
          border: 'none',
          color: 'var(--text-dim)',
          fontSize: '1rem',
          padding: '8px',
          flexShrink: 0,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center'
        }}
        aria-label="Delete item"
      >
        🗑️
      </button>
    </div>
  );
}

function BottomNavItem({ label, icon, active, count, onClick }) {
  return (
    <button
      onClick={onClick}
      style={{
        flex: 1,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        background: 'none',
        border: 'none',
        color: active ? 'var(--accent)' : 'var(--text-dim)',
        gap: '2px',
        padding: '4px 0 2px',
        fontSize: '0.62rem',
        fontWeight: active ? '700' : '400',
        transition: 'color 0.15s',
        position: 'relative',
        letterSpacing: '0.01em'
      }}
    >
      {active && (
        <div style={{
          position: 'absolute',
          top: 0,
          left: '20%',
          right: '20%',
          height: '2px',
          backgroundColor: 'var(--accent)',
          borderRadius: '0 0 2px 2px'
        }} />
      )}
      <span style={{ fontSize: '1.25rem', lineHeight: 1 }}>{icon}</span>
      <span>{label}</span>
      {count > 0 && !active && (
        <span style={{
          position: 'absolute',
          top: '4px',
          right: '14%',
          backgroundColor: 'var(--accent)',
          color: '#000',
          borderRadius: '10px',
          padding: '1px 5px',
          fontSize: '0.58rem',
          fontWeight: 'bold',
          lineHeight: 1.5,
          minWidth: '16px',
          textAlign: 'center'
        }}>
          {count > 99 ? '99+' : count}
        </span>
      )}
    </button>
  );
}

function SidebarItem({ label, icon, active, onClick, count }) {
  return (
    <div
      onClick={onClick}
      style={{
        display: 'flex',
        alignItems: 'center',
        padding: '1rem 1.25rem',
        borderRadius: '12px',
        marginBottom: '0.5rem',
        cursor: 'pointer',
        backgroundColor: active ? 'rgba(0, 212, 255, 0.1)' : 'transparent',
        color: active ? 'var(--accent)' : 'var(--text-main)',
        transition: 'all 0.2s',
        fontSize: '1rem',
        fontWeight: active ? '800' : '500'
      }}
    >
      <span style={{ marginRight: '1.25rem', fontSize: '1.2rem' }}>{icon}</span>
      <span style={{ flex: 1 }}>{label}</span>
      {count !== undefined && (
        <span style={{
          fontSize: '0.85rem',
          opacity: 0.8,
          fontWeight: 'bold',
          backgroundColor: 'rgba(255,255,255,0.05)',
          padding: '0.2rem 0.6rem',
          borderRadius: '20px'
        }}>
          {count}
        </span>
      )}
    </div>
  );
}

function VaultCard({ item, onEdit, onDelete }) {
  const icon = TYPE_ICONS[item.type] || '📁';

  return (
    <div
      className="animate-fade"
      style={{
        backgroundColor: 'var(--bg-surface)',
        border: '1px solid var(--border)',
        borderRadius: '16px',
        padding: '1.5rem',
        transition: 'all 0.3s',
        position: 'relative',
        cursor: 'pointer'
      }}
      onClick={onEdit}
      onMouseEnter={e => {
        e.currentTarget.style.borderColor = 'var(--accent)';
        e.currentTarget.style.transform = 'translateY(-5px)';
        e.currentTarget.style.boxShadow = '0 10px 30px rgba(0,0,0,0.5)';
      }}
      onMouseLeave={e => {
        e.currentTarget.style.borderColor = 'var(--border)';
        e.currentTarget.style.transform = 'translateY(0)';
        e.currentTarget.style.boxShadow = 'none';
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '1rem' }}>
        <div style={{ fontSize: '2rem' }}>{icon}</div>
        <button
          onClick={e => { e.stopPropagation(); if (confirm('Delete this item?')) onDelete(); }}
          style={{ background: 'none', border: 'none', color: 'var(--text-dim)', fontSize: '1rem', padding: '0.5rem' }}
        >
          🗑️
        </button>
      </div>
      <h3 style={{ margin: '0 0 0.25rem', fontSize: '1.1rem', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{item.name}</h3>
      <div style={{ fontSize: '0.75rem', color: 'var(--text-dim)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
        {item.type}
      </div>
      <div style={{ marginTop: '1.5rem', fontSize: '0.75rem', color: 'var(--text-dim)', borderTop: '1px solid var(--border)', paddingTop: '0.75rem' }}>
        Updated {new Date(item.updatedAt).toLocaleDateString()}
      </div>
    </div>
  );
}
