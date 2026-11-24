# Blood Donation System — User Guide

This user guide describes how each user role (Donor, Staff, Administrator) interacts with the features of the Blood Donation System.

---

## 1. System Roles & Access Levels

| Role | Purpose | Available Capabilities |
| :--- | :--- | :--- |
| **Donor** | Registered blood donor | View own profile, update personal information, view public donor registry (masked), view own donation history, receive notifications, update email preferences. |
| **Staff** | Healthcare professional & hospital staff | Register and manage donors, record donations, manage blood inventory, process blood requests, access reports, import CSV records, perform batch activations. |
| **Administrator** | System & clinical manager | All Staff capabilities plus: user management, role assignments, donor profile deletion, bulk donor deletion, database backup/restore, audit logs, system settings, health diagnostics. |

---

## 2. Donor Features

### 2.1 Profile Management
- Navigate to **Profile** (`/profile`) to view your registered blood group, contact number, age, date of birth, and residential address.
- Click **Edit Profile** to update non-medical fields such as contact phone and address.
- Adjust notification settings under the **Email Preferences** section.

### 2.2 Finding Donors (Public Registry)
- Navigate to **Donors** (`/donors`).
- Regular donors can search available blood donors by blood group.
- Identity and direct contact details are masked for privacy compliance.

---

## 3. Staff & Hospital Operations

### 3.1 Managing Donors
- Navigate to **Donors** (`/donors`).
- **Search & Filter:** Search by name, email, phone, or address. Filter by blood group, gender, account activation status, registration date range, and last donation date.
- **Exporting Donors:** Click **Export CSV** in the top action bar to download the current filtered list.
- **Add Donor:** Click **➕ Add Donor** to register a new donor profile linked to an existing user account.
- **Bulk Actions:** Select rows using checkboxes to reveal the contextual bulk toolbar. Perform batch activations or deactivations.

### 3.2 Recording Donations
- Navigate to **Donations** (`/donations`).
- Click **Record Donation** to enter volume (ml), donor ID, blood group, hemoglobin level, and clinical status (`completed`, `deferred`, `cancelled`).
- Successfully recorded donations automatically credit the corresponding inventory in Blood Stock.

### 3.3 Inventory & Blood Stock Management
- Navigate to **Blood Stock** (`/blood-stock`).
- View total units available across all 8 blood groups (`A+`, `A-`, `B+`, `B-`, `AB+`, `AB-`, `O+`, `O-`).
- Inspect low stock threshold alerts.
- Click **Adjust Stock** to log manual inventory corrections with mandatory audit reasoning.

### 3.4 Processing Blood Requests
- Navigate to **Blood Requests** (`/requests`).
- Inspect emergency, urgent, and standard blood requests submitted by clinical departments.
- Approve or reject requests based on available inventory. Approved requests automatically decrement available stock units atomically.

### 3.5 Data Import
- Navigate to **Data Import** (`/import`).
- Download the validated CSV template.
- Upload candidate CSV files to preview validation errors, duplicate phone/email detection, and valid row counts.
- Click **Commit Import** to process verified records into the database within an atomic transaction.

---

## 4. Administrator Features

### 4.1 User Account Management
- Navigate to **Users** (`/users`).
- Inspect registered users, filter by role (`admin`, `staff`, `donor`), and toggle account active status.
- Promote or demote user roles.

### 4.2 System Settings & Configuration
- Navigate to **System Settings** (`/settings`).
- Configure operational thresholds, minimum donor age (18), maximum donor age (65), donation cooldown interval (56 days), emergency contact emails, and alert toggles.

### 4.3 Database Backup & Restore
- Navigate to **Database Backups** (`/database-backups`).
- Click **Create Backup** to generate a timestamped PostgreSQL schema and data dump.
- Inspect backup file history, sizes, and checksums.
- Restore from a previous snapshot with double confirmation safeguards.

### 4.4 System Health & Diagnostics
- Navigate to **System Health** (`/health`).
- Monitor real-time database connection latency, system uptime, memory utilization, disk storage space, and SMTP mailer readiness.

### 4.5 Audit Logs
- Navigate to **Audit Logs** (`/audit-logs`).
- Search and review historical administrative actions, entity updates, IP addresses, and timestamps.
