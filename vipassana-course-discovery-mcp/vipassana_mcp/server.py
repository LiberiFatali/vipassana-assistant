"""
Vipassana Course Discovery MCP Server

Exposes 3 tools to help a Vipassana chatbot agent discover upcoming courses
at UCENLIST meditation centers and guide users to VRI's registration page.

Tools:
  - list_courses       → Upcoming courses at Dhamma Virocana / Dhamma Vutthi
  - get_course_details → Eligibility and special instructions for a course
  - get_center_info    → Static contact info for a center (no scraping)

Transport: stdio (for use with ADK MCPToolset or any MCP-compatible agent)

Usage:
  vipassana-mcp                   # via installed entry point
  python -m vipassana_mcp.server  # direct invocation
"""

from __future__ import annotations

from mcp.server.fastmcp import FastMCP

from vipassana_mcp.tools.get_center_info import get_center_info
from vipassana_mcp.tools.get_course_details import get_course_details
from vipassana_mcp.tools.list_courses import list_courses

mcp = FastMCP(
    name="vipassana-course-discovery",
    instructions=(
        "You are a helper for discovering Vipassana meditation courses at UCENLIST centers "
        "in Vietnam: Dhamma Virocana (Ha Noi / Hà Nội) and Dhamma Vutthi (Ho Chi Minh City / "
        "TP. Hồ Chí Minh). "
        "\n\n"
        "Use list_courses to find upcoming courses, including dates, type, open/full status, "
        "and the direct registration link. "
        "Use get_course_details for additional eligibility or special instruction information. "
        "Use get_center_info for address, phone, email, and map links. "
        "\n\n"
        "Always provide the apply_url to users so they can register on the VRI website directly. "
        "The registration form is on VRI's platform — the chatbot does not fill it in. "
        "When data_freshness is 'fallback', note that dates are approximate and recommend "
        "the user checks the official schedule at schedule.vridhamma.org."
    ),
)

# Register all tools
mcp.tool()(list_courses)
mcp.tool()(get_course_details)
mcp.tool()(get_center_info)


def main() -> None:
    """Entry point for the vipassana-mcp CLI command."""
    mcp.run(transport="stdio")


if __name__ == "__main__":
    main()
