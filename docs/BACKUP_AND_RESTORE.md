# Blood Donation System — Database Backup & Restore Guide

---

## 1. Overview
The Blood Donation System includes an integrated database backup and restore subsystem (`/database-backups`) accessible exclusively to users with the **Administrator** role.

---

## 2. Automated & On-Demand Backup Creation

### 2.1 Triggering Backup via API / Frontend
Administrators can trigger a point-in-time PostgreSQL snapshot directly from the Web UI or via REST API:
```http
POST /api/v1/database-backups/create
Authorization: Bearer <admin_token>
```
The snapshot is generated using standard PostgreSQL utilities, compressed, and stored in the server's configured storage location with SHA-256 integrity checksums.

### 2.2 CLI Backup Procedure
Alternatively, a manual backup can be created via `pg_dump`:
```powershell
pg_dump -U postgres -h localhost -p 5432 -F c -b -v -f "blood_donation_manual_backup.dump" blood_donation_db
```

---

## 3. Database Restoration Procedure

### 3.1 Web UI Restoration
1. Log in as an Administrator and navigate to **Database Backups** (`/database-backups`).
2. Identify the desired backup archive by date and checksum.
3. Click **Restore**.
4. Confirm the prompt to proceed. The system will apply the snapshot within an atomic maintenance session.

### 3.2 CLI Restoration Procedure
```powershell
pg_restore -U postgres -h localhost -p 5432 -d blood_donation_db -v "blood_donation_manual_backup.dump"
```
