# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

A single-user diet diary (macros, water, weight, carb cycling, achievement badges) on Cloudflare Pages Functions + D1.
The UI text is Chinese (`zh-CN`).
There is no build step, bundler, framework, or linter: `public/` is served as-is and `functions/api/[[path]].js` is the whole backend. Frontend regression tests use Node's built-in test runner.

## Commands

```sh
npm start                  # wrangler pages dev (local Pages + Functions + local D1)
npm test                   # frontend calculation, state and API regression checks
npm run db:migrate         # apply db/migrations to the local D1
npm run db:migrate:remote  # apply db/migrations to the production D1
npm run deploy             # wrangler pages deploy
```

Local dev needs `API_KEY=...` in `.dev.vars`; production sets it with `wrangler pages secret put API_KEY`.
Without it the API refuses every request with 500.
Run `npm run db:migrate` once before the first `npm start`, and after adding a migration.

## Architecture

- **Backend** (`functions/api/[[path]].js`): one catch-all Pages Function with a regex `ROUTES` table.
  Every request needs `Authorization: Bearer <API_KEY>`.
  Handlers receive `{ db, env, body, params }`; snake_case rows are mapped to the camelCase JSON the frontend uses by `foodToJson` / `entryToJson` / `userToJson`.
  Multi-statement writes use `db.batch` because a D1 batch is one transaction.
- **Frontend**: `public/index.html` holds the markup, `public/css/app.css` holds styles, and `public/js/app.js` loads native ES modules with no build step. Feature modules own their event listeners; dynamic lists use event delegation, with no inline handlers or global function bridge.
  Pages (`page-diary`, `page-warehouse`, `page-summary`, `page-achievements`, `page-settings`) are toggled by `switchPage` in `app.js`. Shared helpers, nutrition calculations, food utilities, API access and UI controls live in their corresponding modules; settings also owns the weight log.
  `GET /api/state` loads everything into the shared binding exported by `state.js` once; mutations call `api()` and then patch `state` locally and re-render, rather than refetching.
  `api()` re-prompts for the key on 401 and stores it in `localStorage` (`macro_tracker_api_key`); other `localStorage` keys are UI-only conveniences.
- **Database** (`db/migrations/*.sql`): add a new numbered migration for any schema change; never edit applied ones.
  `user_settings` is a single row with `id = 1`.

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
- **Day compliance** is `[-300, +50]` kcal around target (`kcalStatus`).
- **Achievements are evaluated client-side** by `evaluateAchievements`, which replays history day by day.
  Newly reached tiers are POSTed as `series:threshold` ids and stored with `INSERT OR IGNORE`; unlocked badges are never revoked even if the stats later drop.
  Adding a series means adding it to `ACHIEVEMENTS` plus an image at `public/badges/<id>.webp` (crop/size notes in `public/badges/CREDITS.txt`).
  Every new series must also get a `<id> | <subject>` line in the subject list of `ref/generate-badge.md`, matching the existing RPG-mascot style, so the owner can generate its artwork.
- **New UI must ship with matching animation.** Every element that appears, changes, or disappears gets motion consistent with the rest of the app, reusing what already exists before adding new keyframes:
  - Easing tokens `--ease-out` (entrances/exits) and `--ease-spring` (pops, bars, thumbs).
  - Existing keyframes such as `pageIn`, `panelIn`, `chipIn` / `chipOut`, `wordIn`, `bump`.
  - JS helpers `replay(el, cls)` to restart a CSS animation and `tweenNumber(el, to)` for changing numbers.
  - Exits follow the `is-leaving` pattern: add the class, wait for the animation, then update `state` and re-render (see `deleteWater`).
  - Respect reduced motion: the global `prefers-reduced-motion` CSS block covers CSS animations, but JS-driven motion and animation waits must check `reduceMotion.matches` and skip.
- **Quote of the day** (`GET /api/quote`) proxies ZenQuotes (no CORS) with a per-isolate daily cache and local fallbacks; Chinese quotes rotate through the curated `ZH_QUOTES` list.
