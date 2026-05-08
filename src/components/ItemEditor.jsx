import React, { useState, useEffect, useRef } from 'react';
import { useVault } from '../store/vault.jsx';
import { api } from '../api/client.js';
import { base64Encode, base64Decode } from '../crypto/util.js';

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

  const addField = () => setFields([...fields, { label: '', value: '', sensitive: false }]);
  const updateField = (index, key, value) => {
    const newFields = [...fields];
    newFields[index][key] = value;
    setFields(newFields);
  };
  const removeField = (index) => setFields(fields.filter((_, i) => i !== index));

  const handleFileUpload = async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    const MAX_SIZE = 20 * 1024 * 1024; // 20MB
    if (file.size > MAX_SIZE) {
      setError('File too large. Maximum size is 20MB.');
      return;
    }

    try {
      const buffer = await file.arrayBuffer();
      const fileBytes = new Uint8Array(buffer);
      const docKey = await crypto.subtle.generateKey({ name: "AES-GCM", length: 256 }, true, ["encrypt", "decrypt"]);
      const iv = crypto.getRandomValues(new Uint8Array(12));
      const ciphertext = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, docKey, fileBytes);
      const rawDocKey = await crypto.subtle.exportKey("raw", docKey);
      const docKeyIv = crypto.getRandomValues(new Uint8Array(12));
      const encryptedDocKey = await crypto.subtle.encrypt({ name: "AES-GCM", iv: docKeyIv }, mek, rawDocKey);
      const { uploadUrl, fileId } = await api.getUploadUrl(file.name, file.size);
      await api.uploadFile(uploadUrl, ciphertext);
      setAttachments([...attachments, {
        fileId, filename: file.name, encryptedKeyB64: base64Encode(encryptedDocKey), keyIv: base64Encode(docKeyIv), iv: base64Encode(iv)
      }]);
    } catch (err) {
      setError('Upload failed: ' + err.message);
    }
  };

  const downloadAttachment = async (ref) => {
    try {
      const encryptedBytes = await api.downloadFile(ref.fileId);
      const rawDocKeyBytes = await crypto.subtle.decrypt({ name: "AES-GCM", iv: base64Decode(ref.keyIv) }, mek, base64Decode(ref.encryptedKeyB64));
      const docKey = await crypto.subtle.importKey("raw", rawDocKeyBytes, { name: "AES-GCM", length: 256 }, false, ["decrypt"]);
      const decryptedBytes = await crypto.subtle.decrypt({ name: "AES-GCM", iv: base64Decode(ref.iv) }, docKey, encryptedBytes);
      const blob = new Blob([decryptedBytes], { type: 'application/octet-stream' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = ref.filename;
      a.click();
    } catch (err) {
      setError('Download failed: ' + err.message);
    }
  };

  if (loading) return <div style={{ color: '#fff', textAlign: 'center', padding: '5rem' }}>Loading decrypting...</div>;

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
          <button onClick={onClose} style={{ background: 'var(--border)', border: 'none', color: '#fff', fontSize: '0.8rem', width: '32px', height: '32px', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>✕</button>
        </div>

        <form onSubmit={handleSave}>
          {error && <div style={{ color: 'var(--error)', backgroundColor: 'rgba(255,77,77,0.1)', padding: '1rem', borderRadius: '8px', marginBottom: '1.5rem' }}>{error}</div>}
          
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
                <button type="button" onClick={() => setAttachments(attachments.filter((_, idx) => idx !== i))} style={{ background: 'none', border: 'none', color: 'var(--error)', padding: '0.5rem', fontSize: '0.85rem' }}>Remove</button>
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
