## 1. markdown.js table labels

- [x] 1.1 Update `buildTable()` in `public/markdown.js` so each `<td>` carries `data-label="<escaped column header>"` (plain-text, attribute-safe header per column)
- [x] 1.2 Update `tests/markdown.test.mjs` table assertions (`/<td>Aug 26<\/td>/`, `/<td><strong>Mon<\/strong><\/td>/`) to match `<td data-label=…>` markup
- [x] 1.3 Run `npm test` and confirm the markdown suite passes

## 2. Mobile layout & CSS (public/index.html)

- [x] 2.1 Replace the `≤720px` media query so `aside.sidebar { display:none }` (drop the `order:2` push-below rules); keep `.centers` column rule only if still relevant
- [x] 2.2 Add `100dvh` fallback: `body { height:100vh; height:100dvh }`
- [x] 2.3 Add table→list CSS under 720px scoped to `.bubble.rendered`: hide `thead`, restack `tr` as cards, `td::before { content: attr(data-label) }`
- [x] 2.4 Compact header under 720px: hide `.subtitle`, reduce header padding/gap and `h1` size, shrink VI/EN pill padding
- [x] 2.5 Composer safe-area: `#composer` `padding-bottom` includes `env(safe-area-inset-bottom)` under 720px; bump `#send` to ~44px tap target

## 3. Header markup & i18n (public/index.html)

- [x] 3.1 Restructure `#clear` button to `<span class="btn-label" data-i18n="clear">…</span>` + visible icon; add CSS to hide `.btn-label` under 720px
- [x] 3.2 Extend `applyLang()` to translate `[data-i18n-aria]` `aria-label` attributes
- [x] 3.3 Add `welcomeMobile` (vi + en) to `I18N` with center names, addresses, phones, emails, and official links for Dhamma Virocana and Dhamma Vutthi
- [x] 3.4 Add `welcomeText()` helper using `matchMedia("(max-width:720px)")` to pick `welcomeMobile` vs `welcome`; use it in `init()` and `clearChat()`

## 4. Verification

- [x] 4.1 Run `npm test` — full suite passes
- [ ] 4.2 Manual check via `npm run dev`: desktop keeps sidebar + concise welcome; at 375px/720px widths the sidebar is gone, header is single-row/icon-only, welcome includes center info, and a table-heavy answer (e.g. a course schedule) reflows into stacked cards without horizontal overflow
