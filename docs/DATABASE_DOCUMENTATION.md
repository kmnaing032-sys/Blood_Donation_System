# Blood Donation System — Database Documentation & Schema Architecture

**Database Engine:** PostgreSQL 15+ (Async driver: `asyncpg`, Migration engine: `Alembic`)

---

## 1. Entity Relationship Overview

```
 [ users ] 1 ─── 0..1 [ donors ] 1 ─── 0..* [ donations ]
    │                      │                        │
    │ 1                    │                        │
    ▼                      ▼                        ▼
 [ refresh_tokens ]     [ audit_logs ]       [ blood_stock ]
                           ▲                        ▲
                           │                        │
                   [ blood_requests ] ──────────────┘
```

---

## 2. Table Specifications

### 2.1 `users`
Primary authentication and identity table.
- `id` (SERIAL PRIMARY KEY)
- `full_name` (VARCHAR 150, NOT NULL)
- `email` (VARCHAR 255, UNIQUE, NOT NULL, INDEXED)
- `hashed_password` (VARCHAR 255, NOT NULL) — Argon2id hash
- `role` (VARCHAR 20, DEFAULT 'donor', NOT NULL) — values: `donor`, `staff`, `admin`
- `is_active` (BOOLEAN, DEFAULT TRUE, NOT NULL)
- `created_at` (TIMESTAMPTZ, DEFAULT NOW(), NOT NULL)
- `updated_at` (TIMESTAMPTZ, DEFAULT NOW(), NOT NULL)

### 2.2 `donors`
Extended clinical profile for registered blood donors.
- `id` (SERIAL PRIMARY KEY)
- `user_id` (INTEGER, UNIQUE, NOT NULL, FK -> `users.id` ON DELETE CASCADE)
- `phone` (VARCHAR 20, UNIQUE, NOT NULL, INDEXED)
- `date_of_birth` (DATE, NOT NULL)
- `gender` (VARCHAR 20, NOT NULL) — values: `male`, `female`, `other`
- `blood_group` (VARCHAR 3, NOT NULL, INDEXED) — `A+`, `A-`, `B+`, `B-`, `AB+`, `AB-`, `O+`, `O-`
- `address` (TEXT, NOT NULL)
- `last_donation_date` (DATE, NULLABLE)
- `created_at` (TIMESTAMPTZ, DEFAULT NOW(), NOT NULL)
- `updated_at` (TIMESTAMPTZ, DEFAULT NOW(), NOT NULL)

### 2.3 `donations`
Clinical blood donation logs.
- `id` (SERIAL PRIMARY KEY)
- `donor_id` (INTEGER, NOT NULL, FK -> `donors.id` ON DELETE RESTRICT)
- `donation_date` (DATE, NOT NULL, INDEXED)
- `quantity_ml` (INTEGER, NOT NULL, CHECK `quantity_ml > 0`)
- `blood_group` (VARCHAR 3, NOT NULL)
- `status` (VARCHAR 20, DEFAULT 'completed', NOT NULL) — `completed`, `deferred`, `cancelled`
- `notes` (TEXT, NULLABLE)
- `created_at` (TIMESTAMPTZ, DEFAULT NOW(), NOT NULL)
- `updated_at` (TIMESTAMPTZ, DEFAULT NOW(), NOT NULL)

### 2.4 `blood_stock`
Aggregated inventory counts by blood group.
- `id` (SERIAL PRIMARY KEY)
- `blood_group` (VARCHAR 3, UNIQUE, NOT NULL, INDEXED)
- `units` (INTEGER, DEFAULT 0, NOT NULL, CHECK `units >= 0`)
- `last_updated` (TIMESTAMPTZ, DEFAULT NOW(), NOT NULL)

### 2.5 `blood_requests`
Hospital and clinical blood inventory requisitions.
- `id` (SERIAL PRIMARY KEY)
- `patient_name` (VARCHAR 150, NOT NULL)
- `blood_group` (VARCHAR 3, NOT NULL, INDEXED)
- `units_requested` (INTEGER, NOT NULL, CHECK `units_requested > 0`)
- `hospital_name` (VARCHAR 200, NOT NULL)
- `urgency` (VARCHAR 20, DEFAULT 'standard', NOT NULL) — `standard`, `urgent`, `emergency`
- `status` (VARCHAR 20, DEFAULT 'pending', NOT NULL) — `pending`, `approved`, `fulfilled`, `rejected`, `cancelled`
- `created_at` (TIMESTAMPTZ, DEFAULT NOW(), NOT NULL)
- `updated_at` (TIMESTAMPTZ, DEFAULT NOW(), NOT NULL)

### 2.6 `audit_logs`
Immutable administrative audit trails.
- `id` (SERIAL PRIMARY KEY)
- `user_id` (INTEGER, NULLABLE, FK -> `users.id` ON DELETE SET NULL)
- `action` (VARCHAR 100, NOT NULL, INDEXED)
- `entity_type` (VARCHAR 50, NOT NULL, INDEXED)
- `entity_id` (INTEGER, NULLABLE)
- `description` (TEXT, NOT NULL)
- `ip_address` (VARCHAR 45, NULLABLE)
- `created_at` (TIMESTAMPTZ, DEFAULT NOW(), NOT NULL)

### 2.7 `system_settings`
Global system configurations and business operational constants.
- `id` (SERIAL PRIMARY KEY)
- `key` (VARCHAR 100, UNIQUE, NOT NULL, INDEXED)
- `value` (TEXT, NOT NULL)
- `description` (TEXT, NULLABLE)
- `updated_at` (TIMESTAMPTZ, DEFAULT NOW(), NOT NULL)

---

## 3. Migration Branch & Revision Tracking

- **Current Migration Head:** `b8af5da10e53`
- Total Applied Versions: 11 revisions
- Verification command:
  ```powershell
  alembic current
  alembic heads
  ```
