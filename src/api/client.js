import { Capacitor } from '@capacitor/core';

let API_BASE = (Capacitor.isNativePlatform() ? localStorage.getItem('vault:server') : null) || import.meta.env?.VITE_API_BASE || '/api';

export function setApiBaseUrl(url) {
  if (url) {
    API_BASE = url;
    if (Capacitor.isNativePlatform()) {
      localStorage.setItem('vault:server', url);
    }
  } else {
    API_BASE = import.meta.env?.VITE_API_BASE || '/api';
    if (Capacitor.isNativePlatform()) {
      localStorage.removeItem('vault:server');
    }
  }
}

export function getApiBaseUrl() {
  return API_BASE;
}

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
    const url = `${API_BASE}${path}`;
    try {
      const res = await fetch(url, {
        ...options,
        headers: { ...this.headers, ...options.headers }
      });

      if (!res.ok) {
        let errorData;
        try {
          errorData = await res.json();
        } catch (e) {
          errorData = { error: `HTTP ${res.status} ${res.statusText}` };
        }
        console.error(`[API ERROR] ${options.method || 'GET'} ${url}:`, errorData);
        throw new Error(errorData.error || 'API Request Failed');
      }

      return await res.json();
    } catch (err) {
      if (err.message === 'Failed to fetch') {
        console.error(`[NETWORK ERROR] Failed to fetch ${url}. Check if the server is running and the endpoint is correct. API_BASE: ${API_BASE}`);
      } else {
        console.error(`[API FETCH EXCEPTION] ${options.method || 'GET'} ${url}:`, err);
      }
      throw err;
    }
  }

  async getChallenge() {
    return this._fetch('/auth/challenge', { method: 'POST' });
  }

  async login(email, password) {
    return this._fetch('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password })
    });
  }

  async verifyAuth(type, credential = null) {
    return this._fetch('/auth/verify', {
      method: 'POST',
      body: JSON.stringify({ type, credential })
    });
  }

  async changePassword(newPassword) {
    return this._fetch('/auth/change-password', {
      method: 'POST',
      body: JSON.stringify({ newPassword })
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

  async shareKey(shareData) {
    return this._fetch('/keys/share', {
      method: 'POST',
      body: JSON.stringify(shareData)
    });
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

  async getUploadUrl(filename, size) {
    return this._fetch('/files/upload-url', {
      method: 'POST',
      body: JSON.stringify({ filename, size })
    });
  }

  // Helper method for file proxy streams
  async uploadFile(url, fileBytes) {
    const headers = { ...this.headers };
    // DO NOT send application/json for binary data
    headers['Content-Type'] = 'application/octet-stream';
    
    const res = await fetch(url, {
      method: 'PUT',
      headers,
      body: fileBytes
    });
    
    if (!res.ok) {
      let errorMessage = 'Failed to upload file';
      try {
        const errorData = await res.json();
        errorMessage = errorData.error || errorMessage;
      } catch (e) {
        // Fallback if not JSON
      }
      throw new Error(errorMessage);
    }
  }

  async downloadFile(fileId) {
    const res = await fetch(`${API_BASE}/files/${fileId}`, {
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
