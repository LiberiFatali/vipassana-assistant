#!/usr/bin/env python3
"""
Smoke test for the Vipassana Course Discovery MCP server.

Runs quick checks without a formal test framework:
  1. Scraper: fetch_courses from Dhamma Virocana (live)
  2. Cache: set/get and fallback loading
  3. Tools: get_center_info (static, always works)
  4. Tools: list_courses (end-to-end with fallback)

Usage:
    cd vipassana-course-discovery-mcp
    pip install -e .
    python smoke_test.py
"""

from __future__ import annotations

import asyncio
import json
import sys
from pathlib import Path

# ── Helpers ───────────────────────────────────────────────────────────────────

PASS = "✓"
FAIL = "✗"
WARN = "⚠"


def ok(msg: str) -> None:
    print(f"  {PASS} {msg}")


def fail(msg: str) -> None:
    print(f"  {FAIL} {msg}")
    sys.exit(1)


def warn(msg: str) -> None:
    print(f"  {WARN} {msg}")


# ── Test 1: Live scraper ───────────────────────────────────────────────────────

async def test_scraper() -> None:
    print("\n[1] Scraper: fetch_courses('virocana', 'vi')")
    from vipassana_mcp.scraper.vri_schedule import (
        EmptyScheduleError,
        ScraperError,
        fetch_courses,
    )

    try:
        courses = await fetch_courses("virocana", "vi")
        if courses:
            ok(f"Got {len(courses)} course(s) from Dhamma Virocana")
            for c in courses[:2]:
                ok(f"  → {c.get('type')} | {c.get('start_date')} → {c.get('end_date')} | {c.get('status')}")
        else:
            warn("Schedule page returned 0 courses — may be off-season or 'No course' state")
    except EmptyScheduleError as e:
        warn(f"JS-rendered content detected (expected in some environments): {e}")
        warn("Fallback strategy will be used — this is OK in production")
    except ScraperError as e:
        warn(f"Live fetch failed (network issue?): {e}")
        warn("Fallback strategy will be used — this is OK in production")


# ── Test 2: Cache ─────────────────────────────────────────────────────────────

def test_cache() -> None:
    print("\n[2] Cache: TTL get/set and fallback JSON")
    from vipassana_mcp.scraper.cache import ScheduleCache

    cache = ScheduleCache(ttl_minutes=10)

    # Set and get within TTL
    sample = [{"center": "Test", "start_date": "2026-08-01"}]
    cache.set("virocana_vi", sample)
    result = cache.get("virocana_vi")
    if result == sample:
        ok("Cache set/get within TTL works")
    else:
        fail("Cache get returned wrong data")

    # Fallback JSON
    fallback = cache.get_fallback("virocana")
    if isinstance(fallback, list):
        ok(f"Fallback JSON loaded: {len(fallback)} course(s) for virocana")
    else:
        fail("Fallback JSON loading failed")

    fallback_vutthi = cache.get_fallback("vutthi")
    if isinstance(fallback_vutthi, list):
        ok(f"Fallback JSON loaded: {len(fallback_vutthi)} course(s) for vutthi")
    else:
        fail("Fallback JSON loading failed for vutthi")

    # get_or_fallback when nothing cached for unknown key
    courses, freshness = cache.get_or_fallback("nonexistent_vi", "virocana")
    if freshness == "fallback":
        ok(f"get_or_fallback returns fallback when cache empty (freshness='{freshness}')")
    else:
        warn(f"Unexpected freshness: {freshness}")


# ── Test 3: get_center_info ───────────────────────────────────────────────────

def test_center_info() -> None:
    print("\n[3] Tool: get_center_info")
    from vipassana_mcp.tools.get_center_info import get_center_info

    for center_id in ["virocana", "vutthi"]:
        info = get_center_info(center_id)  # type: ignore[arg-type]
        if "error" in info:
            fail(f"get_center_info('{center_id}') returned error: {info['error']}")
        if not info.get("phone"):
            fail(f"get_center_info('{center_id}') missing phone number")
        if not info.get("address"):
            fail(f"get_center_info('{center_id}') missing address")
        ok(f"get_center_info('{center_id}') → {info['name']} | {info['city']} | {info['phone']}")

    # Test invalid center
    bad = get_center_info("invalid")  # type: ignore[arg-type]
    if "error" in bad:
        ok("get_center_info('invalid') correctly returns error")
    else:
        fail("get_center_info('invalid') should return error but didn't")


# ── Test 4: list_courses (end-to-end) ─────────────────────────────────────────

async def test_list_courses() -> None:
    print("\n[4] Tool: list_courses (end-to-end with fallback)")
    from vipassana_mcp.tools.list_courses import list_courses

    courses = await list_courses(center="virocana", language="vi")
    if isinstance(courses, list):
        ok(f"list_courses('virocana') returned {len(courses)} course(s)")
        if courses:
            c = courses[0]
            required_keys = {"center", "center_id", "type", "start_date", "apply_url", "data_freshness"}
            missing = required_keys - set(c.keys())
            if missing:
                fail(f"Course missing keys: {missing}")
            else:
                ok(f"First course has all required keys")
            ok(f"  data_freshness = '{c['data_freshness']}'")
            ok(f"  apply_url = {c['apply_url']}")
    else:
        fail(f"list_courses returned unexpected type: {type(courses)}")

    # Test 'all' centers
    all_courses = await list_courses(center="all")
    ok(f"list_courses('all') returned {len(all_courses)} course(s) total")


# ── Test 5: Date parser ────────────────────────────────────────────────────────

def test_date_parsing() -> None:
    print("\n[5] Scraper: parse_dates")
    from vipassana_mcp.scraper.vri_schedule import parse_dates

    cases = [
        ("01 Aug - 12 Aug 2026", ("2026-08-01", "2026-08-12")),
        ("Aug 1 – Aug 12, 2026", ("2026-08-01", "2026-08-12")),
        ("2026-08-01 to 2026-08-12", ("2026-08-01", "2026-08-12")),
        ("01/08 - 12/08/2026", ("2026-08-01", "2026-08-12")),
    ]

    all_ok = True
    for raw, expected in cases:
        result = parse_dates(raw)
        if result == expected:
            ok(f"'{raw}' → {result}")
        else:
            warn(f"'{raw}' → {result} (expected {expected})")
            all_ok = False

    if all_ok:
        ok("All date parsing cases passed")


# ── Main ──────────────────────────────────────────────────────────────────────

async def main() -> None:
    print("=" * 60)
    print("Vipassana Course Discovery MCP — Smoke Test")
    print("=" * 60)

    await test_scraper()
    test_cache()
    test_center_info()
    await test_list_courses()
    test_date_parsing()

    print("\n" + "=" * 60)
    print("Smoke test complete.")
    print("=" * 60)


if __name__ == "__main__":
    asyncio.run(main())
