## 1. ESLint setup

- [ ] 1.1 Install `eslint`, `@eslint/js`, and `globals` as devDependencies
- [ ] 1.2 Create `eslint.config.js` (flat config: `@eslint/js` recommended, module sourceType, Node globals + browser globals for `public/**`, ignores for `node_modules`/`.vercel`)
- [ ] 1.3 Add `"lint": "eslint ."` script to `package.json`
- [ ] 1.4 Run `npm run lint` and fix genuine issues or add targeted rule overrides until it exits clean

## 2. CI workflow

- [ ] 2.1 Create `.github/workflows/ci.yml` triggered on `pull_request` → `main` and `push` → `main`, running `npm ci`, `npm test`, `npm run lint`
- [ ] 2.2 Remove the `test` job and its `needs: test` from `.github/workflows/deploy.yml`

## 3. README rewrite

- [ ] 3.1 Rewrite `README.md` to a concise, human-friendly document (pitch, features, requirements, quick start, run/test/lint/deploy, security summary, link to `AGENTS.md`), dropping the file-tree listing and churn-prone env/model details

## 4. Verification

- [ ] 4.1 Run `npm test` — all suites pass
- [ ] 4.2 Run `npm run lint` — exits clean
- [ ] 4.3 Confirm `find api -name '*.js'` returns exactly `api/chat.js`
- [ ] 4.4 Run `openspec validate` on the change
