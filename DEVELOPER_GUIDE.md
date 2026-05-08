# SecureStore: Developer & Architecture Guide

## 1. Project Overview
SecureStore is a **Zero-Knowledge** personal vault designed for high-security storage of credentials, notes, and documents. It utilizes **Client-Side Encryption (CSE)**, meaning the server (Cloudflare) never has access to the raw data or the encryption keys.

### Core Philosophy
*   **Trust Nothing**: The server only stores "ciphertext" (encrypted noise).
*   **Privacy by Design**: Even the metadata (item names, types) is encrypted before storage.
*   **Performance**: Utilizes Web Streams for handling large files without server memory exhaustion.

---

## 2. Tech Stack
| Layer | Technology |
| :--- | :--- |
| **Frontend** | React (Vite), Web Crypto API, Argon2 (WASM) |
| **Backend** | Cloudflare Workers (Hono Framework) |
| **Database** | Cloudflare KV (Metadata & Indices) |
| **Storage** | Cloudflare R2 (Encrypted Blobs) |
| **Auth** | JWT (Session), WebAuthn PRF (Identity & Encryption) |

---

## 3. Security Architecture

### 3.1 Dual-Layer Authentication
SecureStore uses a two-stage gatekeeper model:
1.  **Layer 1: Identity (The Gatekeeper)**
    *   **Purpose**: Identifies the user and grants API access.
    *   **Mechanism**: Username/Password **or Passkey (WebAuthn)**.
    *   **Result**: Issues a short-lived **JWT**. Without this, the vault is invisible to the internet.
2.  **Layer 2: Access (The Vault Key)**
    *   **Purpose**: Decrypts the shared data locally in the browser.
    *   **Mechanism**: Passphrase, Passkey (WebAuthn PRF), or Emergency Recovery Key.
    *   **Result**: Derives a **User Wrapping Key** which unwraps the shared **Master Encryption Key (MEK)**. Each user has their own unique wrapping of the same MEK.

### 3.2 Key Hierarchy
*   **DEK (Data Encryption Key)**: Unique per-file key. The DEK is encrypted with the MEK and stored as a reference within an Entity's metadata.
*   **User Wrapping Key**: Derived from the user's individual passphrase (via Argon2id) or Passkey. Used to "wrap" (encrypt) the shared MEK for storage in Cloudflare KV under the user's specific record (`user:{id}:wrapped-keys`).
*   **Global Blob Storage**: Files are stored in R2 using a unique `fileId` prefix (`vault/files/${fileId}`). Entities store "references" to these blobs, allowing one document to be linked to multiple entities.

---

## 4. Directory Structure
-   `/src`: Frontend React Application
    -   `/api`: `client.js` - Centralized API wrapper.
    -   `/components`: UI Layers (Login, Unlock, Vault, Editor).
    -   `/crypto`: Core cryptographic primitives (Argon2, MEK wrapping, AES-GCM).
    -   `/store`: `vault.jsx` - Global state management for identity and the unlocked MEK.
-   `/worker`: Cloudflare Worker (Backend)
    -   `/lib`: KV/R2 helpers and User initialization logic.
    -   `/middleware`: Session verification and rate limiting.
    -   `/routes`: API endpoints (Auth, Keys, Items, Files).
-   `wrangler.toml`: Cloudflare deployment configuration.

---

## 5. Data Flows

### 5.1 The "Unlock" Process
1.  Client logs in (Layer 1) using **Password or Passkey** and receives a JWT.
2.  Client fetches the **User's Wrapped MEK** from `/api/auth/verify`.
3.  User enters passphrase.
4.  Client runs **Argon2id** (WASM) to derive their individual **Wrapping Key**.
5.  Client calls `crypto.subtle.unwrapKey` to recover the shared plaintext MEK.
6.  If successful, the MEK is stored in a React `useState` (memory only).

### 5.2 Large File Upload (Streaming)
1.  Client encrypts the file locally using a unique DEK.
2.  Client calls `/api/files/upload-url` to get a destination.
3.  Client `PUT`s the encrypted blob.
4.  **Worker Logic**: The worker pipes the stream directly into `R2.put()` at `vault/files/${fileId}`. 
5.  **Decoupling**: Files are stored independently of items, allowing multiple items (folders) to reference the same encrypted document via its `fileId`.

---

## 6. Security Features
*   **Auto-Lock**: A 10-minute inactivity timer in `VaultProvider` wipes the MEK and logs out the user automatically.
*   **Emergency Recovery**: A 64-character hex key that can unwrap the MEK if the passphrase is lost.
*   **Zero-Knowledge Index**: The item list (names, types) is encrypted as a single JSON blob. The server cannot even tell how many passwords you have without gaining access to that blob.

---

## 7. Sharing & Multi-User Access
SecureStore supports a "Shared Vault" model for families. 

1.  **Shared Master Key**: All authorized family members share the same **Master Encryption Key (MEK)**.
2.  **Individual Wrapping**: Each user wraps the shared MEK with their own individual passphrase or passkey.
3.  **The "Share" Flow**:
    *   The Owner (already logged in and unlocked) navigates to **Settings**.
    *   They enter a family member's email and a temporary passphrase.
    *   The client derives a Wrapping Key from that passphrase, wraps the current **MEK**, and sends it to the server.
    *   The server saves this wrapped key specifically to the target user's profile (`POST /api/keys/share`).
    *   The family member can then log in (Identity) and unlock the shared vault using the temporary passphrase.
4.  **Entities as Folders**: The UI uses an "Entity" type to represent people (e.g., `child1`) or assets. These folders contain both encrypted fields and links to shared documents from the global pool.

---

## 8. Deployment & Setup
1.  **Config**: Define `INITIAL_USERS` and `JWT_SECRET` in `wrangler.toml`.
2.  **Dev**: Run `npm run dev` for the frontend.
3.  **Worker**: Use `npx wrangler dev` to test the backend locally with KV/R2 persistence.
