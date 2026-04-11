import React, { useState, useEffect, useRef } from 'react';
import { useVault } from '../store/vault.jsx';
import { api } from '../api/client.js';
import { base64Encode, base64Decode } from '../crypto/util.js';

export function ItemEditor({ item, onClose }) {
  const { addItem, updateItem, getItemFull, mek } = useVault();

  const isNew = !item;
  const [loading, setLoading] = useState(!isNew);
  const [fullItem, setFullItem] = useState(null);

  const [itemId] = useState(() => item?.id || crypto.randomUUID());
  const [name, setName] = useState(item?.name || '');
  const [type, setType] = useState(item?.type || 'login');
  const [fields, setFields] = useState([]);
  const [attachments, setAttachments] = useState([]);

  const fileInputRef = useRef(null);

  useEffect(() => {
    if (!isNew) {
      getItemFull(item.id).then(data => {
        setFullItem(data);
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
  };

  const addField = () => {
    setFields([...fields, { label: '', value: '', sensitive: false }]);
  };

  const updateField = (index, key, value) => {
    const newFields = [...fields];
    newFields[index][key] = value;
    setFields(newFields);
  };

  const removeField = (index) => {
    setFields(fields.filter((_, i) => i !== index));
  };

  // --- Attachments Logic ---

  const handleFileUpload = async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    try {
      const buffer = await file.arrayBuffer();
      const fileBytes = new Uint8Array(buffer);

      // 1. Generate document specific AES-GCM key
      const docKey = await crypto.subtle.generateKey(
        { name: "AES-GCM", length: 256 },
        true,
        ["encrypt", "decrypt"]
      );

      // 2. Encrypt the file payload
      const iv = crypto.getRandomValues(new Uint8Array(12));
      const ciphertext = await crypto.subtle.encrypt(
        { name: "AES-GCM", iv },
        docKey,
        fileBytes
      );

      // 3. Wrap the document key with the MEK using AES-GCM
      const rawDocKey = await crypto.subtle.exportKey("raw", docKey);
      const docKeyIv = crypto.getRandomValues(new Uint8Array(12));
      const encryptedDocKey = await crypto.subtle.encrypt(
        { name: "AES-GCM", iv: docKeyIv },
        mek,
        rawDocKey
      );

      // 4. Request upload URL
      const { uploadUrl, fileId } = await api.getUploadUrl(itemId, file.name, file.size);

      // 5. Upload the encrypted blob
      await api.uploadFile(uploadUrl, ciphertext);

      // 6. Save the attachment ref
      const newRef = {
        fileId,
        filename: file.name,
        encryptedKeyB64: base64Encode(encryptedDocKey),
        keyIv: base64Encode(docKeyIv),
        iv: base64Encode(iv)
      };

      setAttachments([...attachments, newRef]);

    } catch (err) {
      console.error(err);
      alert('Upload failed: ' + err.message);
    }
  };

  const downloadAttachment = async (ref) => {
    try {
      if (!itemId) throw new Error("Save item first before downloading");

      // 1. Download encrypted blob
      const encryptedBytes = await api.downloadFile(itemId, ref.fileId);

      // 2. Decrypt the document key using MEK
      const rawDocKeyBytes = await crypto.subtle.decrypt(
        { name: "AES-GCM", iv: base64Decode(ref.keyIv) },
        mek,
        base64Decode(ref.encryptedKeyB64)
      );

      const docKey = await crypto.subtle.importKey(
        "raw", rawDocKeyBytes,
        { name: "AES-GCM", length: 256 },
        false,
        ["decrypt"]
      );

      // 3. Decrypt the file
      const decryptedBytes = await crypto.subtle.decrypt(
        { name: "AES-GCM", iv: base64Decode(ref.iv) },
        docKey,
        encryptedBytes
      );

      // 4. Trigger download in browser
      const blob = new Blob([decryptedBytes], { type: 'application/octet-stream' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = ref.filename;
      a.click();
      URL.revokeObjectURL(url);

    } catch (err) {
      console.error(err);
      alert('Download failed: ' + err.message);
    }
  };

  const removeAttachment = (index) => {
    setAttachments(attachments.filter((_, i) => i !== index));
  };

  if (loading) return <div>Loading item...</div>;

  return (
    <div style={{ maxWidth: 600, margin: '2rem auto', padding: '1rem', border: '1px solid #ccc' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <h2>{isNew ? 'New Item' : 'Edit Item'}</h2>
        <button onClick={onClose}>Back</button>
      </div>

      <form onSubmit={handleSave}>
        <div style={{ marginBottom: '1rem' }}>
          <label style={{ display: 'block' }}>Name</label>
          <input
            type="text"
            value={name}
            onChange={e => setName(e.target.value)}
            required
            style={{ width: '100%', padding: '0.5rem', boxSizing: 'border-box' }}
          />
        </div>

        <div style={{ marginBottom: '1rem' }}>
          <label style={{ display: 'block' }}>Type</label>
          <select
            value={type}
            onChange={e => setType(e.target.value)}
            style={{ width: '100%', padding: '0.5rem', boxSizing: 'border-box' }}
          >
            <option value="login">Login / Password</option>
            <option value="document">Document / Attachment</option>
            <option value="identity">Identity / SSN</option>
            <option value="note">Secure Note</option>
          </select>
        </div>

        <h3>Fields</h3>
        {fields.map((f, i) => (
          <div key={i} style={{ display: 'flex', gap: '0.5rem', marginBottom: '0.5rem', alignItems: 'center' }}>
            <input
              type="text"
              placeholder="Label (e.g. SSN)"
              value={f.label}
              onChange={e => updateField(i, 'label', e.target.value)}
              style={{ flex: 1 }}
            />
            <input
              type={f.sensitive ? 'password' : 'text'}
              placeholder="Value"
              value={f.value}
              onChange={e => updateField(i, 'value', e.target.value)}
              style={{ flex: 2 }}
            />
            <label>
              <input
                type="checkbox"
                checked={f.sensitive}
                onChange={e => updateField(i, 'sensitive', e.target.checked)}
              /> Sensitive
            </label>
            <button type="button" onClick={() => removeField(i)}>X</button>
          </div>
        ))}
        <button type="button" onClick={addField} style={{ marginBottom: '1rem' }}>+ Add Field</button>

        <hr />

        <h3>Attachments</h3>
        {attachments.map((ref, i) => (
          <div key={i} style={{ display: 'flex', gap: '0.5rem', marginBottom: '0.5rem', alignItems: 'center' }}>
            <span style={{ flex: 1 }}>{ref.filename}</span>
            <button type="button" onClick={() => downloadAttachment(ref)}>Download</button>
            <button type="button" onClick={() => removeAttachment(i)} style={{ color: 'red' }}>Remove</button>
          </div>
        ))}
        <input
          type="file"
          ref={fileInputRef}
          style={{ display: 'none' }}
          onChange={handleFileUpload}
        />
        <button type="button" onClick={() => fileInputRef.current?.click()} style={{ marginBottom: '1rem' }}>
          Upload File
        </button>

        <div style={{ marginTop: '2rem' }}>
          <button type="submit" style={{ width: '100%', padding: '0.5rem', fontWeight: 'bold' }}>Save Item</button>
        </div>
      </form>
    </div>
  );
}
