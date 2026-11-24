import sys
import time
from datetime import datetime, timezone
from typing import Tuple, Dict, Any, Optional

from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import text

# Record process startup timestamp for uptime calculations
START_TIME = time.time()


class HealthService:
    
    @staticmethod
    async def check_database_connectivity(
        db: AsyncSession
    ) -> Tuple[bool, float, Optional[str]]:
        """Check PostgreSQL connectivity and measure latency."""

        start = time.perf_counter()

        try:
            await db.execute(text("SELECT 1"))

            latency_ms = round(
                (time.perf_counter() - start) * 1000, 2
            )

            return True, latency_ms, None

        except Exception as exc:
            latency_ms = round(
                (time.perf_counter() - start) * 1000, 2
            )

            error_message = f"{type(exc).__name__}: {exc}"

            print(
                f"[DATABASE HEALTH CHECK FAILED] {error_message}",
                file=sys.stderr,
                flush=True
            )

            return False, latency_ms, error_message

    @staticmethod
    def get_application_uptime() -> float:
        """Return the uptime of the Python backend process in seconds."""
        return round(time.time() - START_TIME, 2)

    @staticmethod
    def get_runtime_info() -> Dict[str, str]:
        """Return non-sensitive Python runtime version info."""
        return {
            "python_version": sys.version.split()[0],
        }
