# Design: Vipassana Course Discovery MCP Server

## Repository Layout

```
vipassana-course-discovery-mcp/        ← new top-level package in the_capstone
├── pyproject.toml                     ← dependencies & entry point
├── README.md
└── vipassana_mcp/
    ├── __init__.py
    ├── server.py                      ← MCP server entry point (stdio transport)
    ├── tools/
    │   ├── __init__.py
    │   ├── list_courses.py            ← Tool: list_courses
    │   ├── get_course_details.py      ← Tool: get_course_details
    │   └── get_center_info.py         ← Tool: get_center_info (static data)
    ├── scraper/
    │   ├── __init__.py
    │   ├── vri_schedule.py            ← HTTP fetch + BeautifulSoup parser
    │   └── cache.py                   ← In-memory TTL cache (10-minute default)
    └── data/
        ├── centers.py                 ← Static center data (addresses, phones, etc.)
        └── schedule_fallback.json     ← Manually seeded fallback schedule
```

## MCP Server Architecture

```
ADK Agent
    │
    │  calls tool via MCP (stdio)
    ▼
┌─────────────────────────────────────────────┐
│  server.py (FastMCP)                        │
│  ┌───────────────┐  ┌──────────────────┐   │
│  │ list_courses  │  │get_course_details│   │
│  └───────┬───────┘  └────────┬─────────┘   │
│          │                   │             │
│  ┌───────▼───────────────────▼───────────┐ │
│  │          scraper/vri_schedule.py      │ │
│  │  1. HTTP GET schedule.vridhamma.org   │ │
│  │  2. Parse HTML table (BeautifulSoup)  │ │
│  │  3. Return structured dicts           │ │
│  └───────────────┬───────────────────────┘ │
│                  │ on failure              │
│  ┌───────────────▼───────────────────────┐ │
│  │          scraper/cache.py             │ │
│  │  - 10-min in-memory TTL cache         │ │
│  │  - Falls back to schedule_fallback    │ │
│  └───────────────────────────────────────┘ │
│                                            │
│  ┌─────────────────────────────────────┐   │
│  │  get_center_info  (no scraping)     │   │
│  │  Reads data/centers.py directly     │   │
│  └─────────────────────────────────────┘   │
└─────────────────────────────────────────────┘
```

## Tool Specifications

### Tool 1: `list_courses`

```python
def list_courses(
    center: Literal["virocana", "vutthi", "all"] = "all",
    language: Literal["en", "vi"] = "vi",
    course_type: Optional[str] = None,   # "10-day", "short", "satipatthana"
) -> list[dict]:
    """
    Returns upcoming Vipassana courses at the specified UCENLIST center(s).
    Scrapes schedule.vridhamma.org with a 10-minute cache.
    Falls back to cached schedule if the site is unreachable.
    """
```

**Returns:**
```json
[
  {
    "center": "Dhamma Virocana",
    "center_id": "virocana",
    "location": "Ha Noi",
    "type": "10-day",
    "start_date": "2026-08-01",
    "end_date": "2026-08-12",
    "status": "open",        // "open" | "full" | "waitlist" | "unknown"
    "apply_url": "https://schedule.vridhamma.org/en/apply/...",
    "notes": "",
    "data_freshness": "live" // "live" | "cached" | "fallback"
  }
]
```

### Tool 2: `get_course_details`

```python
def get_course_details(
    apply_url: str,
    language: Literal["en", "vi"] = "vi",
) -> dict:
    """
    Fetches additional details for a specific course from its apply/detail page.
    Returns eligibility requirements, special instructions, and comments.
    """
```

**Returns:**
```json
{
  "apply_url": "https://...",
  "special_instructions": "Old students only. Must have sat 3+ 10-day courses.",
  "eligibility": "New students welcome",
  "comments": "Bilingual course (Vietnamese and English)",
  "registration_notes": "Registration closes 2 weeks before start date"
}
```

### Tool 3: `get_center_info`

```python
def get_center_info(
    center: Literal["virocana", "vutthi"],
) -> dict:
    """
    Returns static contact and location information for a UCENLIST meditation center.
    No scraping — data is hardcoded from the official website.
    """
```

**Returns:**
```json
{
  "name": "Dhamma Virocana",
  "subtitle": "The Sun of Dhamma",
  "city": "Ha Noi",
  "address": "Số 15-17 ngõ Sala, đường Đồng Đò, thôn Minh Tân, xã Kim Anh, Hà Nội",
  "phone": "+84 966 894 936",
  "email": "contact.virocana@vridhamma.org",
  "website": "https://virocana.vridhamma.org/vi",
  "schedule_url": "https://schedule.vridhamma.org/vi/courses/virocana",
  "maps_url": "https://maps.app.goo.gl/PsH8cZkwznFiwMU99"
}
```

## Scraping Strategy

### Primary: Lightweight HTTP Fetch

Target URLs:
- `https://schedule.vridhamma.org/vi/courses/virocana` (Vietnamese, for VN users)
- `https://schedule.vridhamma.org/en/courses/virocana` (English fallback)

The course table is inside:
```html
<table class="tablesaw tablesaw-stack cols-5" data-tablesaw-mode="stack">
  <caption>Course Year 2026</caption>
  <thead>
    <tr>
      <th>Apply</th>
      <th>Ngày / Date</th>
      ...
    </tr>
  </thead>
  <tbody>
    <tr>  ← Each row is one course
      <td><a href="/vi/apply/...">Đăng ký</a></td>
      <td>2026-08-01 → 2026-08-12</td>
      ...
    </tr>
  </tbody>
</table>
```

> ⚠️ **Risk:** Drupal Views may render table rows client-side via JavaScript. If rows are empty on static fetch, the scraper will detect this (empty tbody) and trigger fallback.

**User-Agent:** Send `Mozilla/5.0` (not bot UA) to maximize chance of full HTML render.

### Fallback 1: In-Memory Cache

- On successful scrape → cache result for 10 minutes
- On failed scrape → return last cached result (if fresh enough, within 24h)
- Include `data_freshness: "cached"` in response

### Fallback 2: Static JSON

- `data/schedule_fallback.json` — manually seeded with known upcoming courses
- Updated whenever someone runs the server and sees a fetch failure
- Include `data_freshness: "fallback"` with `fallback_as_of` date

### Future: Playwright Upgrade Path

If HTTP fetch consistently fails to get rows, add optional Playwright support:
- Guarded by env var `VIPASSANA_MCP_USE_PLAYWRIGHT=1`
- Not bundled by default (heavy dependency)

## Dependencies

```toml
[project]
name = "vipassana-mcp"
version = "0.1.0"
requires-python = ">=3.11"

dependencies = [
    "mcp[cli]>=1.0.0",          # MCP Python SDK (FastMCP)
    "httpx>=0.27.0",             # Async HTTP client
    "beautifulsoup4>=4.12.0",    # HTML parser
    "lxml>=5.0.0",               # Fast BS4 parser backend
    "python-dateutil>=2.9.0",    # Date parsing
]

[project.scripts]
vipassana-mcp = "vipassana_mcp.server:main"
```

## MCP Server Entry Point

Uses **FastMCP** (the high-level MCP Python SDK):

```python
# server.py
from mcp.server.fastmcp import FastMCP
from vipassana_mcp.tools import list_courses, get_course_details, get_center_info

mcp = FastMCP("vipassana-course-discovery")

mcp.tool()(list_courses)
mcp.tool()(get_course_details)
mcp.tool()(get_center_info)

def main():
    mcp.run(transport="stdio")
```

## Error Handling

| Scenario | Behavior |
|---|---|
| VRI site unreachable | Return cached or fallback data with `data_freshness` flag |
| No courses listed ("No course") | Return empty list `[]` with message "No courses currently listed" |
| Apply URL is malformed | Return course entry without apply_url, note to contact center |
| Unknown course type in HTML | Include raw type string, don't crash |
| Both center IDs for `"all"` | Merge and sort results by start_date |

## Integration with ADK Agent

The MCP server runs as a subprocess with `stdio` transport, registered in the agent's MCP config:

```python
# In the future chatbot agent's configuration
MCPToolset(
    connection_params=StdioServerParameters(
        command="vipassana-mcp",
    )
)
```

The agent will call `list_courses`, interpret results in context (using the knowledge skill for explanations), and provide the `apply_url` as a clickable link to the user.
