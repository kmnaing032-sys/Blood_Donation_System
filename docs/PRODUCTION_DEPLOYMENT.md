# Blood Donation System — Production Deployment Checklist & Guide

---

## 1. Production Architecture Overview

```
 [ Client Browser ]
        │ HTTPS (443)
        ▼
 [ Reverse Proxy (Nginx / Caddy / Cloudflare) ]
   ├── Static Files (/assets, index.html) -> Frontend Build (`dist/`)
   └── API Proxy (/api/v1/*) -------------> Gunicorn / Uvicorn Workers (Port 8000)
                                                    │
                                                    ▼
                                          [ PostgreSQL Cluster ]
```

---

## 2. Pre-Deployment Configuration Checklist

- [ ] **Environment Mode:** Set `ENVIRONMENT="production"` and `DEBUG=False` in backend `.env`.
- [ ] **Cryptographic Keys:** Generate a new 64-character random hex string for `SECRET_KEY`. Never reuse development keys.
- [ ] **Database Connection:** Configure SSL mode in the connection URI (`sslmode=require`).
- [ ] **API Documentation Policy:** When `ENVIRONMENT="production"`, disable `/docs` and `/redoc` by passing `docs_url=None, redoc_url=None` to the FastAPI instance if public exposure is prohibited.
- [ ] **CORS Settings:** Restrict allowed origins to the production domain.
- [ ] **SMTP Mailer:** Verify valid production SMTP server credentials and SPF/DKIM records.

---

## 3. Production Deployment Commands

### 3.1 Backend Deployment
Using Gunicorn with Uvicorn worker class:
```powershell
pip install gunicorn uvicorn[standard]
gunicorn app.main:app -w 4 -k uvicorn.workers.UvicornWorker -b 0.0.0.0:8000 --access-logfile - --error-logfile -
```

### 3.2 Frontend Production Build
```powershell
cd frontend
npm install --frozen-lockfile
npm run build
```
Deploy the output `dist/` directory to your web server (e.g., Nginx, AWS S3 + CloudFront, Cloudflare Pages).
