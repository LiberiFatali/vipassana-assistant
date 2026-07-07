"""
MCP Tool: get_course_details

Fetches supplementary information for a specific course from the VRI website.
Use this after list_courses to get eligibility requirements and special instructions.
"""

from __future__ import annotations

from typing import Annotated

from bs4 import BeautifulSoup

from vipassana_mcp.scraper.vri_schedule import ScraperError, fetch_html


async def get_course_details(
    apply_url: Annotated[
        str,
        "The apply_url from a list_courses result. Must be a schedule.vridhamma.org URL.",
    ],
) -> dict:
    """
    Fetches additional details for a specific Vipassana course from its VRI page.

    Use the apply_url returned by list_courses. This tool retrieves:
    - special_instructions: Any specific instructions for this course
    - eligibility: Who can attend (new students, old students only, etc.)
    - comments: Bilingual notes, language of instruction, etc.
    - registration_notes: Deadlines or other registration information

    Returns an error key if the page cannot be fetched.
    """
    if not apply_url or not apply_url.startswith("http"):
        return {
            "apply_url": apply_url,
            "error": "Invalid URL — must be a full URL starting with http(s).",
        }

    try:
        html = await fetch_html(apply_url)
    except ScraperError as e:
        return {
            "apply_url": apply_url,
            "error": str(e),
        }

    return _parse_detail_page(html, apply_url)


def _parse_detail_page(html: str, apply_url: str) -> dict:
    """Parse a VRI course detail/apply page for supplementary information."""
    soup = BeautifulSoup(html, "lxml")

    result: dict = {
        "apply_url": apply_url,
        "special_instructions": "",
        "eligibility": "",
        "comments": "",
        "registration_notes": "",
    }

    # Try to extract text from the main content area
    content = soup.find(id="content") or soup.find(class_="course-listing")
    if not content:
        content = soup.find("main") or soup.body

    if content:
        # Look for announcement / notes blocks
        for block in content.find_all(["p", "div", "li"]):
            text = block.get_text(separator=" ", strip=True)
            text_lower = text.lower()

            if not text or len(text) < 10:
                continue

            if any(kw in text_lower for kw in ["old student", "học viên cũ", "đã hoàn thành"]):
                result["eligibility"] = text
            elif any(kw in text_lower for kw in ["bilingual", "song ngữ", "language", "ngôn ngữ"]):
                result["comments"] = text
            elif any(kw in text_lower for kw in ["registration", "đăng ký", "deadline", "hạn chót"]):
                result["registration_notes"] = text
            elif any(kw in text_lower for kw in ["note", "instruction", "lưu ý", "hướng dẫn"]):
                result["special_instructions"] = text

    return result
