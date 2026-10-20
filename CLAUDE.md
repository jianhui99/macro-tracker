# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

An invite-only multi-user diet diary (macros, water, weight, carb cycling, achievement badges) on Cloudflare Pages Functions + D1.
The UI is written in Chinese (`zh-CN`), with an English mode chosen in the system panel (see the i18n rule below).
There is no build step, bundler, framework, or linter: `public/` is served as-is and `functions/` and `lib/` implement the backend. Frontend regression tests use Node's built-in test runner.

## Commands

```sh
npm start                  # wrangler pages dev (local Pages + Functions + local D1)
npm test                   # frontend calculation, state and API regression checks
npm run db:migrate         # apply db/migrations to the local D1
npm run db:migrate:remote  # apply db/migrations to the production D1
npm run deploy             # wrangler pages deploy
```

Accounts use our own username/password login (salted SHA-256, kept cheap for the free-plan 10 ms CPU limit); friends join through invitation links from `/admin`. The only secret is `ADMIN_ACCESS_KEY` (see `docs/用户登陆-部署配置.md`); without it the admin entry fails closed.
Run `npm run db:migrate` once before the first `npm start`, and after adding a migration.

## Architecture

- **Backend** (`functions/api/[[path]].js`): one catch-all Pages Function with a regex `ROUTES` table.
  Business requests need a D1-backed HttpOnly session. Mutations require same-origin, CSRF and account-id checks.
  `lib/auth.js` owns authentication; `lib/account.js` owns onboarding; `lib/admin.js` owns admin APIs. `functions/admin/[[path]].js` guards the admin page.
  Handlers receive `{ db, env, body, userId, params }`; snake_case rows are mapped to the camelCase JSON the frontend uses by `foodToJson` / `entryToJson` / `userToJson`.
  Multi-statement writes use `db.batch` because a D1 batch is one transaction.
- **Frontend**: `public/index.html` holds the markup, `public/css/app.css` holds styles, and `public/js/app.js` loads native ES modules with no build step. Feature modules own their event listeners; dynamic lists use event delegation, with no inline handlers or global function bridge.
  Pages (`page-diary`, `page-warehouse`, `page-summary`, `page-achievements`, `page-settings`) are toggled by `switchPage` in `app.js`. Shared helpers, nutrition calculations, food utilities, API access and UI controls live in their corresponding modules; settings also owns the weight log.
  `GET /api/state` loads everything into the shared binding exported by `state.js` once; mutations call `api()` and then patch `state` locally and re-render, rather than refetching.
  `session.js` loads the current identity and detects account changes. On 401 or account mismatch, hide private state and return to login; never replay a mutation under another account. Tokens are never stored in localStorage.
- **Database** (`db/migrations/*.sql`): add a new numbered migration for any schema change; never edit applied ones.
  Every business table is scoped by `user_id`. Migration 0007 assigns all legacy records to owner. The owner claims that account once by registering with `ADMIN_ACCESS_KEY` as the invitation code. Diary/water sequences are per-account and never decrease after delete or import.

## Non-obvious rules

- **Targets are computed on the client, never stored.** `computePlan` (Mifflin-St Jeor, TDEE - 550 kcal, protein 2.1 g/kg, fat 25% kcal) derives the daily plan from `user_settings`.
  Carb cycling stores only carb/fat gram offsets per day type (`day_types`) and a per-date type (`day_plan`); `targetsFor(date)` applies them.
- **Weight log drives settings weight.** Any weight-log or user change calls `syncSettingsWeight`, which overwrites `user_settings.weight` with the latest weigh-in.
- **Diary entries store a macro snapshot.** `food_id` is a loose reference (temporary entries use `temp_...` ids, deleting a food leaves history intact).
  Editing a food (`PUT /api/foods/:id`) cascades: it recomputes every non-temporary entry for that food from its `raw_amount`.
- **Unit parsing is duplicated** between server (`putFood`) and client (`unitBase` / `unitText`): `"100g"` means base amount 100, unit text `g`.
  Keep both in sync.
- **Dates are local `YYYY-MM-DD`.** Use `localDate()` on the client, never `toISOString()` (UTC shifts the day in UTC+8).
  The server uses `env.TIME_ZONE` (`wrangler.toml`) for the quote-of-the-day rollover.
- **Global rewards** come from `public/js/rules.js` defaults and the versioned D1 `game_rules` row. Defaults keep compliance at `[-300, +50]` kcal; protein threshold affects stars and achievements without changing nutrition targets. Admin edits recalculate historical rewards and preserve unlocked medals. Open pages prompt to refresh.
- **Achievements are evaluated client-side** by `evaluateAchievements`, which replays history day by day.
  Newly reached tiers are POSTed as `series:threshold` ids and stored with `INSERT OR IGNORE`; unlocked badges are never revoked even if the stats later drop.
  Adding a series means adding it to `ACHIEVEMENTS` plus an image at `public/badges/<id>.webp` (crop/size notes in `public/badges/CREDITS.txt`), pixelated with `scripts/pixelate-badge.py` to match the pixel-art UI.
  Every new series must also get a `<id> | <subject>` line in the subject list of `docs/generate-badge.md`, matching the existing RPG-mascot style, so the owner can generate its artwork.
- **Level and XP are derived, never stored.** `level.js` replays history (calendar stars, water goals, weigh-ins, unlocked medal tiers) on every `syncAchievements`, so deleting records can lower the level; only the last-seen level sits in `localStorage`, keyed by account and rules version, to replay a missed level-up.
  The one stored exception is `user_settings.max_level`, the highest level ever reached, which only rises: it keeps hero skins (`skins.js`, one per level title) unlocked after the level drops.
- **Every icon, image and ornament is pixel art**, buttons included; never add a smooth vector icon, photo or illustration.
  - Icons: keep writing `<span class="ms">name</span>`; `pixel-icons.js` swaps it for a 12×12 one-colour drawing in `currentColor`. A new icon name needs a drawing in `ICONS` and its name in the pages' Material Symbols `icon_names` lists, which a test checks against `ICONS`.
  - Pictures: sprites and avatars are palette grids drawn with `spriteRects` (`sprites.js`, `avatar.js`, hero skins in `SKINS`); badge artwork goes through `scripts/pixelate-badge.py`.
  - Small ornaments use the stepped `--px-*` clip-path shapes in `app.css` (diamond, sparkle, cursors), not rotated squares or smooth polygons; pixel art is never rotated by angles that are not multiples of 90°.
- **New UI must ship with matching animation.** Every element that appears, changes, or disappears gets motion consistent with the rest of the app, reusing what already exists before adding new keyframes:
  - Easing tokens `--ease-out` (entrances/exits) and `--ease-spring` (pops, bars, thumbs).
  - Existing keyframes such as `pageIn`, `panelIn`, `chipIn` / `chipOut`, `wordIn`, `bump`.
  - JS helpers `replay(el, cls)` to restart a CSS animation and `tweenNumber(el, to)` for changing numbers.
  - Exits follow the `is-leaving` pattern: add the class, wait for the animation, then update `state` and re-render (see `deleteWater`).
  - Respect reduced motion: the global `prefers-reduced-motion` CSS block covers CSS animations, but JS-driven motion and animation waits must check `reduceMotion.matches` and skip.
- **UI work must be checked in mobile view and across the responsive breakpoints.** After finishing any UI change, check the affected page at phone width (390px) and on both sides of the `max-width: 1100px` and `max-width: 720px` breakpoints in `app.css`.
  Confirm nothing overflows its card or the viewport (`scrollWidth` equals `clientWidth`), nothing collapses or overlaps, and segmented-control thumbs still line up.
  Flex rows that hold inputs or `.seg` controls are the usual culprits: shrinking children need `min-width: 0`, and controls that must keep their size need `flex-shrink: 0`.
- **Quote of the day** comes from `public/data/quote.json` (each entry has `zh` and `en`), one per local day, in the UI language.
  The `GET /api/quote` ZenQuotes proxy still exists on the server but the UI no longer calls it.
- **English is a translation layer, not a second copy of the UI.** Markup and modules stay in Chinese; `i18n.js` translates the rendered page in English mode (boot pass + `MutationObserver`), and the language lives in `localStorage` (`macro_tracker_lang`, switching reloads).
  Any new UI text needs an entry in `i18n-en.js`, keyed by the exact Chinese text node or attribute; text with values uses `{n}` patterns, whose captures are translated on their own (meal names, units, weekdays).
  Dates like `10月19日` are handled by rules in `i18n.js`, and labels joined with `，、：；·` resolve segment by segment.
  User data (food names, categories) passes through untranslated; mark text that must never be translated with `translate="no"`.
  `npm test` checks static Chinese strings in the app, login, character and admin pages; for dynamic text, switch to English and check the page for leftover Chinese (dev builds log misses as `[i18n] no English for ...`).
