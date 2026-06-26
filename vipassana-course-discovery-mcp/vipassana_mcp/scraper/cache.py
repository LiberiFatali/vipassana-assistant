"""
In-memory TTL cache for course schedule data.

Layered fallback strategy:
  1. Live scrape (primary)  → TTL: 10 minutes in-memory
  2. Cached scrape          → Returns last successful scrape result within 24h
  3. Static fallback JSON   → schedule_fallback.json (manually maintained)
"""

from __future__ import annotations

import json
from datetime import datetime, timedelta
from pathlib import Path
from typing import Optional


class ScheduleCache:
    """
    Two-tier in-memory cache for VRI course schedule data.

    Tier 1: Short-TTL cache (default 10 min) — used for de-duplicating requests.
    Tier 2: Long-TTL cache (default 24h) — used as fallback when scrape fails.
    """

    _FALLBACK_PATH = Path(__file__).parent.parent / "data" / "schedule_fallback.json"

    def __init__(
        self,
        ttl_minutes: int = 10,
        fallback_ttl_hours: int = 24,
    ) -> None:
        self._ttl = timedelta(minutes=ttl_minutes)
        self._fallback_ttl = timedelta(hours=fallback_ttl_hours)

        # {key: (courses, timestamp)}
        self._store: dict[str, tuple[list[dict], datetime]] = {}

    # ── Public interface ─────────────────────────────────────────────────────

    def get(self, key: str) -> Optional[list[dict]]:
        """Return cached value if within short TTL, else None."""
        if key not in self._store:
            return None
        courses, timestamp = self._store[key]
        if datetime.utcnow() - timestamp <= self._ttl:
            return courses
        return None

    def set(self, key: str, courses: list[dict]) -> None:
        """Store courses with current UTC timestamp."""
        self._store[key] = (courses, datetime.utcnow())

    def get_stale(self, key: str) -> Optional[list[dict]]:
        """
        Return cached value even if short TTL expired, as long as within fallback TTL.
        Used when live scrape fails — prefer stale data over static fallback.
        """
        if key not in self._store:
            return None
        courses, timestamp = self._store[key]
        if datetime.utcnow() - timestamp <= self._fallback_ttl:
            return courses
        return None

    def get_fallback(self, center_id: str) -> list[dict]:
        """
        Load courses from schedule_fallback.json filtered by center_id.
        Returns [] if the file is missing or malformed.
        """
        try:
            data = json.loads(self._FALLBACK_PATH.read_text(encoding="utf-8"))
            courses = data.get("courses", [])
            return [c for c in courses if c.get("center_id") == center_id]
        except (FileNotFoundError, json.JSONDecodeError, KeyError):
            return []

    def get_or_fallback(
        self,
        key: str,
        center_id: str,
    ) -> tuple[list[dict], str]:
        """
        Attempt to return data in this priority order:
          1. Stale cache (within 24h)  → freshness = "cached"
          2. Static fallback JSON      → freshness = "fallback"

        Returns:
            (courses, freshness_label)
        """
        stale = self.get_stale(key)
        if stale is not None:
            return stale, "cached"

        fallback = self.get_fallback(center_id)
        return fallback, "fallback"

    def clear(self, key: Optional[str] = None) -> None:
        """Clear one key or the entire cache."""
        if key:
            self._store.pop(key, None)
        else:
            self._store.clear()
