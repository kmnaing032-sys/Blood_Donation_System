
import logging
import uuid
from contextlib import asynccontextmanager

from fastapi import FastAPI, Request
from fastapi.responses import HTMLResponse
from fastapi.staticfiles import StaticFiles
from fastapi.openapi.docs import get_swagger_ui_html, get_swagger_ui_oauth2_redirect_html
from fastapi.middleware.cors import CORSMiddleware
from fastapi.exceptions import RequestValidationError
from starlette.exceptions import HTTPException as StarletteHTTPException
from sqlalchemy.exc import IntegrityError, SQLAlchemyError

from app.core.config import settings
from app.database.database import close_database
from app.api.v1.api import api_router
from app.core.exceptions import (
    http_exception_handler,
    validation_exception_handler,
    integrity_error_handler,
    database_error_handler,
    global_exception_handler,
)

# Configure structured logging
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] [%(name)s] %(message)s",
)
logger = logging.getLogger("blood_donation_api")


@asynccontextmanager
async def lifespan(app: FastAPI):
    logger.info("Blood Donation System API Starting...")
    yield
    await close_database()
    logger.info("Database Connection Closed.")


app = FastAPI(
    title=settings.APP_NAME,
    version=settings.APP_VERSION,
    description="Blood Donation Management System API with strict validation and centralized error handling",
    debug=settings.DEBUG,
    lifespan=lifespan,
    docs_url=None,  # Custom Swagger UI route configured below with local stripped CSS
)

# Mount local static files for Swagger UI assets (stripped of external source map directives)
app.mount("/static", StaticFiles(directory="app/static"), name="static")

@app.get("/docs", include_in_schema=False)
async def custom_swagger_ui_html(req: Request) -> HTMLResponse:
    root_path = req.scope.get("root_path", "").rstrip("/")
    openapi_url = root_path + (app.openapi_url or "/openapi.json")
    oauth2_redirect_url = root_path + "/docs/oauth2-redirect"
    return get_swagger_ui_html(
        openapi_url=openapi_url,
        title=f"{app.title} - Swagger UI",
        oauth2_redirect_url=oauth2_redirect_url,
        init_oauth=app.swagger_ui_init_oauth,
        swagger_ui_parameters=app.swagger_ui_parameters,
        swagger_js_url="https://cdn.jsdelivr.net/npm/swagger-ui-dist@5/swagger-ui-bundle.js",
        swagger_css_url="/static/swagger-ui/swagger-ui.css",
        swagger_favicon_url="https://fastapi.tiangolo.com/img/favicon.png",
    )

@app.get("/docs/oauth2-redirect", include_in_schema=False)
async def swagger_ui_redirect() -> HTMLResponse:
    return get_swagger_ui_oauth2_redirect_html()

# Register Centralized Exception Handlers
app.add_exception_handler(StarletteHTTPException, http_exception_handler)
app.add_exception_handler(RequestValidationError, validation_exception_handler)
app.add_exception_handler(IntegrityError, integrity_error_handler)
app.add_exception_handler(SQLAlchemyError, database_error_handler)
app.add_exception_handler(Exception, global_exception_handler)


# Maximum permitted request body size in bytes (10 Megabytes)
MAX_REQUEST_BODY_SIZE = 10 * 1024 * 1024

# Correlation ID Middleware & Security Headers Middleware
@app.middleware("http")
async def security_and_correlation_middleware(request: Request, call_next):
    # Enforce request size boundary protection
    content_length = request.headers.get("content-length")
    if content_length and int(content_length) > MAX_REQUEST_BODY_SIZE:
        from fastapi.responses import JSONResponse
        return JSONResponse(
            status_code=413,
            content={
                "success": False,
                "message": "Request payload exceeds maximum permitted size (10MB)",
                "detail": "Payload too large",
                "error_code": "PAYLOAD_TOO_LARGE",
                "correlation_id": getattr(request.state, "correlation_id", "req-oversized"),
            },
        )

    corr_id = request.headers.get("X-Correlation-ID") or f"req-{uuid.uuid4().hex[:12]}"
    request.state.correlation_id = corr_id
    response = await call_next(request)
    
    # Traceability
    response.headers["X-Correlation-ID"] = corr_id
    
    # Standard HTTP Security Headers
    response.headers["X-Content-Type-Options"] = "nosniff"
    response.headers["X-Frame-Options"] = "DENY"
    response.headers["X-XSS-Protection"] = "1; mode=block"
    response.headers["Referrer-Policy"] = "strict-origin-when-cross-origin"

    # Sensitive response cache-control protection (prevent sensitive data caching in intermediate proxies)
    path = request.url.path
    if path.startswith("/api/v1"):
        response.headers["Cache-Control"] = "no-store, no-cache, must-revalidate, proxy-revalidate"
        response.headers["Pragma"] = "no-cache"
        response.headers["Expires"] = "0"
    
    # Content-Security-Policy (CSP):
    # For documentation routes (/docs, /redoc, /docs/oauth2-redirect), allow CDN scripts, CSS, fonts, and favicon
    # while pinning the exact SHA-256 hash for Swagger UI's inline script.
    # For all other application API routes, enforce the strict default-src 'self' policy.
    if path in ("/docs", "/redoc", "/docs/oauth2-redirect"):
        response.headers["Content-Security-Policy"] = (
            "default-src 'self'; "
            "script-src 'self' https://cdn.jsdelivr.net 'sha256-QOOQu4W1oxGqd2nbXbxiA1Di6OHQOLQD+o+G9oWL8YY='; "
            "style-src 'self' https://cdn.jsdelivr.net https://fonts.googleapis.com 'unsafe-inline'; "
            "font-src 'self' https://fonts.gstatic.com; "
            "img-src 'self' data: https://fastapi.tiangolo.com https://cdn.jsdelivr.net; "
            "frame-ancestors 'none';"
        )
    else:
        response.headers["Content-Security-Policy"] = "default-src 'self'; frame-ancestors 'none';"
    
    return response


# Parse configured CORS origins
configured_origins = [
    origin.strip()
    for origin in settings.ALLOWED_ORIGINS.split(",")
    if origin.strip()
]

app.add_middleware(
    CORSMiddleware,
    allow_origins=configured_origins,
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allow_headers=["*"],
)


@app.get("/", tags=["Root"])
async def root():
    return {
        "message": "Welcome to Blood Donation Management System API",
        "status": "running",
    }


app.include_router(
    api_router,
    prefix="/api/v1",
)