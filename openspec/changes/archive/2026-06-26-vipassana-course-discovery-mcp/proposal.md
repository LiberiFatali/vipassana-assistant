# Proposal: Vipassana Course Discovery MCP Server

## Summary

Build a **Python MCP (Model Context Protocol) server** that gives the Vipassana chatbot agent the ability to discover upcoming courses at UCENLIST's two meditation centers and guide users to VRI's registration page. The server exposes structured tools the agent can call at runtime — no manual knowledge-base updates needed when courses change.

## Problem

The existing `vipassana-ucenlist-knowledge` skill contains static information about UCENLIST. But course schedules change frequently — new courses open, close for registration, fill up — and a static skill cannot reflect this. Users asking "when is the next 10-day course in Hanoi?" currently get no live answer.

Additionally, the registration process is multi-step and happens on VRI's external platform (`schedule.vridhamma.org`). The chatbot needs to hand users off to the right page for the right course — not just a generic "go to the website" response.

## Why Now

- The knowledge skill is complete. The next logical layer is live course data.
- The exploration phase confirmed a viable path: scrape `schedule.vridhamma.org` (no public API exists; VRI's Drupal JSON:API is disabled).
- The scope is bounded and achievable without VRI cooperation or UCENLIST credentials.

## Goals

1. **Tool: `list_courses`** — Query upcoming courses at one or both centers, returning dates, course type, open/full status, and apply URL
2. **Tool: `get_course_details`** — Fetch supplementary info (special instructions, eligibility notes) for a specific course page
3. **Tool: `get_center_info`** — Return static center details (address, phone, email, map link) for Dhamma Virocana (HN) or Dhamma Vutthi (HCM)
4. **Bilingual** — Tool descriptions and error messages in both English and Vietnamese
5. **Resilient scraping** — Try lightweight HTTP fetch first; fall back to cached schedule on failure; optional Playwright upgrade path

## Non-Goals

- **No form automation** — The MCP server does NOT fill in or submit VRI's registration form. It only hands the user the correct URL.
- **No Odoo integration** — UCENLIST's Odoo instance is not involved.
- **No user account management** — No login, session, or authentication flows.
- **No Dhamma Pala / special-event handling** — Special one-off events (like Dhamma Pala 2026 with khaosat.me links) are out of scope for now; they can be referenced in the knowledge skill as static info.
- **No write operations** — This is a read-only server.

## Success Criteria

- `list_courses(center="virocana")` returns a structured list of 2026 courses with correct dates, type, and apply URLs
- `list_courses(center="vutthi")` does the same for Ho Chi Minh City
- `get_center_info(center="virocana")` returns address, phone, email, and Google Maps link
- The agent can answer "What courses are coming up in Hanoi?" with live data
- The agent provides the correct VRI apply link for the user to click
- Server runs as an MCP server (stdio transport), compatible with Google ADK agent tooling
- All errors surface gracefully without crashing the agent
