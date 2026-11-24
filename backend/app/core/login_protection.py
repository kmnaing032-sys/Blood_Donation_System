import time
import asyncio
from typing import Dict, Tuple, Optional


class BruteForceProtector:
    """In-memory failed login tracking and progressive lockout.
    
    Tracks failed authentication attempts keyed by (client_ip, email).
    Key features:
    - Threshold: 5 failed attempts within 5 minutes triggers a 15-minute lockout.
    - Temporary: Lockout automatically expires after duration; accounts are never permanently locked.
    - Uniform Error: Reports generic message ('Incorrect email or password' or 'Account temporarily locked').
    - Does not reveal whether user/email exists.
    - Successful login resets the counter.
    """

    def __init__(
        self,
        max_attempts: int = 5,
        window_seconds: int = 300,       # 5 minutes observation window
        lockout_duration_seconds: int = 900,  # 15 minutes lockout
    ):
        self.max_attempts = max_attempts
        self.window_seconds = window_seconds
        self.lockout_duration_seconds = lockout_duration_seconds
        # Key: (ip, email) -> {"attempts": [timestamp, ...], "locked_until": timestamp}
        self._state: Dict[Tuple[str, str], dict] = {}
        self._lock = asyncio.Lock()

    async def check_lockout(self, ip: str, email: str) -> Tuple[bool, int]:
        """Check if client/email combo is locked out.
        
        Returns:
            (is_locked: bool, remaining_lockout_seconds: int)
        """
        key = (ip, email.strip().lower())
        now = time.time()

        async with self._lock:
            entry = self._state.get(key)
            if not entry:
                return False, 0

            locked_until = entry.get("locked_until", 0)
            if locked_until > now:
                remaining = int(locked_until - now)
                return True, max(1, remaining)
            
            # If lockout expired, clear lockout status
            if locked_until > 0 and locked_until <= now:
                entry["locked_until"] = 0
                entry["attempts"] = []

            return False, 0

    async def record_failure(self, ip: str, email: str) -> Tuple[bool, int]:
        """Record a failed login attempt.
        
        Returns:
            (became_locked: bool, lockout_seconds: int)
        """
        key = (ip, email.strip().lower())
        now = time.time()
        window_start = now - self.window_seconds

        async with self._lock:
            entry = self._state.setdefault(key, {"attempts": [], "locked_until": 0})
            
            # Filter attempts older than the window
            entry["attempts"] = [ts for ts in entry["attempts"] if ts > window_start]
            entry["attempts"].append(now)

            if len(entry["attempts"]) >= self.max_attempts:
                locked_until = now + self.lockout_duration_seconds
                entry["locked_until"] = locked_until
                return True, self.lockout_duration_seconds

            return False, 0

    async def record_success(self, ip: str, email: str):
        """Reset failed attempts upon successful login."""
        key = (ip, email.strip().lower())
        async with self._lock:
            self._state.pop(key, None)

    async def clear_all(self):
        """Utility for test suites to clear all tracker states."""
        async with self._lock:
            self._state.clear()


# Global singleton instance
login_protector = BruteForceProtector()
