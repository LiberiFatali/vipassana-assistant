## Context

The frontend is a single self-contained static page, `public/index.html`, with inline CSS and a module script (no build step). Its `≤720px` media query currently stacks `aside.sidebar` *below* the chat instead of hiding it. Agent replies render via `public/markdown.js`, which emits real `<table>/<thead>/<tbody>/<th>/<td>` markup for markdown tables. `body` uses `height:100vh`. A tiny i18n map (`I18N`) drives all user-facing strings through `[data-i18n]`/`[data-i18n-ph]` in `applyLang()`.

## Goals / Non-Goals

**Goals:**
- Chat-first mobile layout: sidebar hidden, full-width chat + composer.
- Center info reachable on mobile via an expanded welcome message.
- Compact single-row header on phones.
- Tables reflow to labeled stacked cards on narrow screens.
- iOS-safe viewport height and composer safe-area padding.

**Non-Goals:**
- No desktop layout changes; sidebar stays exactly as-is on wide screens.
- No server/API changes; streaming protocol untouched.
- No new frontend framework, build step, or CSS extraction.
- No hamburger/drawer toggle (deliberately dropped in favor of hiding + welcome message).

## Decisions

**1. Sidebar removed on mobile via CSS only.**
`@media (max-width:720px) { aside.sidebar { display:none } }` replaces the current `order:2` push-below rule. The `aside` stays in the DOM (needed for desktop) and is never rendered on phones. No toggle logic needed.

**2. Welcome variant chosen by `matchMedia` at render time.**
Add a `welcomeMobile` key (vi + en) to `I18N` containing the existing welcome text plus a markdown block mirroring the sidebar (center names, addresses, phones, emails, official links). A helper, e.g. `welcomeText()` = `matchMedia("(max-width:720px)").matches ? I18N[lang].welcomeMobile : I18N[lang].welcome`, is used in both `init()` and `clearChat()`. Links inside `welcomeMobile` pass through the trusted-domain gate in `markdown.js` (all are `*.vridhamma.org`) so they render as anchors.
- *Alternative considered:* rendering the sidebar content always and hiding via CSS — rejected because the welcome message is the natural, context-appropriate home for it and keeps desktop unchanged.

**3. Header compaction via CSS + tiny i18n-aria hook.**
`.subtitle` hidden under 720px; `#clear` restructured to `<span class="btn-label" data-i18n="clear">…</span>` inside the button so `applyLang()` still translates the label while CSS hides it on mobile, leaving an icon (e.g. a 🗑/trash glyph) as the visible control. `applyLang()` gains a `[data-i18n-aria]` lookup to keep the icon button's `aria-label` translated (same strings as `clear`/`centersTitle`). Tighter `header` padding and `h1` size under 720px; VI/EN pill padding reduced.

**4. Table reflow via `data-label` attributes + CSS.**
`buildTable()` in `markdown.js` emits `<td data-label="…">` where the label is the escaped plain-text column header (from the raw header cell). CSS under 720px (scoped to `.bubble.rendered table`): hide `thead`, make each `tr` a bordered card, and `td::before { content: attr(data-label) }` so stacked cells keep their column meaning. Since `inline()` already escapes header cells, labels are emitted with `esc()` (or a header-specific escape) to keep them attribute-safe.
- *Alternative considered:* JS post-processing of rendered tables — rejected; CSS + `data-label` is declarative, survives re-renders during streaming, and keeps `markdown.js` a pure string function.

**5. Viewport + safe areas.**
`body { height:100vh; height:100dvh; }` (fallback then progressive enhancement). `#composer` gets `padding-bottom: max(14px, env(safe-area-inset-bottom))` under 720px; `#send` padding/height bumped to a ~44px tap target on mobile.

## Risks / Trade-offs

- **`data-label` changes renderer output** → The two table assertions in `tests/markdown.test.mjs` (`/<td>Aug 26<\/td>/`, `/<td><strong>Mon<\/strong><\/td>/`) are updated deliberately to match `<td data-label=…>`.
- **Duplicate center info on mobile welcome** → Data is static and mirrored from the sidebar; a single source of truth in `I18N` avoids drift, and links remain gated by `markdown.js`.
- **`100dvh` support gaps** → `100vh` fallback line precedes it; old browsers keep current behavior, iOS gets the fix.
- **Long unbroken URLs in welcome text** → Existing `word-break: break-word` on `.bubble` already handles overflow.
