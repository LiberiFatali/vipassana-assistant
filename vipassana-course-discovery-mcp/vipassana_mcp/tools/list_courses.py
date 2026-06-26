"""
MCP Tool: list_courses

Returns upcoming Vipassana courses at UCENLIST centers in Vietnam.
Scrapes schedule.vridhamma.org with a 10-minute cache and falls back
to stale cache or static JSON on failure.
"""

from __future__ import annotations

from typing import Annotated, Literal, Optional

from vipassana_mcp.scraper.cache import ScheduleCache
from vipassana_mcp.scraper.vri_schedule import ScraperError, fetch_courses

_cache = ScheduleCache(ttl_minutes=10)


async def list_courses(
    center: Annotated[
        Literal["virocana", "vutthi", "all"],
        "Which center to query: 'virocana' (Ha Noi / Hà Nội), 'vutthi' (Ho Chi Minh City / TP. HCM), or 'all' for both.",
    ] = "all",
    language: Annotated[
        Literal["vi", "en"],
        "Language for schedule page: 'vi' for Vietnamese, 'en' for English.",
    ] = "vi",
    course_type: Annotated[
        Optional[str],
        "Optional filter by course type, e.g. '10-day', 'short', 'satipatthana'. Leave empty for all types.",
    ] = None,
) -> list[dict]:
    """
    Returns upcoming Vipassana meditation courses at UCENLIST centers.

    Each course includes:
    - center: Center name (e.g. 'Dhamma Virocana')
    - center_id: 'virocana' or 'vutthi'
    - location: City (e.g. 'Ha Noi')
    - type: Course type (e.g. '10-day', 'short', 'satipatthana')
    - start_date: Start date in YYYY-MM-DD format
    - end_date: End date in YYYY-MM-DD format
    - status: 'open', 'full', 'waitlist', or 'unknown'
    - apply_url: Direct link to register on the VRI website
    - notes: Any special instructions or eligibility notes
    - data_freshness: 'live', 'cached', or 'fallback'

    When data_freshness is 'fallback', dates are approximate — direct the
    user to check schedule.vridhamma.org for the current schedule.
    """
    centers_to_query: list[str] = (
        ["virocana", "vutthi"] if center == "all" else [center]
    )
    results: list[dict] = []

    for c in centers_to_query:
        cache_key = f"{c}_{language}"
        cached = _cache.get(cache_key)

        if cached is not None:
            courses = [dict(course, data_freshness="cached") for course in cached]
        else:
            try:
                courses = await fetch_courses(c, language)  # type: ignore[arg-type]
                _cache.set(cache_key, courses)
                courses = [dict(course, data_freshness="live") for course in courses]
            except ScraperError:
                fallback_courses, freshness = _cache.get_or_fallback(cache_key, c)
                courses = [dict(course, data_freshness=freshness) for course in fallback_courses]

        # Filter by course_type if requested
        if course_type:
            type_lower = course_type.lower()
            courses = [
                c_item
                for c_item in courses
                if type_lower in c_item.get("type", "").lower()
            ]

        results.extend(courses)

    # Sort by start_date ascending (empty strings sort last)
    results.sort(key=lambda x: x.get("start_date") or "9999")

    return results
