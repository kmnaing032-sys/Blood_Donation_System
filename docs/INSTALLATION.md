# Blood Donation System — System Installation & Setup Guide

This guide describes how to install, configure, and execute the Blood Donation System on a local Windows development or staging environment.

---

## 1. Prerequisites

- **Operating System:** Windows 10/11 or Windows Server 2019+
- **Python:** Version 3.11, 3.12, or 3.13 (64-bit)
- **Node.js:** Version 18.x or 20.x LTS with npm
- **Database:** PostgreSQL 15+ (Running locally or as a service on port 5432)

---

## 2. Environment Configuration

### 2.1 Backend Environment Variables
Create or verify `.env` inside `backend/`:

```env
# Application Core
PROJECT_NAME="Blood Donation Management System"
API_V1_STR="/api/v1"
ENVIRONMENT="development"
DEBUG=False

# Security & Tokens
SECRET_KEY="replace-with-a-secure-random-64-character-hex-key"
ALGORITHM="HS256"
ACCESS_TOKEN_EXPIRE_MINUTES=30
REFRESH_TOKEN_EXPIRE_DAYS=7

# Database Connection (PostgreSQL asyncpg)
DATABASE_URL="postgresql+asyncpg://postgres:your_password@localhost:5432/blood_donation_db"
# Alembic Sync Driver for Migrations
SYNC_DATABASE_URL="postgresql://postgres:your_password@localhost:5432/blood_donation_db"

# SMTP & Notifications (Optional / Local test mode)
SMTP_HOST="smtp.example.com"
SMTP_PORT=587
SMTP_USER="notifications@example.com"
SMTP_PASSWORD="your-smtp-password"
EMAILS_FROM_EMAIL="notifications@example.com"
EMAILS_FROM_NAME="Blood Donation Network"
```

### 2.2 Frontend Environment Variables
Create or verify `.env` inside `frontend/`:

```env
VITE_API_BASE_URL="http://localhost:8000/api/v1"
```

---

## 3. Backend Setup & Database Migrations

1. Open PowerShell and navigate to the project root:
   ```powershell
   cd C:\Users\kyawm\Desktop\Blood_Donation_System
   ```

2. Create and activate a Python virtual environment:
   ```powershell
   python -m venv venv
   .\venv\Scripts\Activate.ps1
   ```

3. Install required Python packages:
   ```powershell
   cd backend
   pip install -r requirements.txt
   ```

4. Run database migrations to bring schema to latest head:
   ```powershell
   alembic upgrade head
   ```

5. Verify current migration head:
   ```powershell
   alembic current
   ```

---

## 4. Frontend Setup

1. Open a new PowerShell terminal:
   ```powershell
   cd C:\Users\kyawm\Desktop\Blood_Donation_System\frontend
   ```

2. Install JavaScript dependencies:
   ```powershell
   npm install
   ```

---

## 5. Running the Application

### 5.1 Start Backend Server
```powershell
cd C:\Users\kyawm\Desktop\Blood_Donation_System\backend
..\venv\Scripts\uvicorn app.main:app --host 127.0.0.1 --port 8000 --reload
```
API documentation is accessible at:
- Swagger UI: `http://localhost:8000/docs`
- ReDoc: `http://localhost:8000/redoc`

### 5.2 Start Frontend Client
```powershell
cd C:\Users\kyawm\Desktop\Blood_Donation_System\frontend
npm run dev
```
The React application will be available at: `http://localhost:5173`

---

## 6. Running Automated Tests

### 6.1 Backend Tests
```powershell
cd C:\Users\kyawm\Desktop\Blood_Donation_System\backend
$env:PYTHONPATH="."
..\venv\Scripts\python.exe -m pytest app/tests/test_database_integration.py -v
..\venv\Scripts\python.exe app/tests/test_advanced_donor_search.py
..\venv\Scripts\python.exe app/tests/test_bulk_donor_operations.py
```

### 6.2 Frontend Tests & Production Build
```powershell
cd C:\Users\kyawm\Desktop\Blood_Donation_System\frontend
npm run test
npm run build
```
