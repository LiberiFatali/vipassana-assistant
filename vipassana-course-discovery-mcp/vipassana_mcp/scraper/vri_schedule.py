"""
Scraper for schedule.vridhamma.org — the VRI global course scheduling platform.

Strategy:
  1. HTTP GET with a realistic browser User-Agent (avoids bot detection)
  2. Parse the Drupal Views table with BeautifulSoup
  3. If tbody has no rows, the content is JS-rendered — raise ScraperError
     so the caller falls back to cache or static fallback

The VRI site uses Drupal 9 with Drupal Views. The JSON:API module is disabled
so scraping HTML is the only programmatic option.
"""

from __future__ import annotations

import re
from datetime import datetime
from typing import Literal

import httpx
from bs4 import BeautifulSoup, Tag
from dateutil import parser as dateutil_parser

# ─── Constants ────────────────────────────────────────────────────────────────

VRI_SCHEDULE_URLS: dict[str, dict[str, str]] = {
    "virocana": {
        "vi": "https://schedule.vridhamma.org/vi/courses/virocana",
        "en": "https://schedule.vridhamma.org/courses/virocana",
    },
    "vutthi": {
        "vi": "https://schedule.vridhamma.org/vi/courses/vutthi",
        "en": "https://schedule.vridhamma.org/courses/vutthi",
    },
}

CENTER_NAMES: dict[str, str] = {
    "virocana": "Dhamma Virocana",
    "vutthi": "Dhamma Vutthi",
}

CENTER_LOCATIONS: dict[str, str] = {
    "virocana": "Ha Noi",
    "vutthi": "Ho Chi Minh City",
}

HEADERS: dict[str, str] = {
    "User-Agent": (
        "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 "
        "(KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
    ),
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    "Accept-Language": "vi-VN,vi;q=0.9,en-US;q=0.8,en;q=0.7",
    "Accept-Encoding": "gzip, deflate, br",
    "Connection": "keep-alive",
}

REQUEST_TIMEOUT = 15.0  # seconds

# Strings that indicate a course is full (Vietnamese and English)
FULL_INDICATORS = {"full", "hết chỗ", "đã đầy", "closed"}
WAITLIST_INDICATORS = {"waitlist", "danh sách chờ", "chờ"}


# ─── Exceptions ───────────────────────────────────────────────────────────────


class ScraperError(Exception):
    """Raised when the VRI schedule page cannot be fetched or parsed."""


class EmptyScheduleError(ScraperError):
    """Raised when the schedule page loads but contains no course rows (JS-rendered)."""


# ─── Public API ───────────────────────────────────────────────────────────────


async def fetch_courses(
    center_id: Literal["virocana", "vutthi"],
    language: Literal["vi", "en"] = "vi",
) -> list[dict]:
    """
    Fetch and parse the course listing from schedule.vridhamma.org.

    Args:
        center_id: 'virocana' (Ha Noi) or 'vutthi' (Ho Chi Minh City)
        language: 'vi' for Vietnamese URL, 'en' for English URL

    Returns:
        List of course dicts. Empty list if no courses are listed for the year.

    Raises:
        ScraperError: If the site is unreachable or returns an error status.
        EmptyScheduleError: If the page loads but rows are JS-rendered (empty tbody).
    """
    url = VRI_SCHEDULE_URLS[center_id][language]

    try:
        async with httpx.AsyncClient(
            headers=HEADERS,
            timeout=REQUEST_TIMEOUT,
            follow_redirects=True,
        ) as client:
            response = await client.get(url)
            response.raise_for_status()
    except httpx.TimeoutException as e:
        raise ScraperError(f"Request timed out fetching {url}: {e}") from e
    except httpx.HTTPStatusError as e:
        raise ScraperError(
            f"HTTP {e.response.status_code} fetching {url}"
        ) from e
    except httpx.RequestError as e:
        raise ScraperError(f"Network error fetching {url}: {e}") from e

    return parse_course_table(response.text, center_id)


# ─── HTML Parsing ─────────────────────────────────────────────────────────────


def parse_course_table(html: str, center_id: str) -> list[dict]:
    """
    Parse the Drupal Views course table from the VRI schedule page.

    The target table has class 'tablesaw tablesaw-stack cols-5'.
    Each <tr> in the tbody represents one course.

    Returns:
        List of course dicts.

    Raises:
        EmptyScheduleError: If the table exists but tbody has no data rows,
            indicating JS-rendered content that wasn't executed.
    """
    soup = BeautifulSoup(html, "lxml")

    # Find the course listing table
    table = soup.find("table", class_=lambda c: c and "tablesaw" in c and "cols-5" in c)

    if table is None:
        # No table found at all — check if there's a "No course" message
        no_course = soup.find(class_="course-list-empty")
        if no_course:
            return []  # Legitimate empty schedule
        raise EmptyScheduleError(
            "Could not find the course table — page may require JavaScript to render."
        )

    tbody = table.find("tbody")
    if tbody is None:
        raise EmptyScheduleError("Course table has no tbody — JS-rendered content not available.")

    rows = [r for r in tbody.find_all("tr") if isinstance(r, Tag)]
    if not rows:
        raise EmptyScheduleError("Course table tbody is empty — JS-rendered content not available.")

    courses = []
    for row in rows:
        course = _parse_row(row, center_id)
        if course:
            courses.append(course)

    return courses


def _parse_row(row: Tag, center_id: str) -> dict | None:
    """Parse a single table row into a course dict."""
    cells = row.find_all("td")
    if not cells:
        return None

    # Column order (from the table header):
    # [0] Apply link  [1] Dates  [2] Type  [3] Old Students?  [4] Notes/Comments

    apply_url, status = _parse_apply_cell(cells[0]) if len(cells) > 0 else (None, "unknown")
    start_date, end_date = _parse_date_cell(cells[1]) if len(cells) > 1 else ("", "")
    course_type = _parse_type_cell(cells[2]) if len(cells) > 2 else "unknown"
    notes = _parse_notes_cell(cells[-1]) if len(cells) > 3 else ""

    return {
        "center": CENTER_NAMES.get(center_id, center_id),
        "center_id": center_id,
        "location": CENTER_LOCATIONS.get(center_id, ""),
        "type": course_type,
        "start_date": start_date,
        "end_date": end_date,
        "status": status,
        "apply_url": apply_url or f"https://schedule.vridhamma.org/vi/courses/{center_id}",
        "notes": notes,
        "data_freshness": "live",
    }


def _parse_apply_cell(cell: Tag) -> tuple[str | None, str]:
    """
    Parse the Apply column.
    Returns (apply_url, status).
    Status is 'open', 'full', 'waitlist', or 'unknown'.
    """
    link = cell.find("a")
    text = cell.get_text(strip=True).lower()

    if link and link.get("href"):
        href = str(link["href"])
        if not href.startswith("http"):
            href = "https://schedule.vridhamma.org" + href

        link_text = link.get_text(strip=True).lower()
        status = parse_status(link_text)
        return href, status

    # No link — check text for clues
    if any(ind in text for ind in FULL_INDICATORS):
        return None, "full"
    if any(ind in text for ind in WAITLIST_INDICATORS):
        return None, "waitlist"

    return None, "unknown"


def _parse_date_cell(cell: Tag) -> tuple[str, str]:
    """
    Parse the Dates column.
    Returns (start_date_iso, end_date_iso) as 'YYYY-MM-DD' strings.
    Falls back to raw text on parse failure.
    """
    raw = cell.get_text(separator=" ", strip=True)
    return parse_dates(raw)


def _parse_type_cell(cell: Tag) -> str:
    """Parse the course type column, normalising common values."""
    raw = cell.get_text(strip=True)
    lower = raw.lower()

    if "10" in lower and ("day" in lower or "ngày" in lower):
        return "10-day"
    if "short" in lower or "ngắn" in lower:
        return "short"
    if "satipatthana" in lower:
        return "satipatthana"
    if "children" in lower or "thiếu nhi" in lower:
        return "children"
    if "teen" in lower or "thanh thiếu niên" in lower:
        return "teen"

    return raw if raw else "unknown"


def _parse_notes_cell(cell: Tag) -> str:
    """Parse the final Notes/Comments cell."""
    return cell.get_text(separator=" ", strip=True)


# ─── Helpers ──────────────────────────────────────────────────────────────────


def parse_status(text: str) -> str:
    """
    Infer registration status from link or cell text.

    Returns: 'open' | 'full' | 'waitlist' | 'unknown'
    """
    lower = text.lower()
    if any(ind in lower for ind in FULL_INDICATORS):
        return "full"
    if any(ind in lower for ind in WAITLIST_INDICATORS):
        return "waitlist"
    if lower in {"apply", "đăng ký", "apply now", "register"}:
        return "open"
    if lower:
        return "open"  # has a link → assume open unless text says otherwise
    return "unknown"


def parse_dates(text: str) -> tuple[str, str]:
    """
    Parse a date range string from the VRI schedule table into ISO date strings.

    Handles formats like:
      - "01 Aug - 12 Aug 2026"
      - "01/08 - 12/08/2026"
      - "Aug 1 – Aug 12, 2026"
      - "2026-08-01 to 2026-08-12"

    Returns:
        (start_date_iso, end_date_iso) as 'YYYY-MM-DD' strings,
        or (raw_text, "") on failure.
    """
    # Normalise separators
    text = text.strip()
    text = re.sub(r"[–—]", "-", text)  # en/em dash → hyphen

    # Detect ISO format (YYYY-MM-DD) — do NOT use dayfirst for these
    _ISO_RE = re.compile(r"^\d{4}-\d{2}-\d{2}")

    def _parse_single(raw: str) -> datetime:
        """Parse a single date string, choosing dayfirst appropriately."""
        use_dayfirst = not bool(_ISO_RE.match(raw.strip()))
        return dateutil_parser.parse(raw, dayfirst=use_dayfirst)

    # Try splitting on common range separators
    for sep in [" to ", " - ", "→", "->"]:
        parts = text.split(sep, maxsplit=1)
        if len(parts) == 2:
            start_raw, end_raw = parts[0].strip(), parts[1].strip()
            try:
                # If year missing from start, borrow from end
                if not re.search(r"\d{4}", start_raw) and re.search(r"\d{4}", end_raw):
                    year_match = re.search(r"\d{4}", end_raw)
                    if year_match:
                        start_raw = f"{start_raw} {year_match.group()}"

                start = _parse_single(start_raw)
                end = _parse_single(end_raw)
                return start.strftime("%Y-%m-%d"), end.strftime("%Y-%m-%d")
            except (ValueError, OverflowError):
                continue

    # Bare hyphen split (last resort for "01 Aug-12 Aug 2026" style)
    parts = text.split("-", maxsplit=1)
    if len(parts) == 2:
        start_raw, end_raw = parts[0].strip(), parts[1].strip()
        try:
            if not re.search(r"\d{4}", start_raw) and re.search(r"\d{4}", end_raw):
                year_match = re.search(r"\d{4}", end_raw)
                if year_match:
                    start_raw = f"{start_raw} {year_match.group()}"
            start = _parse_single(start_raw)
            end = _parse_single(end_raw)
            return start.strftime("%Y-%m-%d"), end.strftime("%Y-%m-%d")
        except (ValueError, OverflowError):
            pass

    # Single date fallback
    try:
        dt = _parse_single(text)
        return dt.strftime("%Y-%m-%d"), ""
    except (ValueError, OverflowError):
        pass

    return text, ""  # raw text as last resort
