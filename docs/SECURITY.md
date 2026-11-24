# Blood Donation System — Security Architecture & Hardening Guide

---

## 1. Authentication & Token Management

- **Password Hashing:** Passwords are encrypted using the Argon2id algorithm (`argon2-cffi`), which is resistant to GPU-based brute-force and side-channel timing attacks.
- **Access Tokens:** Signed with HMAC-SHA256 (`HS256`) using a 256-bit cryptographically random key with a 30-minute expiration.
- **Refresh Tokens:** Persisted in the `refresh_tokens` database table with automatic token rotation. Single-use enforcement guarantees that attempting to reuse a revoked or consumed refresh token revokes all existing sessions for that user identity.

---

## 2. Role-Based Access Control (RBAC)

Authorization is enforced at the route dependency level via FastAPI `Depends(require_roles(...))` and `Depends(require_admin)`:
- Unauthenticated requests yield `HTTP 401 Unauthorized`.
- Authenticated requests with insufficient roles yield `HTTP 403 Forbidden`.
- Object-level authorization guards against Insecure Direct Object References (IDOR): regular donors can only access or modify their own linked donor profile.

---

## 3. CSV Formula Injection Mitigation (DDE Shield)

To mitigate CSV formula injection in spreadsheet applications (e.g., Microsoft Excel, LibreOffice, Google Sheets), any cell string starting with executable formula prefixes (`=`, `+`, `-`, `@`) is prepended with a single quotation mark (`'`) during export serialization.

---

## 4. API Security Hardening

- **Payload Size Limiting:** A 10MB maximum request body threshold blocks denial-of-service attempts via oversized payloads (`HTTP 413 Content Too Large`).
- **Rate Limiting:** Protects sensitive authentication routes (`/auth/login`, `/auth/register`) and diagnostics against automated brute-force attacks (`HTTP 429 Too Many Requests`).
- **CORS Restrictions:** Cross-Origin Resource Sharing is configured to permit only designated front-end origins rather than wildcard (`*`).
- **Data Protection:** Password hashes, internal database salts, and refresh tokens are excluded from all Pydantic response models and CSV exports.
