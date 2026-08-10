## 1. Model default

- [x] 1.1 Change `DEFAULT_MODEL` in `api/chat.js` from `mimo-v2.5-free` to `deepseek-v4-flash-free`
- [x] 1.2 Update the default-model references in `AGENTS.md` and `README.md`

## 2. Watchdog hardening

- [x] 2.1 In `streamChatCompletion` (`api/chat.js`), treat `reasoning` / `reasoning_content` deltas as first-delta liveness, re-arming the watchdog to the 50s overall bound

## 3. Deterministic definition coverage

- [x] 3.1 Add `thiền vipassana` / `thien vipassana` to the definition trigger list in `lib/quick-answers.js`

## 4. Classifier documentation

- [x] 4.1 Add a comment in `lib/router.js` documenting why the classifier keeps its conservative 2.5s → tools default with reasoning models

## 5. Verification

- [x] 5.1 Run `npm test` — all suites green, static prompt strings unchanged
- [x] 5.2 Manual smoke over `npm run dev`: "Tôi nên chuẩn bị gì cho khóa thiền?" and "Giới thiệu về thiền Vipassana" return real answers (SSE + JSON paths)
