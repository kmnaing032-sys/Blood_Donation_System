# Blood Donation System — REST API Documentation

Base URL: `http://localhost:8000/api/v1`

All responses are serialized as standard JSON unless designated as file streams (CSV/PDF).

---

## 1. Authentication & Session Management

| Method | Endpoint | Access Level | Description |
| :--- | :--- | :--- | :--- |
| `POST` | `/auth/register` | Public | Register a new user account (`email`, `password`, `full_name`). |
| `POST` | `/auth/login` | Public | Authenticate user; returns `access_token` and `refresh_token`. |
| `POST` | `/auth/refresh` | Public | Exchange valid refresh token for a fresh `access_token`. |
| `GET` | `/auth/me` | Authenticated | Retrieve profile details of currently authenticated user. |

---

## 2. Donor Management (`/donors`)

| Method | Endpoint | Access Level | Description |
| :--- | :--- | :--- | :--- |
| `GET` | `/donors/` | Authenticated | List donors. Paginated, multi-field search (`name`, `email`, `phone`, `address`), filtered by `blood_group`, `gender`, `is_active`, `start_date`, `end_date`, `last_donation_from`, `last_donation_to`. Public receives masked privacy fields; Staff/Admin receives full contact details. |
| `GET` | `/donors/export` | Staff / Admin | Export currently filtered donor query to CSV (up to 5,000 rows, formula-injection neutralized). |
| `POST` | `/donors/` | Staff / Admin / Owner | Create a new donor profile linked to a user. |
| `GET` | `/donors/{donor_id}` | Authenticated | Retrieve full donor profile (Owner, Staff, Admin) or masked (others). |
| `PATCH` | `/donors/{donor_id}` | Staff / Admin / Owner | Update personal or contact details of donor. |
| `DELETE`| `/donors/{donor_id}` | Admin | Delete donor profile. Blocked if active donation records exist. |
| `POST` | `/donors/bulk-actions` | Staff / Admin | Batch operations (`activate`, `deactivate`, `delete` [Admin only]). Max 100 IDs. |

---

## 3. Donations (`/donations`)

| Method | Endpoint | Access Level | Description |
| :--- | :--- | :--- | :--- |
| `GET` | `/donations/` | Authenticated | List donation records with pagination and filters. |
| `POST` | `/donations/` | Staff / Admin | Record a completed or deferred blood donation. Automatically updates stock. |
| `GET` | `/donations/{id}` | Authenticated | Retrieve single donation record details. |
| `PATCH` | `/donations/{id}` | Staff / Admin | Update status or clinical notes of a donation. |
| `DELETE`| `/donations/{id}` | Admin | Delete donation record. |

---

## 4. Blood Stock & Inventory (`/blood-stock`)

| Method | Endpoint | Access Level | Description |
| :--- | :--- | :--- | :--- |
| `GET` | `/blood-stock/` | Authenticated | Retrieve available stock units for all 8 blood groups and low-stock alerts. |
| `POST` | `/blood-stock/adjust` | Staff / Admin | Manually adjust blood stock quantity with required audit explanation. |

---

## 5. Blood Requests (`/requests`)

| Method | Endpoint | Access Level | Description |
| :--- | :--- | :--- | :--- |
| `GET` | `/requests/` | Authenticated | List blood requests with status, priority, and date filters. |
| `POST` | `/requests/` | Authenticated | Submit new blood request (hospital unit, patient ID, blood group, units). |
| `PATCH` | `/requests/{id}/status`| Staff / Admin | Update status (`approved`, `rejected`, `fulfilled`, `cancelled`). Deducts stock atomically on approval. |

---

## 6. Reports & Analytics (`/reports`)

| Method | Endpoint | Access Level | Description |
| :--- | :--- | :--- | :--- |
| `GET` | `/reports/overview` | Staff / Admin | Operational statistics across donors, donations, stock, and requests. |
| `GET` | `/reports/donors` | Staff / Admin | Aggregate donor metrics by blood group, age group, and gender. |
| `GET` | `/reports/donations`| Staff / Admin | Donation collection trends, total volume, and status distributions. |
| `GET` | `/reports/export/csv`| Staff / Admin | Export analytical report datasets to CSV. |
| `GET` | `/reports/export/pdf`| Staff / Admin | Export formal executive report summary to PDF. |

---

## 7. Bulk Data Import (`/imports`)

| Method | Endpoint | Access Level | Description |
| :--- | :--- | :--- | :--- |
| `GET` | `/imports/donors/template` | Staff / Admin | Download standardized CSV template for bulk donor import. |
| `POST` | `/imports/donors/preview`  | Staff / Admin | Upload CSV and preview parsed data, errors, and duplicate checks. |
| `POST` | `/imports/donors/commit`   | Staff / Admin | Commit verified CSV rows into database within an atomic transaction. |
| `GET` | `/imports/history`        | Staff / Admin | Retrieve historical CSV import logs and audit summaries. |

---

## 8. Database Backups (`/database-backups`)

| Method | Endpoint | Access Level | Description |
| :--- | :--- | :--- | :--- |
| `GET` | `/database-backups/` | Admin | List available database backup files and metadata. |
| `POST` | `/database-backups/create`| Admin | Trigger full PostgreSQL database backup. |
| `POST` | `/database-backups/restore`| Admin | Restore database state from a specified backup file. |
| `DELETE`| `/database-backups/{id}` | Admin | Delete an archived backup file. |

---

## 9. System Health & Diagnostics (`/health`)

| Method | Endpoint | Access Level | Description |
| :--- | :--- | :--- | :--- |
| `GET` | `/health/status` | Authenticated | Live diagnostics: DB connectivity latency, disk usage, memory, uptime. |
| `GET` | `/health/ready` | Public / LB | Readiness probe for container orchestrators and load balancers. |
