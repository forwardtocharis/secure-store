const API_BASE = '/api';

export class VaultAPI {
  constructor(token = null) {
    this.token = token;
  }

  setToken(token) {
    this.token = token;
  }

  get headers() {
    const h = { 'Content-Type': 'application/json' };
    if (this.token) {
      h['Authorization'] = `Bearer ${this.token}`;
    }
    return h;
  }

  async _fetch(path, options = {}) {
    const res = await fetch(`${API_BASE}${path}`, {
      ...options,
      headers: { ...this.headers, ...options.headers }
    });
    const data = await res.json();
    if (!res.ok) {
      throw new Error(data.error || 'API Request Failed');
    }
    return data;
  }

  async getChallenge() {
    return this._fetch('/auth/challenge', { method: 'POST' });
  }

  async verifyAuth(type, credential = null) {
    return this._fetch('/auth/verify', {
      method: 'POST',
      body: JSON.stringify({ type, credential })
    });
  }

  async getKeys() {
    return this._fetch('/keys');
  }

  async addKey(keyData) {
    return this._fetch('/keys', {
      method: 'POST',
      body: JSON.stringify(keyData)
    });
  }

  async removeKey(id) {
    return this._fetch(`/keys/${id}`, { method: 'DELETE' });
  }

  async getIndex() {
    return this._fetch('/items/index');
  }

  async putIndex(iv, ciphertext) {
    return this._fetch('/items/index', {
      method: 'PUT',
      body: JSON.stringify({ iv, ciphertext })
    });
  }

  async getItem(id) {
    return this._fetch(`/items/${id}`);
  }

  async putItem(id, iv, ciphertext) {
    return this._fetch(`/items/${id}`, {
      method: 'PUT',
      body: JSON.stringify({ iv, ciphertext })
    });
  }

  async deleteItem(id) {
    return this._fetch(`/items/${id}`, { method: 'DELETE' });
  }

  async getUploadUrl(itemId, filename, size) {
    return this._fetch('/files/upload-url', {
      method: 'POST',
      body: JSON.stringify({ itemId, filename, size })
    });
  }

  // Helper method for file proxy streams
  async uploadFile(url, fileBytes) {
    const res = await fetch(url, {
      method: 'PUT',
      headers: { ...this.headers },
      body: fileBytes
    });
    if (!res.ok) {
      throw new Error('Failed to upload file');
    }
  }

  async downloadFile(itemId, fileId) {
    const res = await fetch(`${API_BASE}/files/${itemId}/${fileId}`, {
      headers: { ...this.headers }
    });
    if (!res.ok) {
      throw new Error('Failed to download file');
    }
    const buffer = await res.arrayBuffer();
    return new Uint8Array(buffer);
  }
}

export const api = new VaultAPI();
