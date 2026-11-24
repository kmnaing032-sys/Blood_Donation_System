import time
import asyncio
from typing import Dict, Tuple, Optional
from fastapi import Request, HTTPException, status
from pydantic import BaseModel

class RateLimitRule(BaseModel):
    requests: int
    window_seconds: int

# Default policies tailored to endpoint categories
RATE_LIMIT_RULES: Dict[str, RateLimitRule] = {
    # High-sensitivity authentication endpoints
    "auth:login": RateLimitRule(requests=5, window_seconds=60),         # 5 attempts per min
    "auth:register": RateLimitRule(requests=5, window_seconds=60),      # 5 registrations per min
    "auth:refresh": RateLimitRule(requests=20, window_seconds=60),      # 20 token refreshes per min
    "auth:change-password": RateLimitRule(requests=15, window_seconds=60), # 15 password changes per min
    "users:reset-password": RateLimitRule(requests=20, window_seconds=60), # 20 admin resets per min
    
    # Email operations
    "email:prefs": RateLimitRule(requests=15, window_seconds=60),       # 15 preference updates per min
    
    # Database backup operations (expensive)
    "backup:create": RateLimitRule(requests=3, window_seconds=300),     # 3 backups per 5 mins
    
    # General API fallback limit
    "default": RateLimitRule(requests=120, window_seconds=60),          # 120 requests per min
}


class RateLimiter:
    """Sliding-window rate limiter.
    
    Uses high-resolution monotonic timestamps.
    Safe against arbitrary client-spoofed headers by prioritizing trusted socket IP
    unless explicit trusted reverse-proxy configurations are defined.
    """

    def __init__(self):
        # Key: (category, identifier) -> list of timestamp floats
        self._records: Dict[Tuple[str, str], list[float]] = {}
        self._lock = asyncio.Lock()

    @staticmethod
    def get_client_ip(request: Request) -> str:
        """Extract client IP safely.
        
        Uses request.client.host (the socket connection IP).
        Arbitrary X-Forwarded-For headers from untrusted clients are not trusted directly.
        """
        if request.client and request.client.host:
            return request.client.host
        return "127.0.0.1"

    async def check_rate_limit(
        self,
        request: Request,
        category: str = "default",
        custom_identifier: Optional[str] = None,
    ) -> Tuple[bool, int, int]:
        """Check if request exceeds rate limit.
        
        Returns:
            (is_allowed: bool, retry_after_seconds: int, remaining: int)
        """
        rule = RATE_LIMIT_RULES.get(category, RATE_LIMIT_RULES["default"])
        identifier = custom_identifier or self.get_client_ip(request)
        cache_key = (category, identifier)
        now = time.time()
        window_start = now - rule.window_seconds

        async with self._lock:
            # Clean timestamps older than the window
            timestamps = self._records.get(cache_key, [])
            valid_timestamps = [ts for ts in timestamps if ts > window_start]

            if len(valid_timestamps) >= rule.requests:
                # Rate limit exceeded
                oldest = valid_timestamps[0]
                retry_after = max(1, int(oldest + rule.window_seconds - now))
                self._records[cache_key] = valid_timestamps
                return False, retry_after, 0

            # Record this attempt
            valid_timestamps.append(now)
            self._records[cache_key] = valid_timestamps
            remaining = rule.requests - len(valid_timestamps)
            return True, 0, remaining

    async def reset(self, category: str, identifier: str):
        """Reset limits for a specific identifier (e.g. after successful authentication)."""
        async with self._lock:
            self._records.pop((category, identifier), None)

    async def clear_all(self):
        """Utility for tests to reset all rate limit trackers."""
        async with self._lock:
            self._records.clear()


# Global singleton instance
rate_limiter = RateLimiter()


def rate_limit(category: str):
    """FastAPI dependency to enforce rate limiting on specific endpoints."""
    async def dependency(request: Request):
        allowed, retry_after, remaining = await rate_limiter.check_rate_limit(
            request=request, category=category
        )
        if not allowed:
            raise HTTPException(
                status_code=status.HTTP_429_TOO_MANY_REQUESTS,
                detail=f"Too many requests. Please try again in {retry_after} seconds.",
                headers={
                    "Retry-After": str(retry_after),
                    "X-RateLimit-Limit": str(RATE_LIMIT_RULES.get(category, RATE_LIMIT_RULES['default']).requests),
                    "X-RateLimit-Remaining": "0",
                },
            )
        request.state.ratelimit_remaining = remaining
        return True

    return dependency
