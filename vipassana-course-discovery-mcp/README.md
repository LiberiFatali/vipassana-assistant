# vipassana-course-discovery-mcp

An MCP (Model Context Protocol) server that gives a Vipassana chatbot agent **live course discovery** capabilities for UCENLIST meditation centers in Vietnam.

The server scrapes `schedule.vridhamma.org` to return upcoming course dates and registration links, then hands users off to VRI's own registration flow. No form automation — the agent guides, the user clicks.

---

## Centers Supported

| Center | Location | Schedule |
|---|---|---|
| **Dhamma Virocana** | Hà Nội | [schedule.vridhamma.org/vi/courses/virocana](https://schedule.vridhamma.org/vi/courses/virocana) |
| **Dhamma Vutthi** | TP. Hồ Chí Minh | [schedule.vridhamma.org/vi/courses/vutthi](https://schedule.vridhamma.org/vi/courses/vutthi) |

---

## Tools

### `list_courses`

Returns upcoming Vipassana courses at one or both centers.

| Argument | Type | Default | Description |
|---|---|---|---|
| `center` | `"virocana"` \| `"vutthi"` \| `"all"` | `"all"` | Which center(s) to query |
| `language` | `"vi"` \| `"en"` | `"vi"` | Language of the schedule page |
| `course_type` | `str` (optional) | `None` | Filter by type: `"10-day"`, `"short"`, `"satipatthana"` |

**Returns:** List of course dicts with `center`, `type`, `start_date`, `end_date`, `status`, `apply_url`, `notes`, `data_freshness`.

```json
[
  {
    "center": "Dhamma Virocana",
    "center_id": "virocana",
    "location": "Ha Noi",
    "type": "10-day",
    "start_date": "2026-08-01",
    "end_date": "2026-08-12",
    "status": "open",
    "apply_url": "https://schedule.vridhamma.org/vi/apply/...",
    "notes": "",
    "data_freshness": "live"
  }
]
```

**`data_freshness` values:**
- `"live"` — freshly scraped from VRI (< 10 min old)
- `"cached"` — from in-memory cache (< 24h old)
- `"fallback"` — from `schedule_fallback.json` (approximate dates; tell user to verify)

---

### `get_course_details`

Fetches additional details (eligibility, special instructions) from a specific course page.

| Argument | Type | Description |
|---|---|---|
| `apply_url` | `str` | The `apply_url` from a `list_courses` result |

**Returns:** Dict with `special_instructions`, `eligibility`, `comments`, `registration_notes`.

---

### `get_center_info`

Returns static contact and location information for a center. Always available, no network needed.

| Argument | Type | Description |
|---|---|---|
| `center` | `"virocana"` \| `"vutthi"` | Which center |

**Returns:** Dict with `name`, `address`, `phone`, `email`, `website`, `schedule_url_vi`, `schedule_url_en`, `maps_url`.

---

## Installation

```bash
cd vipassana-course-discovery-mcp
pip install -e .
```

Requires Python 3.11+.

---

## Running the Server

```bash
vipassana-mcp
```

The server runs on **stdio transport** — it reads MCP JSON-RPC messages from stdin and writes responses to stdout. This is the standard transport for use with ADK's `MCPToolset`.

---

## Integrating with a Google ADK Agent

```python
from google.adk.tools.mcp_tool.mcp_toolset import MCPToolset, StdioServerParameters

tools = MCPToolset(
    connection_params=StdioServerParameters(
        command="vipassana-mcp",
    )
)
```

---

## Scraping Behavior & Fallback Strategy

`schedule.vridhamma.org` runs on Drupal 9 with no public API. The server:

1. **Sends a standard browser HTTP request** with a realistic User-Agent
2. **Parses the HTML table** using BeautifulSoup
3. **Caches results for 10 minutes** in-memory (reduces load on VRI servers)
4. **Falls back to stale cache** (up to 24h) if the live fetch fails
5. **Falls back to `schedule_fallback.json`** if no cached data exists

> ⚠️ If the course table is rendered via JavaScript, the scraper will detect empty rows and use the fallback. If this happens consistently, consider enabling Playwright (see below).

### Enabling Playwright (Optional)

For full JS rendering, install Playwright:

```bash
pip install playwright
playwright install chromium
```

Then set:
```bash
VIPASSANA_MCP_USE_PLAYWRIGHT=1 vipassana-mcp
```

*(Playwright support not bundled by default — add to pyproject.toml if needed.)*

---

## Updating the Fallback Schedule

When the live scraper fails or when courses are known in advance, update [`vipassana_mcp/data/schedule_fallback.json`](vipassana_mcp/data/schedule_fallback.json):

```json
{
  "generated_at": "YYYY-MM-DD",
  "note": "...",
  "courses": [
    {
      "center": "Dhamma Virocana",
      "center_id": "virocana",
      "location": "Ha Noi",
      "type": "10-day",
      "start_date": "2026-08-01",
      "end_date": "2026-08-12",
      "status": "open",
      "apply_url": "https://schedule.vridhamma.org/vi/courses/virocana",
      "notes": "",
      "data_freshness": "fallback"
    }
  ]
}
```

---

## Running the Smoke Test

```bash
cd vipassana-course-discovery-mcp
pip install -e .
python smoke_test.py
```
