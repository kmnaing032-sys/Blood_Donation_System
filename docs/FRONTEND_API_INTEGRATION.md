# Blood Donation System – Frontend API Integration Guide

This guide details the complete API architecture, authentication workflow, token handling, error response model, and endpoint inventory for integrating the React (Vite) frontend with the FastAPI backend.

---

## 1. General Configuration

### Base URL
- **Local Development**: `http://localhost:8000` (or `http://127.0.0.1:8000`)
- **API Prefix**: `/api/v1`
- **Full API Base**: `http://localhost:8000/api/v1`
- **Interactive Documentation**:
  - Swagger UI: `http://localhost:8000/docs`
  - ReDoc: `http://localhost:8000/redoc`
  - OpenAPI JSON: `http://localhost:8000/openapi.json`

### CORS Configuration
The backend is configured with FastAPI's `CORSMiddleware`:
```python
origins = [
    "http://localhost:5173",
    "http://127.0.0.1:5173",
]
```
- **Allowed Origins**: `http://localhost:5173`, `http://127.0.0.1:5173` (Standard React Vite dev ports)
- **Allowed Methods**: `*` (GET, POST, PATCH, DELETE, OPTIONS)
- **Allowed Headers**: `*` (Authorization, Content-Type, X-Correlation-ID)
- **Credentials**: Enabled (`allow_credentials=True`)

### HTTP Security Headers
Every response includes:
- `X-Correlation-ID`: Traceability UUID per request
- `X-Content-Type-Options: nosniff`
- `X-Frame-Options: DENY`
- `X-XSS-Protection: 1; mode=block`
- `Referrer-Policy: strict-origin-when-cross-origin`
- `Content-Security-Policy`: Scoped CSP enforcing `default-src 'self'` for APIs.

---

## 2. Authentication & Authorization Workflow

The backend uses **JWT Access Tokens (short-lived)** and **Refresh Token Rotation with Replay Detection (long-lived)**.

### Access Token
- **Format**: `Bearer <access_token>` in the HTTP `Authorization` request header.
- **Lifetime**: 30 minutes (`ACCESS_TOKEN_EXPIRE_MINUTES = 30`).
- **Signature Algorithm**: `HS256`.
- **Payload Claims**:
  ```json
  {
    "sub": "12",
    "email": "user@example.com",
    "role": "donor",
    "exp": 1731852000,
    "token_type": "access"
  }
  ```

### Refresh Token
- **Format**: Opaque JWT token with UUID `jti` tracking.
- **Lifetime**: 7 days (`REFRESH_TOKEN_EXPIRE_DAYS = 7`).
- **Rotation**: Calling `/api/v1/auth/refresh` immediately revokes the used refresh token and issues a **brand new pair** of access and refresh tokens.
- **Replay Detection**: If a revoked refresh token is sent again, the backend rejects it with `401 Unauthorized` (`Refresh token is invalid or revoked`).

### Frontend Token Storage Strategy
1. **Access Token**: Store in application memory (e.g., React Context, Zustand, or Redux store).
2. **Refresh Token**: Store in `localStorage` or secure cookie.
3. **Axios/Fetch Interceptor**:
   - Attach `Authorization: Bearer <access_token>` to every authenticated request.
   - On `401 Unauthorized`, trigger `/api/v1/auth/refresh` with `{ "refresh_token": "..." }`.
   - Update stored tokens and retry the original request.
   - If `/refresh` returns `401`, clear tokens and redirect user to `/login`.

---

## 3. Standard API Error Response Format

All backend errors (validation, 401, 403, 404, 409, 500) follow a uniform JSON schema:

```json
{
  "success": false,
  "message": "Human-readable summary message",
  "detail": "Detailed explanation or field-level validation errors",
  "error_code": "ERROR_CODE_STRING",
  "correlation_id": "req-a1b2c3d4e5f6"
}
```

### Standard Error Codes
- `VALIDATION_ERROR` (422): Schema/input constraint violated (detail is a list of `{ field, message, type }`).
- `UNAUTHORIZED` (401): Missing, invalid, or expired JWT.
- `FORBIDDEN` (403): User lacks required role or permission (or IDOR access blocked).
- `NOT_FOUND` (404): Entity not found.
- `CONFLICT` / `DUPLICATE_RECORD` (409): Unique constraint violation (e.g. duplicate email, phone).
- `FOREIGN_KEY_VIOLATION` / `CONSTRAINT_VIOLATION` (400): Relational integrity violation or negative numbers.
- `DATABASE_UNAVAILABLE` (503): Database connection drop.
- `INTERNAL_SERVER_ERROR` (500): Unhandled exception (sanitized, stack trace hidden from client).

---

## 4. Standard Pagination, Search, Filter & Sorting Format

List endpoints support page-based pagination.

### Query Parameters
| Parameter | Type | Default | Description |
|---|---|---|---|
| `page` | Integer | `1` | Page number ($\ge 1$) |
| `page_size` | Integer | `10` | Items per page (1 to 100) |
| `search` | String | `None` | Case-insensitive multi-field search |
| `sort_by` | String | Domain default | Sorting field identifier |
| `sort_order` | String | `"desc"` | Sort direction: `"asc"` or `"desc"` |

### Unified Paginated Response Schema
```json
{
  "items": [ ... ],
  "total": 48,
  "page": 1,
  "page_size": 10,
  "total_pages": 5
}
```

---

## 5. Complete API Endpoint Inventory

### 5.1 System & Health

#### `GET /`
- **Auth**: None (Public)
- **Response** `200 OK`:
  ```json
  {
    "message": "Welcome to Blood Donation Management System API",
    "status": "running"
  }
  ```

#### `GET /api/v1/health`
- **Auth**: None (Public)
- **Response** `200 OK`:
  ```json
  {
    "status": "healthy",
    "service": "Blood Donation Management System",
    "database": "connected"
  }
  ```

---

### 5.2 Authentication (`/api/v1/auth`)

#### `POST /api/v1/auth/register`
- **Auth**: None (Public)
- **Request Body**:
  ```json
  {
    "full_name": "John Doe",
    "email": "johndoe@example.com",
    "password": "SecurePassword123!"
  }
  ```
  *(Password rule: min 8 chars, at least 1 letter and 1 digit).*
- **Response** `201 Created`:
  ```json
  {
    "id": 15,
    "full_name": "John Doe",
    "email": "johndoe@example.com",
    "role": "donor",
    "is_active": true
  }
  ```
- **Errors**: `409 Conflict` (Email already registered), `422 Unprocessable Entity`.

#### `POST /api/v1/auth/login`
- **Auth**: None (Public)
- **Request Body**:
  ```json
  {
    "email": "johndoe@example.com",
    "password": "SecurePassword123!"
  }
  ```
- **Response** `200 OK`:
  ```json
  {
    "access_token": "eyJhbGciOiJIUzI1...",
    "refresh_token": "eyJhbGciOiJIUzI1...",
    "token_type": "bearer",
    "expires_in": 1800
  }
  ```
- **Errors**: `401 Unauthorized` (`Incorrect email or password`).

#### `GET /api/v1/auth/me`
- **Auth**: `Bearer <access_token>`
- **Response** `200 OK`:
  ```json
  {
    "id": 15,
    "full_name": "John Doe",
    "email": "johndoe@example.com",
    "role": "donor",
    "is_active": true
  }
  ```

#### `POST /api/v1/auth/refresh`
- **Auth**: None (Public)
- **Request Body**:
  ```json
  {
    "refresh_token": "eyJhbGciOiJIUzI1NiIsInR5..."
  }
  ```
- **Response** `200 OK`:
  ```json
  {
    "access_token": "eyJhbGciOi...",
    "refresh_token": "eyJhbGciOi...",
    "token_type": "bearer",
    "expires_in": 1800
  }
  ```
- **Errors**: `401 Unauthorized` (`Invalid, expired, or revoked refresh token`).

#### `GET /api/v1/auth/admin-check`
- **Auth**: `Bearer <access_token>` (`role: admin`)
- **Response** `200 OK`: `{"message": "Welcome Admin", "user_id": 1, "role": "admin"}`

#### `GET /api/v1/auth/staff-check`
- **Auth**: `Bearer <access_token>` (`role: admin` or `role: staff`)
- **Response** `200 OK`: `{"message": "Staff access granted", "user_id": 2, "role": "staff"}`

---

### 5.3 User Management (`/api/v1/users`)

#### `GET /api/v1/users/`
- **Auth**: `admin` only
- **Response** `200 OK`: List of `UserResponse` objects.

#### `GET /api/v1/users/{user_id}`
- **Auth**: `admin` or Profile Owner (`current_user.id == user_id`)
- **Response** `200 OK`: `UserResponse`.
- **Errors**: `403 Forbidden`, `404 Not Found`.

#### `PATCH /api/v1/users/{user_id}`
- **Auth**: `admin` or Profile Owner
- **Request Body**:
  ```json
  {
    "full_name": "Johnathan Doe",
    "email": "newemail@example.com",
    "role": "staff",
    "is_active": true
  }
  ```
  *(Note: Non-admins cannot alter their own `role` or `is_active` fields).*
- **Response** `200 OK`: Updated `UserResponse`.

#### `DELETE /api/v1/users/{user_id}`
- **Auth**: `admin` only (Prevents deleting the last active admin).
- **Response** `200 OK`: `{"message": "User deleted successfully"}`.

---

### 5.4 Donor Management (`/api/v1/donors`)

#### `POST /api/v1/donors/`
- **Auth**: Authenticated User (Can register self; Staff/Admin can specify target `user_id`).
- **Request Body**:
  ```json
  {
    "user_id": null,
    "phone": "0912345678",
    "date_of_birth": "1998-05-15",
    "gender": "male",
    "blood_group": "O+",
    "address": "123 Main Street, Downtown"
  }
  ```
  *(Rules: Age 18–65, valid Blood Group: A+, A-, B+, B-, AB+, AB-, O+, O-).*
- **Response** `201 Created`: Full `DonorResponse`.

#### `GET /api/v1/donors/`
- **Auth**: Authenticated User
- **Query Parameters**: `page`, `page_size`, `search`, `name`, `phone`, `blood_group`, `gender`, `min_age`, `max_age`, `sort_by`, `sort_order`.
- **Response** `200 OK`:
  - **Staff/Admin**: Full `PaginatedDonorsResponse` including phone, full_name, email, address.
  - **Regular Donors**: Privacy-masked `PaginatedPublicDonorsResponse`:
    ```json
    {
      "items": [
        {
          "id": 1,
          "blood_group": "O+",
          "gender": "male",
          "age": 28,
          "last_donation_date": "2026-09-10",
          "created_at": "2026-10-01T12:00:00Z"
        }
      ],
      "total": 1,
      "page": 1,
      "page_size": 10,
      "total_pages": 1
    }
    ```

#### `GET /api/v1/donors/{donor_id}`
- **Auth**: Donor Owner, Staff, or Admin.
- **Response** `200 OK`: `DonorResponse`.

#### `PATCH /api/v1/donors/{donor_id}`
- **Auth**: Donor Owner, Staff, or Admin.
- **Request Body**: `phone`, `gender`, `blood_group`, `address`, `date_of_birth`.
- **Response** `200 OK`: `DonorResponse`.

#### `DELETE /api/v1/donors/{donor_id}`
- **Auth**: `admin` only.
- **Response** `200 OK`: `{"message": "Donor profile deleted successfully"}`.

---

### 5.5 Donation Management (`/api/v1/donations`)

#### `POST /api/v1/donations/`
- **Auth**: Staff, Admin, or Donor registering own donation.
- **Request Body**:
  ```json
  {
    "donor_id": 1,
    "donation_date": "2026-11-17",
    "quantity_ml": 450,
    "blood_group": "O+",
    "status": "completed",
    "notes": "Routine voluntary donation"
  }
  ```
  *(Rules: Quantity 100ml–800ml; Whole blood interval $\ge$ 56 days; Blood group must match donor's registered group; If `status="completed"`, stock increments atomically).*
- **Response** `201 Created`: `DonationResponse`.

#### `GET /api/v1/donations/`
- **Auth**: Authenticated User
- **Access Rule**: Regular users only see donations where `donor.user_id == current_user.id`. Staff and Admins see all donations.
- **Query Parameters**: `page`, `page_size`, `donor_id`, `blood_group`, `donation_date`, `status`, `search`, `sort_by`, `sort_order`.
- **Response** `200 OK`: `PaginatedDonationsResponse`.

#### `GET /api/v1/donations/{donation_id}`
- **Auth**: Donation Owner, Staff, or Admin.
- **Response** `200 OK`: `DonationResponse`.

#### `PATCH /api/v1/donations/{donation_id}`
- **Auth**: Staff or Admin.
- **Request Body**: `donation_date`, `quantity_ml`, `status`, `notes`.
- **Response** `200 OK`: `DonationResponse`.

#### `DELETE /api/v1/donations/{donation_id}`
- **Auth**: `admin` only.
- **Response** `200 OK`: `{"message": "Donation record deleted successfully"}`.

---

### 5.6 Blood Stock Management (`/api/v1/blood-stock`)

#### `GET /api/v1/blood-stock/summary`
- **Auth**: Authenticated User
- **Response** `200 OK`:
  ```json
  {
    "total_available_ml": 12500,
    "total_reserved_ml": 1500,
    "total_inventory_ml": 14000,
    "stock_by_group": [
      {
        "blood_group": "A+",
        "available_ml": 2500,
        "reserved_ml": 500,
        "total_ml": 3000,
        "status": "sufficient"
      },
      {
        "blood_group": "O-",
        "available_ml": 450,
        "reserved_ml": 0,
        "total_ml": 450,
        "status": "low"
      }
    ]
  }
  ```

#### `GET /api/v1/blood-stock/`
- **Auth**: Authenticated User
- **Query Parameters**: `page`, `page_size`, `blood_group`, `min_quantity`, `max_quantity`, `sort_by`, `sort_order`.
- **Response** `200 OK`: `PaginatedBloodStockResponse`.

#### `GET /api/v1/blood-stock/group/{blood_group}`
- **Auth**: Authenticated User (URL-encode `+` as `%2B`, e.g., `/group/A%2B`).
- **Response** `200 OK`: `BloodStockResponse`.

#### `GET /api/v1/blood-stock/{stock_id}`
- **Auth**: Authenticated User.
- **Response** `200 OK`: `BloodStockResponse`.

#### `PATCH /api/v1/blood-stock/{stock_id}`
- **Auth**: `admin` only.
- **Request Body**:
  ```json
  {
    "available_quantity_ml": 3000,
    "reserved_quantity_ml": 200
  }
  ```
  *(Values cannot be negative).*
- **Response** `200 OK`: `BloodStockResponse`.

---

### 5.7 Blood Request Management (`/api/v1/blood-requests`)

#### `POST /api/v1/blood-requests/`
- **Auth**: Authenticated User.
- **Request Body**:
  ```json
  {
    "patient_name": "Jane Smith",
    "hospital_name": "General City Hospital",
    "hospital_address": "Suite 400, Medical Plaza",
    "blood_group": "A+",
    "quantity_ml": 450,
    "urgency": "high",
    "contact_phone": "0912345678",
    "required_by": "2026-11-20T10:00:00Z",
    "notes": "Emergency surgery"
  }
  ```
  *(Status initialized to `"pending"`; no stock deducted on creation).*
- **Response** `201 Created`: `BloodRequestResponse`.

#### `GET /api/v1/blood-requests/`
- **Auth**: Authenticated User.
- **Access Rule**: Regular users only see requests they created (`user_id == current_user.id`). Staff/Admins see all requests.
- **Query Parameters**: `page`, `page_size`, `blood_group`, `status`, `hospital_name`, `patient_name`, `search`, `request_date`, `start_date`, `end_date`, `sort_by`, `sort_order`.
- **Response** `200 OK`: `PaginatedBloodRequestsResponse`.

#### `GET /api/v1/blood-requests/{request_id}`
- **Auth**: Request Creator, Staff, or Admin.
- **Response** `200 OK`: `BloodRequestResponse`.

#### `PATCH /api/v1/blood-requests/{request_id}`
- **Auth**: Request Creator, Staff, or Admin (Only allowed while status is `"pending"`).
- **Request Body**: `patient_name`, `hospital_name`, `hospital_address`, `quantity_ml`, `urgency`, `contact_phone`, `required_by`, `notes`.
- **Response** `200 OK`: `BloodRequestResponse`.

#### `POST /api/v1/blood-requests/{request_id}/approve`
- **Auth**: Staff or Admin.
- **Request Body**: `{"notes": "Approved by Dr. John"}`.
- **Rule**: Transition: `pending` $\rightarrow$ `approved`.
- **Response** `200 OK`: `BloodRequestResponse`.

#### `POST /api/v1/blood-requests/{request_id}/reject`
- **Auth**: Staff or Admin.
- **Request Body**: `{"notes": "Insufficient donor match data"}`.
- **Rule**: Transition: `pending` $\rightarrow$ `rejected` (terminal state).
- **Response** `200 OK`: `BloodRequestResponse`.

#### `POST /api/v1/blood-requests/{request_id}/cancel`
- **Auth**: Request Creator, Staff, or Admin.
- **Request Body**: `{"notes": "Patient transferred"}`.
- **Rule**: Transition: `pending` or `approved` $\rightarrow$ `cancelled` (terminal state).
- **Response** `200 OK`: `BloodRequestResponse`.

#### `POST /api/v1/blood-requests/{request_id}/fulfill`
- **Auth**: Staff or Admin.
- **Request Body**: `{"notes": "Transfusion completed"}`.
- **Rule**: Must be in `"approved"` status. Atomically verifies available stock, deducts `quantity_ml` exactly once, and transitions to `"fulfilled"` (terminal state). Fails with `400 Bad Request` if stock is insufficient.
- **Response** `200 OK`: `BloodRequestResponse`.

---

### 5.8 Dashboard Analytics (`/api/v1/dashboard`)

*All dashboard endpoints require `staff` or `admin` role.*

#### `GET /api/v1/dashboard/summary`
- **Auth**: Staff or Admin.
- **Response** `200 OK`:
  ```json
  {
    "total_donors": 120,
    "total_donations": 450,
    "total_requests": 65,
    "pending_requests": 8,
    "total_blood_stock_ml": 25000,
    "low_stock_groups": ["O-", "AB-"]
  }
  ```

#### `GET /api/v1/dashboard/donations`
- **Auth**: Staff or Admin.
- **Query Parameters**: `start_date`, `end_date`.
- **Response** `200 OK`: Total donations count, total volume ml, breakdown by blood group and donation status.

#### `GET /api/v1/dashboard/blood-stock`
- **Auth**: Staff or Admin.
- **Response** `200 OK`: Stock distribution across all 8 blood groups, available vs reserved ratio, critical shortages.

#### `GET /api/v1/dashboard/blood-requests`
- **Auth**: Staff or Admin.
- **Query Parameters**: `start_date`, `end_date`.
- **Response** `200 OK`: Requests by status (pending, approved, rejected, fulfilled, cancelled), urgency metrics, and blood group demand.

#### `GET /api/v1/dashboard/monthly-trends`
- **Auth**: Staff or Admin.
- **Query Parameters**: `months` (default 6).
- **Response** `200 OK`: Array of monthly data points `{ "month": "2026-10", "donation_count": 42, "total_volume_ml": 18900 }`.

---

## 6. Frontend Integration Best Practices

1. **URL Query Encoding**:
   - When filtering by blood group containing `+` (e.g. `A+`, `O+`, `AB+`), ensure your HTTP client URL-encodes `+` as `%2B` (e.g., `?blood_group=A%2B`).
2. **Date Format**:
   - Dates must be ISO 8601 strings: `YYYY-MM-DD` (e.g., `2026-11-17`) for dates, and `YYYY-MM-DDTHH:MM:SSZ` for timestamps.
3. **Role-Based Views**:
   - Decode user role from `GET /api/v1/auth/me` to toggle UI navigation (e.g. show Dashboard and Inventory management only to `admin` and `staff` roles).
4. **Correlation Tracking**:
   - You can inspect `response.headers["x-correlation-id"]` when logging errors for backend troubleshooting.

