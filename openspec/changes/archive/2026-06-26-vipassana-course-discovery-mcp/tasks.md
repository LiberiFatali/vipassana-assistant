# Tasks: Vipassana Course Discovery MCP Server

## Overview

Build a Python MCP server with 3 tools for live course discovery at UCENLIST centers.
All files go under a new `vipassana-course-discovery-mcp/` directory in the workspace root.

---

## Task 1: Project Scaffold

Create the project directory structure and configuration files.

**Files to create:**

### `vipassana-course-discovery-mcp/pyproject.toml`

```toml
[project]
name = "vipassana-mcp"
version = "0.1.0"
description = "MCP server for Vipassana course discovery at UCENLIST centers"
requires-python = ">=3.11"

dependencies = [
    "mcp[cli]>=1.0.0",
    "httpx>=0.27.0",
    "beautifulsoup4>=4.12.0",
    "lxml>=5.0.0",
    "python-dateutil>=2.9.0",
]

[project.scripts]
vipassana-mcp = "vipassana_mcp.server:main"

[build-system]
requires = ["hatchling"]
build-backend = "hatchling.build"
```

### `vipassana-course-discovery-mcp/README.md`

Brief description of the MCP server, how to install and run it, and the 3 tools it exposes.

### Package init files

- `vipassana-course-discovery-mcp/vipassana_mcp/__init__.py` (empty)
- `vipassana-course-discovery-mcp/vipassana_mcp/tools/__init__.py` (empty)
- `vipassana-course-discovery-mcp/vipassana_mcp/scraper/__init__.py` (empty)

---

## Task 2: Static Center Data

Create the static data file for center contact info. No scraping needed — this is
hardcoded from the official website.

### `vipassana-course-discovery-mcp/vipassana_mcp/data/centers.py`

```python
CENTERS = {
    "virocana": {
        "name": "Dhamma Virocana",
        "name_vi": "Dhamma Virocana",
        "subtitle": "The Sun of Dhamma",
        "city": "Ha Noi",
        "city_vi": "Hà Nội",
        "address": "Số 15-17 ngõ Sala, đường Đồng Đò, thôn Minh Tân, xã Kim Anh, Hà Nội",
        "phone": "+84 966 894 936",
        "email": "contact.virocana@vridhamma.org",
        "website": "https://virocana.vridhamma.org/vi",
        "schedule_url_vi": "https://schedule.vridhamma.org/vi/courses/virocana",
        "schedule_url_en": "https://schedule.vridhamma.org/courses/virocana",
        "maps_url": "https://maps.app.goo.gl/PsH8cZkwznFiwMU99",
    },
    "vutthi": {
        "name": "Dhamma Vutthi",
        "name_vi": "Dhamma Vutthi",
        "subtitle": "The Monsoon Rain of Dhamma",
        "city": "Ho Chi Minh City",
        "city_vi": "TP. Hồ Chí Minh",
        "address": "112, đường 628, ấp Trại Đèn, Phước Hiệp, Củ Chi, TP. Hồ Chí Minh",
        "phone": "+84 942 255 050",
        "email": "contact.vutthi@vridhamma.org",
        "website": "https://vutthi.vridhamma.org/vi",
        "schedule_url_vi": "https://schedule.vridhamma.org/vi/courses/vutthi",
        "schedule_url_en": "https://schedule.vridhamma.org/courses/vutthi",
        "maps_url": None,  # Not found on official pages
    },
}
```

### `vipassana-course-discovery-mcp/vipassana_mcp/data/schedule_fallback.json`

Seed a fallback schedule with known 2026 courses at both centers. Use the format:

```json
{
  "generated_at": "2026-06-26",
  "note": "Manually seeded fallback. Update when courses change.",
  "courses": [
    {
      "center": "Dhamma Virocana",
      "center_id": "virocana",
      "location": "Ha Noi",
      "type": "10-day",
      "start_date": "2026-08-01",
      "end_date": "2026-08-12",
      "status": "unknown",
      "apply_url": "https://schedule.vridhamma.org/vi/courses/virocana",
      "notes": "Fallback data — check schedule.vridhamma.org for current status",
      "data_freshness": "fallback"
    }
  ]
}
```

> Note: Seed with actual dates discovered during development by visiting the schedule pages.

---

## Task 3: VRI Schedule Scraper

### `vipassana-course-discovery-mcp/vipassana_mcp/scraper/vri_schedule.py`

Implement an async scraper with the following interface:

```python
import httpx
from bs4 import BeautifulSoup
from datetime import datetime
from typing import Literal

VRI_SCHEDULE_URLS = {
    "virocana": {
        "vi": "https://schedule.vridhamma.org/vi/courses/virocana",
        "en": "https://schedule.vridhamma.org/courses/virocana",
    },
    "vutthi": {
        "vi": "https://schedule.vridhamma.org/vi/courses/vutthi",
        "en": "https://schedule.vridhamma.org/courses/vutthi",
    },
}

HEADERS = {
    "User-Agent": "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 "
                  "(KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    "Accept": "text/html,application/xhtml+xml",
    "Accept-Language": "vi-VN,vi;q=0.9,en-US;q=0.8,en;q=0.7",
}


async def fetch_courses(
    center_id: Literal["virocana", "vutthi"],
    language: Literal["vi", "en"] = "vi",
) -> list[dict]:
    """
    Fetches and parses the course listing table from schedule.vridhamma.org.
    Returns a list of course dicts. Returns [] if no courses or table is empty.
    Raises ScraperError if site is unreachable.
    """


def parse_course_table(html: str, center_id: str) -> list[dict]:
    """
    Parses the HTML table with class 'tablesaw tablesaw-stack cols-5'.
    Extracts: apply_url, dates (start/end), course type, status, notes.
    Returns [] if tbody has no rows (JS-only render).
    """


def parse_status(row_html: str) -> str:
    """
    Infers status from row content:
    - 'full' if apply link text is 'Full' / 'Hết chỗ'
    - 'waitlist' if text contains 'Waitlist' / 'Danh sách chờ'
    - 'open' if there is a clickable apply link
    - 'unknown' as fallback
    """


def parse_dates(date_cell_text: str) -> tuple[str, str]:
    """
    Parses date ranges like '01 Aug - 12 Aug 2026' or '01/08 - 12/08/2026'.
    Returns (start_date_iso, end_date_iso) as 'YYYY-MM-DD'.
    """


class ScraperError(Exception):
    """Raised when the VRI schedule page cannot be fetched."""
```

---

## Task 4: In-Memory Cache

### `vipassana-course-discovery-mcp/vipassana_mcp/scraper/cache.py`

```python
from datetime import datetime, timedelta
from typing import Optional
import json
from pathlib import Path

class ScheduleCache:
    """
    Simple in-memory TTL cache for course schedules.
    Falls back to schedule_fallback.json if both live fetch and cache fail.
    """

    def __init__(self, ttl_minutes: int = 10):
        self._store: dict[str, tuple[list, datetime]] = {}
        self._ttl = timedelta(minutes=ttl_minutes)
        self._fallback_path = Path(__file__).parent.parent / "data" / "schedule_fallback.json"

    def get(self, key: str) -> Optional[list[dict]]:
        """Return cached value if within TTL, else None."""

    def set(self, key: str, value: list[dict]) -> None:
        """Store value with current timestamp."""

    def get_fallback(self, center_id: str) -> list[dict]:
        """
        Load courses from schedule_fallback.json filtered by center_id.
        Always returns a list (may be empty).
        """

    def get_or_fallback(self, key: str, center_id: str) -> tuple[list[dict], str]:
        """
        Returns (courses, freshness) where freshness is 'cached' or 'fallback'.
        """
```

---

## Task 5: MCP Tools Implementation

### `vipassana-course-discovery-mcp/vipassana_mcp/tools/list_courses.py`

```python
from typing import Literal, Optional
from vipassana_mcp.scraper.vri_schedule import fetch_courses, ScraperError
from vipassana_mcp.scraper.cache import ScheduleCache

_cache = ScheduleCache(ttl_minutes=10)


async def list_courses(
    center: Literal["virocana", "vutthi", "all"] = "all",
    language: Literal["en", "vi"] = "vi",
    course_type: Optional[str] = None,
) -> list[dict]:
    """
    Returns upcoming Vipassana courses at the specified UCENLIST center(s).
    
    Args:
        center: 'virocana' (Ha Noi), 'vutthi' (Ho Chi Minh City), or 'all'
        language: 'vi' for Vietnamese, 'en' for English  
        course_type: Optional filter, e.g. '10-day', 'short', 'satipatthana'
    
    Returns:
        List of course dicts with keys:
        center, center_id, location, type, start_date, end_date,
        status, apply_url, notes, data_freshness
    """
    centers_to_query = ["virocana", "vutthi"] if center == "all" else [center]
    results = []

    for c in centers_to_query:
        cache_key = f"{c}_{language}"
        cached = _cache.get(cache_key)
        
        if cached is not None:
            courses = cached
            freshness = "cached"
        else:
            try:
                courses = await fetch_courses(c, language)
                _cache.set(cache_key, courses)
                freshness = "live"
            except ScraperError:
                courses, freshness = _cache.get_or_fallback(cache_key, c)

        # Attach freshness to each course
        for course in courses:
            course["data_freshness"] = freshness

        # Filter by course_type if requested
        if course_type:
            courses = [c for c in courses if course_type.lower() in c.get("type", "").lower()]

        results.extend(courses)

    # Sort by start_date
    results.sort(key=lambda x: x.get("start_date", ""))
    return results
```

### `vipassana-course-discovery-mcp/vipassana_mcp/tools/get_course_details.py`

```python
import httpx
from bs4 import BeautifulSoup


async def get_course_details(apply_url: str) -> dict:
    """
    Fetches additional details for a specific course from its VRI page.

    Args:
        apply_url: The URL from a list_courses result (schedule.vridhamma.org/...)

    Returns:
        Dict with: apply_url, special_instructions, eligibility, comments,
        registration_notes, error (if fetch failed)
    """
```

### `vipassana-course-discovery-mcp/vipassana_mcp/tools/get_center_info.py`

```python
from typing import Literal
from vipassana_mcp.data.centers import CENTERS


def get_center_info(center: Literal["virocana", "vutthi"]) -> dict:
    """
    Returns contact and location information for a UCENLIST meditation center.
    Data is static (sourced from official website, no scraping).

    Args:
        center: 'virocana' for Dhamma Virocana (Ha Noi),
                'vutthi' for Dhamma Vutthi (Ho Chi Minh City)

    Returns:
        Dict with: name, city, address, phone, email, website,
        schedule_url, maps_url
    """
    if center not in CENTERS:
        return {"error": f"Unknown center '{center}'. Use 'virocana' or 'vutthi'."}
    return CENTERS[center]
```

---

## Task 6: MCP Server Entry Point

### `vipassana-course-discovery-mcp/vipassana_mcp/server.py`

```python
from mcp.server.fastmcp import FastMCP
from vipassana_mcp.tools.list_courses import list_courses
from vipassana_mcp.tools.get_course_details import get_course_details
from vipassana_mcp.tools.get_center_info import get_center_info

mcp = FastMCP(
    name="vipassana-course-discovery",
    instructions=(
        "You are a helper for discovering Vipassana meditation courses at UCENLIST centers "
        "in Vietnam (Dhamma Virocana in Ha Noi, Dhamma Vutthi in Ho Chi Minh City). "
        "Use list_courses to find upcoming courses, get_course_details for more info, "
        "and get_center_info for contact details. Always provide the apply_url so users "
        "can register directly on the VRI website."
    ),
)

mcp.tool()(list_courses)
mcp.tool()(get_course_details)
mcp.tool()(get_center_info)


def main():
    mcp.run(transport="stdio")


if __name__ == "__main__":
    main()
```

---

## Task 7: README

### `vipassana-course-discovery-mcp/README.md`

Document:
- What this MCP server does
- Installation: `pip install -e .`
- Running: `vipassana-mcp` (stdio transport)
- The 3 tools with their arguments and return types
- Scraping behavior and fallback strategy
- How to update `schedule_fallback.json` when needed
- Example: how to integrate with an ADK agent (MCPToolset config snippet)

---

## Task 8: Smoke Test

Write a simple test script (not a formal test suite) that:

1. Instantiates the scraper directly and calls `fetch_courses("virocana", "vi")`
2. Prints the result (or "empty — possible JS-render issue")
3. Calls `get_center_info("virocana")` and prints output
4. Confirms the fallback JSON loads correctly

Save as `vipassana-course-discovery-mcp/smoke_test.py`.

---

## Verification

After completing all tasks, verify:

- [x] `pyproject.toml` is valid (`pip install -e .` succeeded)
- [x] `vipassana-mcp` CLI entry point is registered and callable
- [x] `smoke_test.py` runs without errors (all 5 groups pass)
- [x] `list_courses("virocana")` returns 15 live courses from VRI
- [x] `get_center_info("virocana")` returns correct address and phone
- [x] `get_center_info("vutthi")` returns correct address and phone
- [x] Server starts with `vipassana-mcp` command (stdio transport ready)
- [x] Fallback JSON loads when scraper raises ScraperError
