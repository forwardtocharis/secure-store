// src/crypto/util.js

export function base64Encode(buffer) {
  const bytes = new Uint8Array(buffer);
  let binary = '';
  const chunkSize = 8192;
  for (let i = 0; i < bytes.byteLength; i += chunkSize) {
    binary += String.fromCharCode.apply(null, bytes.subarray(i, i + chunkSize));
  }
  return btoa(binary);
}

export function base64Decode(base64) {
  const binary_string = atob(base64);
  const len = binary_string.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) {
    bytes[i] = binary_string.charCodeAt(i);
  }
  return bytes;
}

export function base64urlEncode(buffer) {
  const base64 = base64Encode(buffer);
  return base64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
}

export function base64urlDecode(base64url) {
  let base64 = base64url.replace(/-/g, '+').replace(/_/g, '/');
  while (base64.length % 4) {
    base64 += '=';
  }
  return base64Decode(base64);
}

export function serializeCredential(cred) {
  const obj = {
    id: cred.id,
    type: cred.type,
    rawId: base64urlEncode(cred.rawId),
    response: {
      clientDataJSON: base64urlEncode(cred.response.clientDataJSON),
    }
  };

  if (cred.response.attestationObject) {
    obj.response.attestationObject = base64urlEncode(cred.response.attestationObject);
  }
  if (cred.response.authenticatorData) {
    obj.response.authenticatorData = base64urlEncode(cred.response.authenticatorData);
  }
  if (cred.response.signature) {
    obj.response.signature = base64urlEncode(cred.response.signature);
  }
  if (cred.response.userHandle) {
    obj.response.userHandle = base64urlEncode(cred.response.userHandle);
  }

  return obj;
}

const byteToHex = [];
for (let i = 0; i < 256; i++) {
  byteToHex.push(i.toString(16).padStart(2, '0'));
}

export function buf2hex(buffer) {
  const bytes = new Uint8Array(buffer || 0);
  let hex = '';
  for (let i = 0; i < bytes.length; i++) {
    hex += byteToHex[bytes[i]];
  }
  return hex;
}
