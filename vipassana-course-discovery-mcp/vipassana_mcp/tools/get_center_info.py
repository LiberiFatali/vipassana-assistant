"""
MCP Tool: get_center_info

Returns static contact and location information for UCENLIST meditation centers.
No scraping — data is hardcoded from the official website (June 2026).
"""

from __future__ import annotations

from typing import Annotated, Literal

from vipassana_mcp.data.centers import CENTERS


def get_center_info(
    center: Annotated[
        Literal["virocana", "vutthi"],
        (
            "Which center to get info for: "
            "'virocana' = Dhamma Virocana in Ha Noi (Hà Nội), "
            "'vutthi' = Dhamma Vutthi in Ho Chi Minh City (TP. Hồ Chí Minh)."
        ),
    ],
) -> dict:
    """
    Returns contact and location information for a UCENLIST meditation center.

    Data is static (sourced from official website) and always available
    without network access. Includes:
    - name: Center name
    - city / city_vi: City in English and Vietnamese
    - address: Full address in Vietnamese
    - phone: Phone number
    - email: Contact email
    - website: Center website URL
    - schedule_url_vi / schedule_url_en: Direct links to course schedule
    - maps_url: Google Maps link (if available)
    """
    if center not in CENTERS:
        return {
            "error": (
                f"Unknown center '{center}'. "
                "Valid options: 'virocana' (Ha Noi) or 'vutthi' (Ho Chi Minh City)."
            )
        }
    return dict(CENTERS[center])
