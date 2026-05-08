# SecureStore: Comprehensive Testing & Verification Plan

This document outlines the strategy for verifying the security, functionality, and performance of the SecureStore Zero-Knowledge vault. It is designed to be used by multiple team members to ensure full coverage before production release.

## 1. Current State Audit (Initial Findings)

A preliminary review of the codebase has identified the following high-risk areas that require immediate attention:

*   **Multi-Tenancy Isolation**: Verified that `vault:wrapped-keys` is now scoped to `user:${userId}:wrapped-keys`.
*   **Shared Vault Data**: Confirmed that `vault:index` and R2 blobs remain shared among authorized family members (authorized by Layer 1 JWT).

---

## 2. Test Environment Setup

### 1.1 Local Development
*   **Frontend**: `npm run dev` (Vite)
*   **Backend**: `npx wrangler dev` (Cloudflare Worker with local KV/R2)
*   **Environment Variables**: Ensure `.dev.vars` contains `JWT_SECRET` and `INITIAL_USERS` (mocked).

### 1.2 Staging (Cloudflare Preview)
*   Deploy to a preview environment using `npx wrangler deploy --env staging`.
*   Configure KV and R2 buckets specifically for testing.

---

## 2. Test Categories & Assignments

| ID | Category | Description | Status | Assignee |
| :--- | :--- | :--- | :--- | :--- |
| **U-1** | **Unit: Crypto** | Verify MEK generation, Argon2 derivation, and AES-GCM encryption. | `[ ]` | |
| **U-2** | **Unit: API Client** | Verify `VaultAPI` handles token injection and error responses correctly. | `[ ]` | |
| **I-1** | **Integration: Auth** | Verify JWT issuance, Layer 1 login, and session persistence. | `[ ]` | |
| **I-2** | **Integration: KV** | Verify metadata storage (Index and Items) in KV. | `[ ]` | |
| **I-3** | **Integration: R2** | Verify streaming uploads and downloads to R2. | `[ ]` | |
| **I-4** | **Integration: Passkey** | Verify Passkey identity registration and Layer 1 login. | `[ ]` | |
| **E-1** | **E2E: Full Flow** | Register/Login -> Unlock -> Add Password -> Lock -> Relogin -> Unlock. | `[ ]` | |
| **E-2** | **E2E: Recovery** | Verify Emergency Recovery Key can unwrap the MEK. | `[ ]` | |
| **S-1** | **Security: Isolation** | **CRITICAL**: Verify User A cannot access User B's KV/R2 data. | `[ ]` | |
| **S-2** | **Security: ZK Check** | Verify raw data never appears in network requests (Browser Inspector). | `[ ]` | |
| **P-1** | **Perf: Large Files** | Upload a 500MB+ file and verify no worker memory exhaustion. | `[ ]` | |
| **X-1** | **UX: Auto-Lock** | Verify vault locks exactly after 10 minutes of inactivity. | `[ ]` | |

---

## 3. Detailed Test Procedures

### 3.1 Security & Multi-Tenancy (High Priority)
> [!NOTE]
> **Verified Fix**: The previous vulnerability regarding global KV keys has been resolved. Storage is now strictly scoped to `user:${userId}:wrapped-keys`.

*   **Test S-1 (Key Isolation)**: 
    1.  Log in as User A and add a wrapped MEK.
    2.  Log in as User B.
    3.  Verify User B's `/api/keys` list is empty (cannot see User A's keys).
    4.  Add a wrapped MEK for User B.
    5.  Verify User A still only sees their own key.
*   **Test S-2 (Shared Access)**:
    1.  Log in as User A, create an item "Family Secret".
    2.  Log in as User B.
    3.  Verify User B can see "Family Secret" in the shared index (as they are part of the authorized family group).
*   **Test S-3 (Sharing Flow)**:
    1.  User A logs in and unlocks the vault.
    2.  User A goes to Settings and "Shares" with User B using a temporary passphrase "welcome123".
    3.  User B logs in on a different machine.
    4.  User B enters "welcome123" to unlock.
    5.  Verify User B successfully recovers the shared MEK and sees the same items.
*   **Test S-4 (Passkey Identity)**:
    1.  Log in as User A with password.
    2.  Enroll a Passkey for both Login and Unlock.
    3.  Log out.
    4.  Click "Sign in with Passkey" on the login screen.
    *   Verify automatic JWT issuance and redirect to Unlock screen.
    *   Unlock using the same Passkey.
*   **Test S-5 (Multi-Entity Linking)**:
    1.  Create Entity "Child A".
    2.  Upload "Shared Doc.pdf" to "Child A".
    3.  Create Entity "Child B".
    4.  Manually copy the `attachmentRef` (fileId/key/iv) from "Child A" to "Child B" (or via future UI linking tool).
    5.  Verify both "Child A" and "Child B" can successfully download and decrypt the same file from the global blob pool.

### 3.2 Large File Handling (Streaming)
*   **Test P-1**:
    1.  Generate a 200MB dummy file.
    2.  Upload via the "Add File" component.
    3.  Monitor Worker logs for memory limits (Cloudflare Workers have a 128MB limit; streaming should bypass this).
    4.  Download the file and run a `shasum` check against the original.

### 3.3 UX & Reliability
*   **Test X-1 (Inactivity)**:
    1.  Unlock the vault.
    2.  Wait 10 minutes without moving the mouse or typing.
    3.  Verify the app redirects to the unlock/login screen and `sessionStorage` is cleared.
*   **Test X-2 (Offline/Errors)**:
    1.  Simulate a network failure during upload.
    2.  Verify the UI provides a clear error message and doesn't leave the vault in a corrupted state.

---

## 4. Defect Reporting Template

When a test fails, please log the following in a new issue or the project tracker:
*   **Test ID**: (e.g., S-1)
*   **Environment**: (Local/Staging)
*   **Browser**: (Chrome/Firefox/Safari)
*   **Steps to Reproduce**:
*   **Expected Result**:
*   **Actual Result**:
*   **Console/Network Logs**: (Attached)

---

## 5. Verification Checklist (Release Candidate)

- [ ] All Unit tests passing (`npm test`)
- [ ] No plaintext sensitive data in server logs
- [ ] Multi-user isolation verified (Fix for KV scoping confirmed)
- [ ] Large file streaming (up to 1GB) verified
- [ ] Auto-lock mechanism verified
