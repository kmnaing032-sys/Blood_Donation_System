from datetime import datetime, timezone
from fastapi import APIRouter, Depends, HTTPException, status, Response
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.database.dependencies import get_db
from app.models.user import User
from app.core.permissions import require_admin
from app.schemas.health import (
    BasicHealthResponse,
    ReadinessResponse,
    SystemDiagnosticsResponse,
    DatabaseDiagnostics,
)
from app.services.health_service import HealthService


router = APIRouter(prefix="/health", tags=["Health & Diagnostics"])


@router.get(
    "/",
    response_model=BasicHealthResponse,
    summary="Basic liveness health check",
    description="Confirms that the FastAPI application process is responding. Publicly accessible without secrets.",
)
async def basic_health():
    return {
        "status": "healthy",
        "application": settings.APP_NAME,
        "version": settings.APP_VERSION,
    }


@router.get(
    "/ready",
    response_model=ReadinessResponse,
    summary="Application readiness check",
    description="Verifies PostgreSQL connectivity. Returns 200 when ready, 503 Service Unavailable when DB is down.",
)
async def readiness_check(
    response: Response,
    db: AsyncSession = Depends(get_db),
):
    is_connected, latency_ms, _ = await HealthService.check_database_connectivity(db)
    now = datetime.now(timezone.utc)

    if not is_connected:
        response.status_code = status.HTTP_503_SERVICE_UNAVAILABLE
        return {
            "status": "unavailable",
            "database": "disconnected",
            "response_time_ms": latency_ms,
            "timestamp": now,
        }

    return {
        "status": "ready",
        "database": "connected",
        "response_time_ms": latency_ms,
        "timestamp": now,
    }


@router.get(
    "/system",
    response_model=SystemDiagnosticsResponse,
    summary="Detailed system diagnostics (Admin only)",
    description="Provides detailed operational metrics including DB latency, uptime, and versions. Restricted to administrators.",
)
async def system_diagnostics(
    db: AsyncSession = Depends(get_db),
    current_admin: User = Depends(require_admin),
):
    is_connected, latency_ms, _ = await HealthService.check_database_connectivity(db)
    runtime = HealthService.get_runtime_info()
    uptime = HealthService.get_application_uptime()
    now = datetime.now(timezone.utc)

    db_diag = DatabaseDiagnostics(
        status="connected" if is_connected else "disconnected",
        response_time_ms=latency_ms,
        dialect="postgresql+asyncpg",
        pool_size=10,
    )

    return {
        "status": "operational" if is_connected else "degraded",
        "application_name": settings.APP_NAME,
        "application_version": settings.APP_VERSION,
        "python_version": runtime["python_version"],
        "environment": "development" if settings.DEBUG else "production",
        "uptime_seconds": uptime,
        "server_timestamp": now,
        "database": db_diag,
    }
