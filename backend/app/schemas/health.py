import time
from datetime import datetime, timezone
from typing import Optional, Dict, Any
from pydantic import BaseModel, ConfigDict, Field


class BasicHealthResponse(BaseModel):
    status: str
    application: str
    version: str

    model_config = ConfigDict(from_attributes=True)


class ReadinessResponse(BaseModel):
    status: str  # "ready" or "unavailable"
    database: str  # "connected" or "disconnected"
    response_time_ms: Optional[float] = None
    timestamp: datetime

    model_config = ConfigDict(from_attributes=True)


class DatabaseDiagnostics(BaseModel):
    status: str
    response_time_ms: float
    dialect: str
    pool_size: Optional[int] = None


class SystemDiagnosticsResponse(BaseModel):
    status: str
    application_name: str
    application_version: str
    python_version: str
    environment: str
    uptime_seconds: float
    server_timestamp: datetime
    database: DatabaseDiagnostics

    model_config = ConfigDict(from_attributes=True)
