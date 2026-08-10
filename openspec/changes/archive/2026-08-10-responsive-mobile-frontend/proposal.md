## Why

The chat UI (`public/index.html`) is only partially responsive. On screens ≤ 720px the sidebar (center addresses, phones, links) is pushed *below* the chat instead of being hidden, the header wraps into multiple lines, agent-rendered tables overflow horizontally, and `height:100vh` breaks the composer position on iOS Safari. Mobile users get a cramped, scrolling layout instead of a chat-first experience.

## What Changes

- Hide `aside.sidebar` on screens ≤ 720px (removed from the mobile layout entirely; no toggle).
- Add the center info (names, addresses, phones, emails, official links) into the chat **welcome message** so mobile users still have it one message away.
- `init()` picks the welcome variant via `matchMedia`: desktop keeps the concise existing `welcome`, phones get `welcomeMobile` with embedded center info. `clearChat()` reuses the same pick.
- Compact the header on mobile: hide `.subtitle`, smaller title, icon-only Clear button (translated `aria-label`), tighter padding.
- Render agent tables as stacked list-style cards on narrow screens (via `data-label` cell attributes + CSS), so course schedules no longer overflow the viewport.
- Use `100dvh` (with `100vh` fallback) and `env(safe-area-inset-bottom)` padding so the composer stays above the iOS URL bar / home indicator; bump `#send` tap target.

## Capabilities

### New Capabilities
<!-- none -->

### Modified Capabilities
- `streamlit-ui`: The static chat frontend gains responsive mobile behavior — the center-info sidebar is hidden on small screens with equivalent info folded into the welcome message, the header compacts, and agent tables reflow into stacked lists.

## Impact

- **Files**: `public/index.html` (CSS + header markup + i18n + `init()`/`clearChat()` logic), `public/markdown.js` (tables emit `data-label`), `tests/markdown.test.mjs` (two table assertions updated for `data-label`).
- **Behavior**: Deterministic schedule answers already render as bullet lists; the table reflow is defense for LLM-produced markdown tables.
- **No API / server changes**; the streaming protocol and all server-side modules are untouched.
