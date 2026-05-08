import React, { useState, useMemo } from 'react';
import { useVault } from '../store/vault.jsx';
import { ItemEditor } from './ItemEditor.jsx';
import { Settings } from './Settings.jsx';

export function Vault() {
  const { items, logout, deleteItem, identity } = useVault();
  const [editingItem, setEditingItem] = useState(null);
  const [isCreating, setIsCreating] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [filterType, setFilterType] = useState('all');
  const [searchQuery, setSearchQuery] = useState('');

  // Optimized Search & Filter Logic
  const filteredItems = useMemo(() => {
    return items.filter(item => {
      const matchesType = filterType === 'all' || item.type === filterType;
      const matchesSearch = item.name.toLowerCase().includes(searchQuery.toLowerCase());
      return matchesType && matchesSearch;
    });
  }, [items, filterType, searchQuery]);

  const stats = {
    total: items.length,
    logins: items.filter(i => i.type === 'login').length,
    docs: items.filter(i => i.type === 'document').length,
    notes: items.filter(i => i.type === 'note').length,
  };

  if (showSettings) {
    return <Settings onBack={() => setShowSettings(false)} />;
  }

  if (editingItem || isCreating) {
    return (
      <ItemEditor
        item={editingItem}
        onClose={() => { setEditingItem(null); setIsCreating(false); }}
      />
    );
  }

  return (
    <div style={{ display: 'flex', minHeight: '100vh', backgroundColor: 'var(--bg-deep)' }}>
      {/* Sidebar */}
      <aside style={{ 
        width: '280px', 
        borderRight: '1px solid var(--border)', 
        padding: '2rem 1.5rem',
        display: 'flex',
        flexDirection: 'column',
        position: 'fixed',
        height: '100vh'
      }}>
        <h1 style={{ color: 'var(--accent)', fontSize: '1.5rem', marginBottom: '2rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <span style={{ fontSize: '1.2rem' }}>🛡️</span> SecureStore
        </h1>
        
        <nav style={{ flex: 1 }}>
          <SidebarItem label="All Items" icon="📦" active={filterType === 'all'} onClick={() => setFilterType('all')} count={stats.total} />
          <SidebarItem label="Entities" icon="📂" active={filterType === 'entity'} onClick={() => setFilterType('entity')} count={items.filter(i => i.type === 'entity').length} />
          <SidebarItem label="Passwords" icon="🔑" active={filterType === 'login'} onClick={() => setFilterType('login')} count={stats.logins} />
          <SidebarItem label="Documents" icon="📄" active={filterType === 'document'} onClick={() => setFilterType('document')} count={stats.docs} />
          <SidebarItem label="Notes" icon="📝" active={filterType === 'note'} onClick={() => setFilterType('note')} count={stats.notes} />
          <div style={{ margin: '1rem 0', borderTop: '1px solid var(--border)' }} />
          <SidebarItem label="Settings" icon="⚙️" onClick={() => setShowSettings(true)} />
        </nav>

        <div style={{ 
          marginTop: 'auto', 
          padding: '1rem', 
          borderRadius: '12px', 
          backgroundColor: 'var(--bg-surface)',
          border: '1px solid var(--border)'
        }}>
          <div style={{ fontSize: '0.8rem', color: 'var(--text-dim)', marginBottom: '0.5rem' }}>LOGGED IN AS</div>
          <div style={{ fontSize: '0.9rem', fontWeight: 'bold', marginBottom: '1rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {identity?.email}
          </div>
          <button onClick={logout} style={{ 
            width: '100%', 
            padding: '0.5rem', 
            borderRadius: '6px', 
            border: '1px solid var(--error)', 
            color: 'var(--error)',
            backgroundColor: 'transparent',
            fontSize: '0.8rem',
            fontWeight: 'bold'
          }}>Lock Vault</button>
        </div>
      </aside>

      {/* Main Content */}
      <main style={{ flex: 1, marginLeft: '280px', padding: '3rem', overflowY: 'auto' }}>
        <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '3rem' }}>
          <div style={{ flex: 1 }}>
            <h2 style={{ margin: 0, fontSize: '2rem' }}>Your Vault</h2>
            <div style={{ display: 'flex', gap: '1rem', marginTop: '1.5rem', maxWidth: '600px' }}>
              <div style={{ position: 'relative', flex: 1 }}>
                <span style={{ position: 'absolute', left: '1rem', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-dim)' }}>🔍</span>
                <input 
                  type="text" 
                  placeholder="Search vault items..." 
                  value={searchQuery}
                  onChange={e => setSearchQuery(e.target.value)}
                  style={{ 
                    width: '100%', 
                    padding: '0.8rem 1rem 0.8rem 2.8rem', 
                    borderRadius: '10px', 
                    fontSize: '1rem',
                    backgroundColor: 'var(--bg-surface)'
                  }} 
                />
                {searchQuery && (
                  <button 
                    onClick={() => setSearchQuery('')}
                    style={{ 
                      position: 'absolute', right: '0.5rem', top: '50%', transform: 'translateY(-50%)', 
                      background: 'none', border: 'none', color: 'var(--text-dim)', padding: '0.5rem' 
                    }}
                  >
                    ✕
                  </button>
                )}
              </div>
            </div>
          </div>
          <button 
            onClick={() => setIsCreating(true)} 
            style={{ 
              padding: '0.8rem 1.5rem', 
              borderRadius: '8px', 
              backgroundColor: 'var(--accent)', 
              color: '#000', 
              border: 'none', 
              fontWeight: 'bold',
              boxShadow: '0 0 20px var(--accent-glow)',
              marginLeft: '2rem'
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
            {searchQuery && <button onClick={() => setSearchQuery('')} style={{ color: 'var(--accent)', background: 'none', border: 'none', fontWeight: 'bold' }}>Clear Search</button>}
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

function SidebarItem({ label, icon, active, onClick, count }) {
  return (
    <div 
      onClick={onClick}
      style={{ 
        display: 'flex', 
        alignItems: 'center', 
        padding: '0.75rem 1rem', 
        borderRadius: '8px', 
        marginBottom: '0.5rem',
        cursor: 'pointer',
        backgroundColor: active ? 'rgba(0, 212, 255, 0.1)' : 'transparent',
        color: active ? 'var(--accent)' : 'var(--text-main)',
        transition: 'all 0.2s',
        fontSize: '0.95rem'
      }}
    >
      <span style={{ marginRight: '1rem' }}>{icon}</span>
      <span style={{ flex: 1 }}>{label}</span>
      {count !== undefined && <span style={{ fontSize: '0.8rem', opacity: 0.6 }}>{count}</span>}
    </div>
  );
}

function VaultCard({ item, onEdit, onDelete }) {
  const icon = item.type === 'entity' ? '📂' : item.type === 'login' ? '🔑' : item.type === 'document' ? '📄' : '📝';
  
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
      onMouseEnter={(e) => {
        e.currentTarget.style.borderColor = 'var(--accent)';
        e.currentTarget.style.transform = 'translateY(-5px)';
        e.currentTarget.style.boxShadow = '0 10px 30px rgba(0,0,0,0.5)';
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.borderColor = 'var(--border)';
        e.currentTarget.style.transform = 'translateY(0)';
        e.currentTarget.style.boxShadow = 'none';
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '1rem' }}>
        <div style={{ fontSize: '2rem' }}>{icon}</div>
        <button onClick={(e) => { e.stopPropagation(); if(confirm('Delete this item?')) onDelete(); }} style={{ 
          background: 'none', border: 'none', color: 'var(--text-dim)', fontSize: '1rem', padding: '0.5rem'
        }}>🗑️</button>
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
