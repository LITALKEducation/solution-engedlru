# Camps (enged.sorasukt.com)

Cloudflare Pages project, root directory `camps`, no build command.

| Path | What |
| --- | --- |
| `/` | Camps home: choose **งบประมาณ** (finance) or **ฝ่ายบุคคล** (coming soon). Plain web page. |
| `/admin/` | **Admin dashboard** (every `/admin/*` page shares one frame: `admin/shell.js` + `admin/shell.css` add the sidebar menu and top bar around the page's own markup and restyle the older pages; the generated `admin/{lotto,qrcheck,aka}` pages get it from `build-admin-pages.mjs`; the dashboard itself: `admin/index.html`, `admin/dash.css`, `admin/dash.js`; the sidebar is the admin menu: after Google sign-in it shows live registration / roster / AKA numbers, per-department bars and recent registrations, refreshed every 10 s from `/camps/admin/live`, `/camps/admin/overview`, `/camps/aka/admin/overview`; the tiles below it are the menu). **Admin hub.** All admin work lives under `/admin/`, with its own menu and top bar (no links into the student / officer pages). `/admin/hr/{overview,quota,live,students,survey,settings}` are the HR admin pages (`survey` = แบบสำรวจโรงเรียน: an admin picks a student by student id and fills in the school-survey checklist of that student's ฝ่าย, saves and prints it; API `/camps/survey/admin/*`, table `camp_school_survey`, form text in `worker/src/lib/survey-forms.js`). An admin can also assign a student (`camp_survey_assignees`); that student signs in with @lru.ac.th on the public page `/hr/survey` (HR Auth0 app, no extra callback) and fills in and prints their own ฝ่าย's form via `/camps/survey/me` and `/camps/survey/save`. **Link previews (Open Graph):** every public page (`/`, `/hr/`, `/aka/`, `/lotto/`, `/qrcheck/`, `/hr/survey`) carries default description / Open Graph / Twitter tags and a 1200x630 image (`assets/og/<key>.png`). Defaults live in `worker/src/lib/og-pages.js`; `npm run stamp` writes the tags into the HTML (`scripts/build-og-meta.mjs`, also generates `_routes.json`) and `assets/og/generate.mjs` redraws the images. Admins edit title / description / image per page at `/admin/hr/og` (API `/camps/og/*`, table `camp_og_pages`, images in R2). Crawlers do not run JavaScript, so the Pages Function `functions/_middleware.js` swaps the admin's values into the HTML for the paths in `_routes.json`; if the API is slow or down the page is served with its default tags. The public form auto-saves (to the device at once, to the server ~2.5 s later) and works offline: `hr/sw.js` (scope `/hr/`, survey page only) caches the page and its assets, `hr/survey.js` keeps the last form and unsent drafts in localStorage and sends them when the connection returns (the page must have been opened online once) (old `/hr/overview` … redirect here). `/admin/lotto/`, `/admin/qrcheck/`, `/admin/aka/` are the same apps in admin mode (only the admin tabs). Those three pages are generated from `camps/<system>/index.html` by `npm run stamp`. Sign-in still uses each system's own Auth0 application and callback (`/hr/`, `/lotto/`, …); after the callback the page returns to the `/admin/…` page where sign-in started. The budget app keeps its own admin inside `/budget/`. |
| `/lotto/` | **Lottery scanning system.** Admins and assigned officers scan a student's QR to verify the draw number and mark them as registered (check in, then open the gift); roster / draw-number management for admins. See `lotto/README.md`. |
| `/hr/aka` | **ตั้งชื่อ AKA (students)** — moved here from `/aka/` and part of the HR menu (HR Auth0 app, API `/camps/aka/*` unchanged). A plain visit to `/aka/` now forwards to `/hr/aka`; `/aka/` itself stays only as the Auth0 callback of the admin page `/admin/aka` (a script in `aka/index.html` skips the forward when `?code=`/`?error=` is present or `ADMIN_MODE` is set). |
| `/aka/` | **ระบบ AKA** — each student sets a nickname and a camp name (AKA) until an admin closes naming; admins edit and export by department (year 4 → 1). Separate system with its own Auth0 application. See `aka/README.md`. |
| `/qrcheck/` | **ระบบเช็ค QR.** Looks the student up in the HR registration data (name, year, department) and records the result of admin-defined checks (ตรวจครั้งที่ 1, ตรวจสอบป้ายกับ AKA, …). Separate system with its own Auth0 application. See `qrcheck/README.md`. |
| `/hr/` | ฝ่ายบุคคล · **ข้อมูลของฉัน**: the signed-in student's details — Auth0 (Google) photo, name (Thai + English), nickname, AKA, department, birth date (shown as `9 มีนาคม 2548`), phone, guardian phone, student ID, 13-digit national ID (`camp_students.national_id`, migration 0017; admins set it on นักศึกษา or with a `เลขบัตรประชาชน` CSV column) and a QR of the student ID (tap to enlarge). `/hr/overview` … moved to `/admin/hr/…` (redirects). |
| `/hr/departments` | ฝ่ายบุคคล · ภาพรวมฝ่าย: the 5 departments (shows the duties, head and your slot for the chosen one). |
| `/hr/choose` | ฝ่ายบุคคล · เลือกฝ่าย: shows only the head of each department; tap one to preview, pick it and register (Google sign-in). |
| `/hr/overview` `/hr/quota` `/hr/students` `/hr/settings` | ฝ่ายบุคคล · ผู้ดูแล: one page per admin function, each a menu item visible only to admins (`/hr/admin` redirects to `/hr/overview`). |
| `/budget/` | Finance web app (Auth0 login, installable PWA, phone install required). See `budget/README.md`. |
| `/budget/verify/` | Public receipt verification page (QR target). |

Only `/budget/` is a web app. `sw.js` at the root is a one-off migration worker that unregisters the old root-scope service worker; `_redirects` keeps old `/verify/…` QR links and the old manifest URL working.

## ฝ่ายบุคคล (department selection)

- **Students** sign in with Google using the university email `sb6740102220@lru.ac.th`; the student ID (`6740102220`) is read from the email (domain must be exactly `lru.ac.th` and the email verified by Google). They first pick a department, then press **ลงทะเบียน** (Google sign-in happens at that step and the choice is remembered across the redirect). They must be on the roster and can hold **one** department. Each department has a quota per year and gender, and the page shows registered/quota and open/closed for every slot; students may switch or cancel while registration is open.
- Students tap a department card to **preview** it (duties, head of department, slots per year/gender, switch between departments) and then press เลือกฝ่ายนี้; admins edit each head / contact / duties and upload the head photo on ตั้งค่า (migrations 0008, 0009; photos live in R2 under camps/heads/ and are resized to a 480px square JPEG in the browser).
- **Admins** (Auth0 role `camp_admin` or `budget_admin`) manage everything on separate pages (ภาพรวม · โควตา · นักศึกษา · ตั้งค่า): roster (student ID → name + year 1–4 + gender; add one by one, or import an **Excel (.xlsx) / CSV file** / pasted text), quotas per department per **year and gender (ชาย / หญิง)**, and can **put names into a department by hand** (students page → กำหนดฝ่าย; overview → เพิ่มรายชื่อ / ×; or a `ฝ่าย` column in the CSV; admin assignments work in any registration state and can go over a quota after a confirmation), registration state (เร็วๆ นี้ / เปิดรับ / ปิดรับ), per-student clear, CSV / Excel export, and a per-department registration export (Excel with a sheet per department, or PDF)
- Slots are claimed with one atomic SQL statement, so two students can't take the last slot.
- API: `/camps/*` on the Worker; tables from `worker/migrations/0006_camps_hr.sql` (applied automatically by the deploy workflow).

### Auth0 setup for /hr/
Add `https://enged.sorasukt.com/hr/` to **Allowed Callback URLs** and **Allowed Logout URLs** (`/hr/admin/` needs no extra entry: Auth0 returns to `/hr/` and the app sends admins back to where they started) (same application and Google connection as the finance app; the login session is shared). Optional: create a role `camp_admin` for people who should manage ฝ่ายบุคคล but not the finance system.

### CSV import (admin → นักศึกษา)
Columns `รหัสนักศึกษา, ชื่อ-นามสกุล, ชั้นปี, เพศ` and optionally `ฝ่าย` (department name, short name or code) (a template can be downloaded on the page). The header row is optional and may be Thai or English, in any order (`id, name, year, gender`); separators `,` `;` or tab; quoted values and a UTF-8 BOM are fine (old Excel files in Thai Windows-874 are decoded too). Gender can be `ชาย/หญิง` or `M/F`; when there is no gender column it is read from the title in the name (`นาย`, `นางสาว`, `นาง`). Existing student IDs are updated, bad rows are skipped and listed with the reason.

### Database migrations
`worker/migrations/*.sql` are applied by the deploy workflow (`wrangler d1 migrations apply`) on every push to `main` that touches `worker/**`; it can also be started by hand from the Actions tab (Deploy LITALK Education Worker → Run workflow). Applied migrations are tracked by file name only, so **never edit an existing migration** — add a new numbered file (the `Check D1 migrations` workflow fails pull requests that change existing ones). `0007_camps_gender.sql` upgrades the ฝ่ายบุคคล tables that `0006` created without gender.


### Sign-in first
The student pages (`/hr/`, `/hr/choose`, `/hr/select`) show only a Google sign-in card until the visitor is signed in, and `GET /camps/departments` returns 401 without a token. Only `GET /camps/status` (registration open/closed, used by the home badge) and the head photo images stay public.


### Checks (CI)
`.github/workflows/ci.yml` runs on every pull request touching `worker/` or `camps/`: `npm run check` (every script parses, every local `src`/`href` in `camps/**/*.html` exists, migration names), `npm test` (API tests against in-memory D1 with all migrations applied) and `wrangler deploy --dry-run`. The deploy workflow runs the same checks before it applies migrations.

### Sign-in runs on the Worker (one Auth0 application, one callback)
Every Camps page (budget, HR, admin, lottery, QR check, AKA) signs in through the Worker, not directly with Auth0, so Auth0 needs only **one** application and **two** URLs, whatever pages are added later:

1. Auth0 → Applications → the existing SPA (`AUTH0_CLIENT_ID` in `worker/wrangler.toml`, default `PGqozL…`).
2. *Allowed Callback URLs* → add `https://engedlru-api.stnetworld.workers.dev/auth/callback` (use the Worker's own URL if it has a custom domain).
3. *Allowed Logout URLs* → add `https://engedlru-api.stnetworld.workers.dev/auth/logged-out`.
4. *Grant Types*: Authorization Code and **Refresh Token** (rotation on is fine); *Connections*: google-oauth2.
5. Deploy the **Worker first** (it adds `/auth/*` and migration `0018_auth_tmp.sql`), then the Pages site. The old per-page callback / logout URLs and the other Auth0 applications are no longer used and can be removed once sign-in is verified.

How it works: `assets/worker-auth.js` replaces the auth0-spa-js script (same calls: `createAuth0Client`, `loginWithRedirect`, `handleRedirectCallback`, `getTokenSilently`, `getUser`, `logout`). `GET /auth/login?returnTo=<page>` starts Authorization Code + PKCE on the Worker (state in D1 `auth_tmp`, 10 min); Auth0 returns to `/auth/callback`, the Worker swaps the code for tokens and sends the browser back to **the page it started from** with a one-time `?code=` (2 min, single use, no tokens in any URL); the page trades it at `POST /auth/exchange`. Tokens refresh through `POST /auth/refresh` (no CORS / Allowed Web Origins setting needed; two tabs refresh one at a time with `navigator.locks`; if Auth0 is down the session is kept, only a revoked refresh token signs the user out). The session lives in `localStorage` (`camps.session.v1`) and is **shared by every Camps page**, so signing in once covers all systems. `returnTo` must be an `ALLOWED_ORIGINS` origin and a path under `/hr/ /admin/ /budget/ /lotto/ /qrcheck/ /aka/`. API calls still send the Auth0 access token and the Worker still validates it with `/userinfo`, so roles and permissions are unchanged. Everyone signs in once more after the switch.

Roles (`camp_admin`, `budget_admin`) belong to users, so they keep working.

### How sign-in works
- Each system has a single callback (`/budget/`, `/hr/`, `/lotto/`, `/qrcheck/`, `/aka/`). In HR, Auth0 always lands on `/hr/`; the HR page where sign-in started travels in the Auth0 `appState.returnTo` (fallback: the tab's `hrReturn`) and `/hr/` sends you back there (only `/hr/…` paths are accepted).
- Sign-out and "ใช้บัญชี Google อื่น" return to the system's callback URL; the next sign-in then opens Google's account chooser.
- `?code=` / `?error=` is removed from the address bar even when Auth0 reports an error, and the reason is shown on the sign-in card.
- When the session is gone (refresh token expired or revoked) student pages fall back to the sign-in card instead of a "server unreachable" message.

### How sign-in works
- **Every page is its own callback and logout URL.** Auth0 sends you back to the very page you started from, that page finishes the sign-in itself and nothing hops through another page or app.
- Sign-out and "ใช้บัญชี Google อื่น" return to the same page; the next sign-in then opens Google's account chooser.
- `?code=` / `?error=` is removed from the address bar even when Auth0 reports an error, and the reason is shown on the sign-in card.
- When the session is gone (refresh token expired or revoked) student pages fall back to the sign-in card instead of a "server unreachable" message.
- Adding a new HR page that signs in? Add its URL to the HR application's list and to `PAGE_PATHS` in `hr/hr.js`.

### Automatic open/close (countdown) and location check — `/hr/settings`
Both are stored in `camp_settings` (no migration) and enforced by the Worker, not just the page.
- **Schedule / countdown.** Off by default. When on, the registration state follows the clock (the manual เร็วๆ นี้ / เปิด / ปิด buttons are ignored until the schedule is stopped): before the open time it is *pending*, between open and close it is *open*, after the close time *closed*. Two ways to set it: **date + time** (open at / close at, either may be empty) or **countdown** ("starts in H:M" and "stays open for H:M", turned into absolute times when the admin presses *เริ่มนับถอยหลัง*, so it keeps running with no browser open). Students and admins see a live countdown in the page header; when it reaches zero the page re-reads the state.
- **Location check.** Off by default. When on, `POST /camps/select` must carry the browser's `lat`, `lng` and `accuracy`; the Worker computes the great-circle distance to the configured place and refuses with `OUT_OF_RANGE` (distance included) when it is more than the radius (10 m – 100 km) away. GPS error up to 50 m (the reported accuracy, capped) is tolerated. Students only see the place name and radius, never the coordinates. Cancelling a registration and admin assignments need no location. Limit: the position comes from the student's device, so this deters, it does not prove, presence.

### In-app browsers are blocked
Every page (except the public receipt verification page) loads `/assets/inapp-guard.js` first. Opened inside LINE, Facebook, Messenger, Instagram, TikTok, WeChat, X, Snapchat, Kakao, Naver, Pinterest, LinkedIn, Slack, the Google app or any other web view (iOS web view without the Safari token, Android `; wv)`), the page is replaced by a screen asking the visitor to open it in Safari / Chrome: a button that reopens it in the external browser where that is possible (LINE `?openExternalBrowser=1`, Android Chrome intent), step-by-step instructions for the app, and a copy-link button. Why: Google refuses sign-in in embedded browsers (`disallowed_useragent`), and location and installing the web app are unreliable there. Installed home-screen web apps are not blocked. None of the page's own scripts run inside the web view. `npm run check` fails when a page forgets the script; `npm test` covers the user-agent list. If a normal browser is ever flagged by mistake, fix `detect()` in that file (the list is deliberately conservative).

## Cache busting
Pages load scripts and styles as `app.js?v=<hash>`. The hash is the file's content, so a browser always picks up a changed file.
After editing any `.js` or `.css` under `camps/` (except `budget/`), run `cd worker && npm run stamp`; `npm run check` and CI fail when a value is out of date.
