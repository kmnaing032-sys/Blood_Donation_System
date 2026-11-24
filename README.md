# Blood Donation Management System

An enterprise-grade, secure, and reactive full-stack Blood Donation Management platform designed for hospital networks, clinical staff, and voluntary blood donors.

---

## 🌟 Key Features

1. **Authentication & Identity:** JWT-based stateless authentication with automatic refresh token rotation, Argon2id password encryption, and Role-Based Access Control (Donor, Staff, Admin).
2. **Donor Management:** Complete donor profile lifecycle, eligibility age checks (18–65), masked public directory for privacy compliance, advanced search (name, email, phone, address), and multi-criteria filtering.
3. **Donation Records:** Donation logging with volume constraints, hemoglobin validation, cooldown period enforcement (56 days), and automatic blood stock inventory synchronization.
4. **Blood Stock & Inventory:** Real-time inventory monitoring across all 8 blood groups (`A+`, `A-`, `B+`, `B-`, `AB+`, `AB-`, `O+`, `O-`), minimum safety stock alerts, and audited stock adjustments.
5. **Blood Request Management:** Clinical blood requisition workflow, priority handling (Standard, Urgent, Emergency), and atomic stock deduction upon approval.
6. **Bulk Operations & Data Import:** Validated CSV data import with dry-run preview and transactional commit; batch donor activation, deactivation, and safe deletion.
7. **Export & Analytics:** Filtered CSV export with formula injection mitigation, analytical reports with CSV and PDF generation.
8. **System Administration:** Integrated PostgreSQL database backups and point-in-time restore, system health monitoring, SMTP email alerts, and audit logging.

---

## 🛠️ Technology Stack

- **Backend:** Python, FastAPI, Async SQLAlchemy, PostgreSQL (`asyncpg`), Pydantic v2, Alembic
- **Frontend:** React, Vite, Axios, Lucide Icons, Vitest, Testing Library
- **Security:** Argon2id, JWT HS256, Rate Limiting, CORS restrictions, CSV injection mitigation

---

## 🚀 Quick Start

### Backend
```powershell
cd backend
python -m venv ..\venv
..\venv\Scripts\Activate.ps1
pip install -r requirements.txt
alembic upgrade head
uvicorn app.main:app --reload --port 8000
```

### Frontend
```powershell
cd frontend
npm install
npm run dev
```

Visit the application at `http://localhost:5173`.

---

## 📚 Documentation

Comprehensive system guides and technical specifications are available in the [`docs/`](docs/) directory:
- [Installation & Setup Guide](docs/INSTALLATION.md)
- [End-User Operating Guide](docs/USER_GUIDE.md)
- [REST API Specifications](docs/API_DOCUMENTATION.md)
- [Database Schema & Architecture](docs/DATABASE_DOCUMENTATION.md)
- [Security & Hardening Architecture](docs/SECURITY.md)
- [Database Backup & Restore Guide](docs/BACKUP_AND_RESTORE.md)
- [Production Deployment Guide](docs/PRODUCTION_DEPLOYMENT.md)
- [Final System Integration & QA Audit](docs/FINAL_SYSTEM_AUDIT.md)

---

## 👨‍💻 Author & Attribution

**Developed by Kyaw Moe Naing**
