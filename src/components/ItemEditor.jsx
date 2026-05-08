import React, { useState, useEffect, useRef } from 'react';
import { Capacitor } from '@capacitor/core';
import { Filesystem, Directory } from '@capacitor/filesystem';
import { useVault } from '../store/vault.jsx';
import { api } from '../api/client.js';
import { base64Encode, base64Decode } from '../crypto/util.js';
import { DocumentScanner } from '../plugins/DocumentScanner.js';

const IS_ANDROID = Capacitor.getPlatform() === 'android';

export function ItemEditor({ item, onClose }) {
  const { addItem, updateItem, getItemFull, mek } = useVault();

  const isNew = !item;
  const [loading, setLoading] = useState(!isNew);
  const [itemId] = useState(() => item?.id || crypto.randomUUID());
  const [name, setName] = useState(item?.name || '');
  const [type, setType] = useState(item?.type || 'login');
  const [fields, setFields] = useState([]);
  const [attachments, setAttachments] = useState([]);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const [scanning, setScanning] = useState(false);

  const fileInputRef = useRef(null);

  useEffect(() => {
    if (!isNew) {
      getItemFull(item.id).then(data => {
        setName(data.name || '');
        setType(data.type || 'login');
        setFields(data.fields || []);
        setAttachments(data.attachmentRefs || []);
        setLoading(false);
      });
    }
  }, [isNew, item?.id, getItemFull]);

  const handleSave = async (e) => {
    e.preventDefault();
    setError('');
    setSaving(true);
    try {
      const payload = {
        id: itemId,
        name,
        type,
        updatedAt: new Date().toISOString(),
        fields,
        attachmentRefs: attachments
      };
      if (isNew) {
        await addItem(payload);
      } else {
        await updateItem(payload);
      }
      onClose();
    } catch (err) {
      setError('Save failed: ' + err.message);
    } finally {
      setSaving(false);
    }
  };

  const addField = () => setFields(f => [...f, { label: '', value: '', sensitive: false }]);
  const updateField = (index, key, value) => {
    setFields(f => f.map((field, i) => i === index ? { ...field, [key]: value } : field));
  };
  const removeField = (index) => setFields(f => f.filter((_, i) => i !== index));

  const encryptAndUpload = async (bytes, filename) => {
    const docKey = await crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, true, ['encrypt', 'decrypt']);
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const ciphertext = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, docKey, bytes);
    const rawDocKey = await crypto.subtle.exportKey('raw', docKey);
    const docKeyIv = crypto.getRandomValues(new Uint8Array(12));
    const encryptedDocKey = await crypto.subtle.encrypt({ name: 'AES-GCM', iv: docKeyIv }, mek, rawDocKey);
    const { uploadUrl, fileId } = await api.getUploadUrl(filename, ciphertext.byteLength);
    await api.uploadFile(uploadUrl, ciphertext);
    return { fileId, filename, encryptedKeyB64: base64Encode(encryptedDocKey), keyIv: base64Encode(docKeyIv), iv: base64Encode(iv) };
  };

  const handleFileUpload = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    if (file.size > 20 * 1024 * 1024) {
      setError('File too large. Maximum size is 20MB.');
      return;
    }
    try {
      const buffer = await file.arrayBuffer();
      const ref = await encryptAndUpload(new Uint8Array(buffer), file.name);
      setAttachments(a => [...a, ref]);
    } catch (err) {
      setError('Upload failed: ' + err.message);
    }
  };

  const handleScanDocument = async () => {
    setError('');
    setScanning(true);
    try {
      const result = await DocumentScanner.scanDocument();
      const { pdfBase64 } = result;

      const binaryStr = atob(pdfBase64);
      const bytes = new Uint8Array(binaryStr.length);
      for (let i = 0; i < binaryStr.length; i++) bytes[i] = binaryStr.charCodeAt(i);

      const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
      const filename = `scan_${timestamp}.pdf`;

      const ref = await encryptAndUpload(bytes, filename);
      setAttachments(a => [...a, ref]);
      if (type === 'login' || type === 'note') setType('document');
    } catch (err) {
      if (!err.message?.toLowerCase().includes('cancel')) {
        setError('Scan failed: ' + err.message);
      }
    } finally {
      setScanning(false);
    }
  };

  const downloadAttachment = async (ref) => {
    try {
      const encryptedBytes = await api.downloadFile(ref.fileId);
      const rawDocKeyBytes = await crypto.subtle.decrypt(
        { name: 'AES-GCM', iv: base64Decode(ref.keyIv) }, mek, base64Decode(ref.encryptedKeyB64)
      );
      const docKey = await crypto.subtle.importKey('raw', rawDocKeyBytes, { name: 'AES-GCM', length: 256 }, false, ['decrypt']);
      const decryptedBytes = await crypto.subtle.decrypt(
        { name: 'AES-GCM', iv: base64Decode(ref.iv) }, docKey, encryptedBytes
      );

      if (Capacitor.isNativePlatform()) {
        await Filesystem.writeFile({ path: ref.filename, data: base64Encode(decryptedBytes), directory: Directory.Documents });
        alert(`Saved to Documents: ${ref.filename}`);
      } else {
        const blob = new Blob([decryptedBytes], { type: 'application/octet-stream' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = ref.filename;
        a.click();
      }
    } catch (err) {
      setError('Download failed: ' + err.message);
    }
  };

  if (loading) {
    return (
      <div style={{
        position: 'fixed', inset: 0, zIndex: 1000,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        backgroundColor: 'var(--bg-deep)', color: 'var(--text-dim)'
      }}>
        Decrypting...
      </div>
    );
  }

  if (IS_ANDROID) {
    return (
      <div style={{
        position: 'fixed', inset: 0, zIndex: 1000,
        display: 'flex', flexDirection: 'column',
        backgroundColor: 'var(--bg-deep)',
        paddingTop: 'env(safe-area-inset-top)',
        paddingBottom: 'env(safe-area-inset-bottom)'
      }}>
        {/* Top bar */}
        <header style={{
          display: 'flex',
          alignItems: 'center',
          padding: '0 8px 0 4px',
          height: '64px',
          backgroundColor: '#000',
          borderBottom: '1px solid var(--border)',
          flexShrink: 0,
          gap: '4px'
        }}>
          <button
            type="button"
            onClick={onClose}
            className="icon-btn"
            style={{ color: 'var(--text-dim)', fontSize: '1.4rem' }}
            aria-label="Go back"
          >
            ←
          </button>
          <h2 style={{ flex: 1, margin: 0, fontSize: '1.1rem', fontWeight: '800' }}>
            {isNew ? 'New Entry' : 'Edit Entry'}
          </h2>
          <button
            type="button"
            onClick={handleSave}
            disabled={saving}
            style={{
              padding: '8px 18px',
              borderRadius: '20px',
              backgroundColor: 'var(--accent)',
              color: '#000',
              border: 'none',
              fontWeight: '800',
              fontSize: '0.9rem',
              opacity: saving ? 0.7 : 1,
              marginRight: '8px'
            }}
          >
            {saving ? 'Saving…' : 'Save'}
          </button>
        </header>

        {/* Scrollable form body */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '16px' }}>
          {error && (
            <div style={{
              color: 'var(--error)',
              backgroundColor: 'rgba(255,77,77,0.1)',
              padding: '12px 16px',
              borderRadius: '10px',
              marginBottom: '16px',
              fontSize: '0.9rem'
            }}>
              {error}
            </div>
          )}

          {/* Title */}
          <div style={{ marginBottom: '16px' }}>
            <label className="field-label">TITLE</label>
            <input
              type="text"
              value={name}
              onChange={e => setName(e.target.value)}
              required
              placeholder="Entry name"
              style={{ width: '100%', padding: '12px 14px', fontSize: '1rem' }}
            />
          </div>

          {/* Type */}
          <div style={{ marginBottom: '24px' }}>
            <label className="field-label">TYPE</label>
            <select
              value={type}
              onChange={e => setType(e.target.value)}
              style={{
                width: '100%', padding: '12px 14px',
                backgroundColor: '#000', border: '1px solid var(--border)',
                color: '#fff', borderRadius: '10px', fontSize: '1rem'
              }}
            >
              <option value="entity">Entity (Person / Folder)</option>
              <option value="login">Password</option>
              <option value="document">Document</option>
              <option value="identity">Identity</option>
              <option value="note">Secure Note</option>
            </select>
          </div>

          {/* Fields */}
          <div style={{ marginBottom: '8px', fontSize: '0.85rem', color: 'var(--text-dim)', fontWeight: '700', letterSpacing: '0.05em', textTransform: 'uppercase' }}>
            Fields
          </div>
          {fields.map((f, i) => (
            <div key={i} style={{ backgroundColor: 'var(--bg-surface)', borderRadius: '12px', border: '1px solid var(--border)', padding: '12px', marginBottom: '10px' }}>
              <div style={{ display: 'flex', gap: '8px', marginBottom: '8px' }}>
                <input
                  placeholder="Label"
                  value={f.label}
                  onChange={e => updateField(i, 'label', e.target.value)}
                  style={{ flex: 1, padding: '9px 12px', fontSize: '0.9rem' }}
                />
                <button
                  type="button"
                  onClick={() => updateField(i, 'sensitive', !f.sensitive)}
                  style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: '8px', padding: '0 12px', fontSize: '1rem' }}
                >
                  {f.sensitive ? '👁️' : '🕶️'}
                </button>
                <button
                  type="button"
                  onClick={() => removeField(i)}
                  style={{ background: 'none', border: 'none', color: 'var(--error)', padding: '0 8px', fontSize: '1rem' }}
                >
                  ✕
                </button>
              </div>
              <input
                type={f.sensitive ? 'password' : 'text'}
                placeholder="Value"
                value={f.value}
                onChange={e => updateField(i, 'value', e.target.value)}
                style={{ width: '100%', padding: '9px 12px', fontSize: '0.95rem' }}
              />
            </div>
          ))}
          <button
            type="button"
            onClick={addField}
            style={{ color: 'var(--accent)', background: 'none', border: 'none', padding: '8px 0', fontWeight: '800', fontSize: '0.95rem' }}
          >
            + Add Field
          </button>

          {/* Attachments */}
          <div style={{ marginTop: '28px', marginBottom: '8px', fontSize: '0.85rem', color: 'var(--text-dim)', fontWeight: '700', letterSpacing: '0.05em', textTransform: 'uppercase' }}>
            Attachments
          </div>
          {attachments.map((ref, i) => (
            <div key={i} style={{
              display: 'flex',
              alignItems: 'center',
              padding: '12px 14px',
              backgroundColor: 'var(--bg-surface)',
              borderRadius: '12px',
              marginBottom: '8px',
              border: '1px solid var(--border)',
              gap: '10px'
            }}>
              <span style={{ fontSize: '1.2rem' }}>
                {ref.filename.endsWith('.pdf') ? '📄' : '📎'}
              </span>
              <span style={{ flex: 1, fontSize: '0.9rem', fontWeight: '600', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {ref.filename}
              </span>
              <button
                type="button"
                onClick={() => downloadAttachment(ref)}
                style={{ background: 'rgba(0,229,255,0.1)', border: 'none', color: 'var(--accent)', padding: '6px 12px', borderRadius: '8px', fontWeight: 'bold', fontSize: '0.8rem', flexShrink: 0 }}
              >
                Save
              </button>
              <button
                type="button"
                onClick={() => setAttachments(a => a.filter((_, idx) => idx !== i))}
                style={{ background: 'none', border: 'none', color: 'var(--error)', padding: '6px', fontSize: '0.85rem', flexShrink: 0 }}
              >
                ✕
              </button>
            </div>
          ))}

          {/* Scan button (Android only) */}
          <button
            type="button"
            onClick={handleScanDocument}
            disabled={scanning}
            style={{
              width: '100%',
              padding: '14px',
              borderRadius: '12px',
              border: '1px solid var(--accent)',
              backgroundColor: 'rgba(0,229,255,0.06)',
              color: 'var(--accent)',
              fontWeight: '700',
              fontSize: '0.95rem',
              marginTop: '10px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '8px',
              opacity: scanning ? 0.7 : 1
            }}
          >
            <span>📷</span>
            {scanning ? 'Opening scanner…' : 'Scan Document'}
          </button>

          <input type="file" ref={fileInputRef} style={{ display: 'none' }} onChange={handleFileUpload} />
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            style={{
              width: '100%',
              padding: '14px',
              border: '1px dashed var(--border)',
              background: 'rgba(255,255,255,0.02)',
              color: 'var(--text-dim)',
              borderRadius: '12px',
              marginTop: '10px',
              fontWeight: '600',
              fontSize: '0.9rem',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '8px'
            }}
          >
            <span>📎</span> Upload File
          </button>

          {/* Bottom spacing for safe area */}
          <div style={{ height: '24px' }} />
        </div>
      </div>
    );
  }

  // Desktop / web layout
  return (
    <div className="glass" style={{
      position: 'fixed', top: 0, right: 0, bottom: 0, left: 0,
      zIndex: 1000, display: 'flex', justifyContent: 'center', alignItems: 'center',
      padding: '2rem'
    }}>
      <div className="animate-fade" style={{
        backgroundColor: 'var(--bg-surface)',
        width: '100%', maxWidth: '700px',
        maxHeight: '90vh', overflowY: 'auto',
        borderRadius: '20px', border: '1px solid var(--border)',
        padding: '2.5rem'
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2.5rem' }}>
          <h2 style={{ margin: 0, fontSize: '1.75rem', fontWeight: '900' }}>{isNew ? 'New Vault Entry' : 'Edit Entry'}</h2>
          <button
            onClick={onClose}
            style={{ background: 'var(--border)', border: 'none', color: '#fff', fontSize: '0.8rem', width: '32px', height: '32px', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
          >
            ✕
          </button>
        </div>

        <form onSubmit={handleSave}>
          {error && (
            <div style={{ color: 'var(--error)', backgroundColor: 'rgba(255,77,77,0.1)', padding: '1rem', borderRadius: '8px', marginBottom: '1.5rem' }}>
              {error}
            </div>
          )}

          <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: '1.5rem', marginBottom: '2.5rem' }}>
            <div>
              <label style={{ display: 'block', fontSize: '0.75rem', color: 'var(--text-dim)', marginBottom: '0.6rem', fontWeight: 'bold', letterSpacing: '0.05em' }}>TITLE</label>
              <input type="text" value={name} onChange={e => setName(e.target.value)} required style={{ width: '100%', padding: '1rem' }} />
            </div>
            <div>
              <label style={{ display: 'block', fontSize: '0.75rem', color: 'var(--text-dim)', marginBottom: '0.6rem', fontWeight: 'bold', letterSpacing: '0.05em' }}>TYPE</label>
              <select value={type} onChange={e => setType(e.target.value)} style={{ width: '100%', padding: '1rem', backgroundColor: '#000', border: '1px solid var(--border)', color: '#fff', borderRadius: '10px' }}>
                <option value="entity">Entity (Person/Folder)</option>
                <option value="login">Password</option>
                <option value="document">Document</option>
                <option value="identity">Identity</option>
                <option value="note">Secure Note</option>
              </select>
            </div>
          </div>

          <h3 style={{ fontSize: '1.1rem', borderBottom: '1px solid var(--border)', paddingBottom: '0.75rem', marginBottom: '1.5rem', fontWeight: '800' }}>Fields</h3>
          {fields.map((f, i) => (
            <div key={i} style={{ display: 'flex', gap: '0.75rem', marginBottom: '1rem' }}>
              <input placeholder="Label" value={f.label} onChange={e => updateField(i, 'label', e.target.value)} style={{ flex: 1, padding: '0.85rem' }} />
              <input type={f.sensitive ? 'password' : 'text'} placeholder="Value" value={f.value} onChange={e => updateField(i, 'value', e.target.value)} style={{ flex: 2, padding: '0.85rem' }} />
              <button type="button" onClick={() => updateField(i, 'sensitive', !f.sensitive)} style={{ background: 'var(--bg-surface)', border: '1px solid var(--border)', borderRadius: '8px', padding: '0 0.75rem' }}>{f.sensitive ? '👁️' : '🕶️'}</button>
              <button type="button" onClick={() => removeField(i)} style={{ background: 'none', border: 'none', color: 'var(--error)', padding: '0 0.5rem' }}>✕</button>
            </div>
          ))}
          <button type="button" onClick={addField} style={{ color: 'var(--accent)', background: 'none', border: 'none', padding: '0.5rem 0', fontWeight: '800', fontSize: '0.95rem' }}>+ Add Custom Field</button>

          <h3 style={{ fontSize: '1.1rem', borderBottom: '1px solid var(--border)', paddingBottom: '0.75rem', marginBottom: '1.5rem', marginTop: '3rem', fontWeight: '800' }}>Attachments</h3>
          {attachments.map((ref, i) => (
            <div key={i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '1rem', backgroundColor: '#000', borderRadius: '12px', marginBottom: '0.75rem', border: '1px solid var(--border)' }}>
              <span style={{ fontWeight: '600' }}>{ref.filename}</span>
              <div>
                <button type="button" onClick={() => downloadAttachment(ref)} style={{ background: 'rgba(0, 212, 255, 0.1)', border: 'none', color: 'var(--accent)', marginRight: '0.75rem', padding: '0.5rem 1rem', borderRadius: '8px', fontWeight: 'bold', fontSize: '0.85rem' }}>Download</button>
                <button type="button" onClick={() => setAttachments(a => a.filter((_, idx) => idx !== i))} style={{ background: 'none', border: 'none', color: 'var(--error)', padding: '0.5rem', fontSize: '0.85rem' }}>Remove</button>
              </div>
            </div>
          ))}
          <input type="file" ref={fileInputRef} style={{ display: 'none' }} onChange={handleFileUpload} />
          <button type="button" onClick={() => fileInputRef.current?.click()} style={{ width: '100%', padding: '1.5rem', border: '2px dashed var(--border)', background: 'rgba(255,255,255,0.02)', color: 'var(--text-dim)', borderRadius: '14px', marginTop: '0.5rem', fontWeight: '600' }}>
            Drop or click to upload encrypted file
          </button>

          <div style={{ display: 'flex', gap: '1.25rem', marginTop: '4rem' }}>
            <button type="button" onClick={onClose} style={{ flex: 1, padding: '1.1rem', borderRadius: '12px', background: 'var(--bg-deep)', border: '1px solid var(--border)', color: '#fff', fontWeight: '600' }}>Cancel</button>
            <button type="submit" disabled={saving} style={{
              flex: 2, padding: '1.1rem', borderRadius: '12px',
              backgroundColor: 'var(--accent)', color: '#000',
              border: 'none', fontWeight: '900', fontSize: '1.1rem',
              boxShadow: '0 10px 30px var(--accent-glow)',
              opacity: saving ? 0.7 : 1
            }}>
              {saving ? 'Saving...' : 'Save Vault Entry'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
