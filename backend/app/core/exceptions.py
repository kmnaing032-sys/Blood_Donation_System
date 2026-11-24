import logging
import uuid
from typing import Any, Optional
from fastapi import Request, status
from fastapi.responses import JSONResponse
from fastapi.exceptions import RequestValidationError
from starlette.exceptions import HTTPException as StarletteHTTPException
from sqlalchemy.exc import IntegrityError, OperationalError, DatabaseError, SQLAlchemyError
from pydantic import BaseModel, Field

# Configure logging
logger = logging.getLogger("blood_donation_api")


class ErrorResponse(BaseModel):
    """Consistent API Error Response Model."""
    success: bool = Field(default=False, description="Always false for error responses")
    message: str = Field(..., description="High-level user-friendly error message")
    detail: Any = Field(..., description="Detailed explanation or validation error list")
    error_code: str = Field(..., description="Standardized application or HTTP error code")
    correlation_id: Optional[str] = Field(default=None, description="Unique trace identifier for debugging")


def _get_correlation_id(request: Request) -> str:
    """Extract or generate request correlation ID."""
    corr_id = getattr(request.state, "correlation_id", None)
    if not corr_id:
        corr_id = request.headers.get("X-Correlation-ID") or f"req-{uuid.uuid4().hex[:12]}"
        request.state.correlation_id = corr_id
    return corr_id


def format_error_response(
    status_code: int,
    message: str,
    detail: Any,
    error_code: str,
    correlation_id: str,
) -> JSONResponse:
    """Build standardized JSONResponse for error scenarios."""
    content = {
        "success": False,
        "message": message,
        "detail": detail,
        "error_code": error_code,
        "correlation_id": correlation_id,
    }
    return JSONResponse(
        status_code=status_code,
        content=content,
        headers={"X-Correlation-ID": correlation_id},
    )


async def http_exception_handler(request: Request, exc: StarletteHTTPException) -> JSONResponse:
    """Handles standard HTTPExceptions raised by application or dependencies."""
    corr_id = _get_correlation_id(request)
    
    # Map status codes to readable error codes
    code_map = {
        status.HTTP_400_BAD_REQUEST: "BAD_REQUEST",
        status.HTTP_401_UNAUTHORIZED: "UNAUTHORIZED",
        status.HTTP_403_FORBIDDEN: "FORBIDDEN",
        status.HTTP_404_NOT_FOUND: "NOT_FOUND",
        status.HTTP_409_CONFLICT: "CONFLICT",
        status.HTTP_422_UNPROCESSABLE_ENTITY: "UNPROCESSABLE_ENTITY",
        status.HTTP_500_INTERNAL_SERVER_ERROR: "INTERNAL_SERVER_ERROR",
        status.HTTP_503_SERVICE_UNAVAILABLE: "SERVICE_UNAVAILABLE",
    }
    error_code = code_map.get(exc.status_code, f"HTTP_{exc.status_code}")
    message = exc.detail if isinstance(exc.detail, str) else "An HTTP error occurred"

    # Only log 5xx as errors, others as warnings/info
    if exc.status_code >= 500:
        logger.error(
            f"[{corr_id}] HTTP {exc.status_code} Error: {exc.detail} on {request.method} {request.url.path}"
        )
    else:
        logger.warning(
            f"[{corr_id}] HTTP {exc.status_code} Client Error: {exc.detail} on {request.method} {request.url.path}"
        )

    headers = getattr(exc, "headers", None)
    response = format_error_response(
        status_code=exc.status_code,
        message=message,
        detail=exc.detail,
        error_code=error_code,
        correlation_id=corr_id,
    )
    if headers:
        for k, v in headers.items():
            response.headers[k] = v
    return response


async def validation_exception_handler(request: Request, exc: RequestValidationError) -> JSONResponse:
    """Handles Pydantic RequestValidationErrors with clear field-level details."""
    corr_id = _get_correlation_id(request)
    
    cleaned_errors = []
    for error in exc.errors():
        loc = list(error.get("loc", []))
        if loc and loc[0] in ("body", "query", "path"):
            loc = loc[1:]
        field_path = ".".join(str(item) for item in loc) if loc else "general"
        cleaned_errors.append({
            "field": field_path,
            "message": error.get("msg", "Invalid input value"),
            "type": error.get("type", "value_error"),
        })

    logger.warning(
        f"[{corr_id}] Validation Error on {request.method} {request.url.path}: {cleaned_errors}"
    )

    return format_error_response(
        status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
        message="Request validation failed. Please check the supplied parameters.",
        detail=cleaned_errors,
        error_code="VALIDATION_ERROR",
        correlation_id=corr_id,
    )


async def integrity_error_handler(request: Request, exc: IntegrityError) -> JSONResponse:
    """Handles database uniqueness, foreign key, or constraint violations securely."""
    corr_id = _get_correlation_id(request)
    orig_msg = str(getattr(exc, "orig", exc)).lower()

    logger.warning(
        f"[{corr_id}] Database Integrity Violation on {request.method} {request.url.path}: {orig_msg}"
    )

    if "unique constraint" in orig_msg or "duplicate key" in orig_msg:
        message = "A record with the given unique identifier or details already exists."
        error_code = "DUPLICATE_RECORD"
        status_code = status.HTTP_409_CONFLICT
    elif "foreign key constraint" in orig_msg:
        message = "Referenced entity does not exist or cannot be modified due to dependent records."
        error_code = "FOREIGN_KEY_VIOLATION"
        status_code = status.HTTP_400_BAD_REQUEST
    elif "check constraint" in orig_msg:
        message = "Database check constraint violated. Submitted values exceed permitted boundaries."
        error_code = "CONSTRAINT_VIOLATION"
        status_code = status.HTTP_400_BAD_REQUEST
    else:
        message = "Database integrity constraint violated."
        error_code = "INTEGRITY_ERROR"
        status_code = status.HTTP_409_CONFLICT

    return format_error_response(
        status_code=status_code,
        message=message,
        detail=message,
        error_code=error_code,
        correlation_id=corr_id,
    )


async def database_error_handler(request: Request, exc: SQLAlchemyError) -> JSONResponse:
    """Handles operational/connection SQLAlchemy database failures."""
    corr_id = _get_correlation_id(request)
    logger.error(
        f"[{corr_id}] Database Error on {request.method} {request.url.path}: {str(exc)}",
        exc_info=True,
    )

    is_conn_error = isinstance(exc, (OperationalError, DatabaseError))
    status_code = status.HTTP_503_SERVICE_UNAVAILABLE if is_conn_error else status.HTTP_500_INTERNAL_SERVER_ERROR
    error_code = "DATABASE_UNAVAILABLE" if is_conn_error else "DATABASE_ERROR"
    message = "Database service is temporarily unavailable. Please try again later." if is_conn_error else "An unexpected database error occurred."

    return format_error_response(
        status_code=status_code,
        message=message,
        detail=message,
        error_code=error_code,
        correlation_id=corr_id,
    )


async def global_exception_handler(request: Request, exc: Exception) -> JSONResponse:
    """Catch-all unexpected exception handler preventing exposure of internal details."""
    corr_id = _get_correlation_id(request)
    logger.error(
        f"[{corr_id}] Unhandled Exception on {request.method} {request.url.path}: {str(exc)}",
        exc_info=True,
    )

    return format_error_response(
        status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
        message="An unexpected internal server error occurred.",
        detail="Please contact support or try again later.",
        error_code="INTERNAL_SERVER_ERROR",
        correlation_id=corr_id,
    )

