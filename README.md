# SecureStore

SecureStore is a **Zero-Knowledge** personal vault designed for high-security storage of credentials, notes, and documents. It utilizes **Client-Side Encryption (CSE)**, meaning the server (Cloudflare) never has access to the raw data or the encryption keys.

## 🛡️ Core Philosophy
* **Trust Nothing**: The server only stores "ciphertext" (encrypted noise).
* **Privacy by Design**: Even the metadata (item names, types) is encrypted before storage.
* **Performance**: Utilizes Web Streams for handling large files without server memory exhaustion.

## 🛠️ Tech Stack
* **Frontend**: React (Vite), Web Crypto API, Argon2 (WASM)
* **Backend**: Cloudflare Workers (Hono Framework)
* **Database**: Cloudflare KV (Metadata & Indices)
* **Storage**: Cloudflare R2 (Encrypted Blobs)
* **Auth**: JWT (Session), WebAuthn PRF (Identity & Encryption)

## ✨ Features
* **Zero-Knowledge Architecture**: All encryption and decryption happen locally in the browser using the Web Crypto API.
* **Dual-Layer Authentication**: Identity gatekeeper (Password or Passkey) issues a JWT session, and a separate Access layer (Passphrase, WebAuthn PRF, or Emergency Recovery Key) unwrap the shared Master Encryption Key (MEK) locally.
* **Large File Streaming**: Directly pipe streams into Cloudflare R2 to bypass worker memory limits. Files are encrypted with unique Data Encryption Keys (DEKs).
* **Multi-User Sharing**: Supports a "Shared Vault" model where authorized family members can access a shared MEK, wrapped securely with their own individual keys.
* **Security Controls**: Includes an Auto-Lock inactivity timer and Emergency Recovery Keys.

## 🚀 Getting Started

### Prerequisites
* Node.js (v18+ recommended)
* npm
* Cloudflare Account (for deploying KV and R2)

### Installation
1. Clone the repository:
   ```bash
   git clone https://github.com/forwardtocharis/secure-store.git
   cd secure-store
   ```
2. Install dependencies:
   ```bash
   npm install
   ```

### Environment Setup
Create a `.dev.vars` file in the root directory for local development to define your secrets:
```env
JWT_SECRET=your_super_secret_jwt_string
INITIAL_USERS=[{"id":"user1","username":"admin"}]
```

For production, configure `JWT_SECRET` and other secrets using the Cloudflare Dashboard. Make sure to define your `KV` and `R2` bindings in `wrangler.toml`.

### Running Locally
SecureStore consists of a React frontend and a Cloudflare Worker backend.

1. **Start the backend (Cloudflare Worker):**
   ```bash
   npx wrangler dev
   ```
   This runs the backend locally with local KV and R2 persistence.

2. **Start the frontend (Vite):**
   In a separate terminal window, run:
   ```bash
   npm run dev
   ```

## 🧪 Testing

Run unit tests locally using the native Node test runner:
```bash
npm test
```

For detailed testing plans, including integration and security flow validations, refer to the [TESTING_PLAN.md](TESTING_PLAN.md).

## 📚 Documentation
* [Developer Guide](DEVELOPER_GUIDE.md) - Deep dive into architecture, security mechanisms, data flows, and project structure.
* [Testing Plan](TESTING_PLAN.md) - Detailed procedures for unit, integration, and E2E testing.
