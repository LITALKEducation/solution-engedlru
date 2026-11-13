# Camps (enged.sorasukt.com)

Cloudflare Pages project, root directory `camps`, no build command.

| Path | What |
| --- | --- |
| `/` | Camps home: choose **งบประมาณ** (finance) or **ฝ่ายบุคคล** (coming soon). Plain web page. |
| `/lotto/` | Lottery roster, QR check-in (one-time scan) and scanner-operator assignment. See `lotto/README.md`. |
| `/hr/` | ฝ่ายบุคคล · ภาพรวมฝ่าย: the 5 departments (duties, head with photo/contact, slots per year and gender). Plain web page (not a web app). |
| `/hr/select` | ฝ่ายบุคคล · เลือกเลย: a single dropdown of the departments with a register button (shows the duties, head and your slot for the chosen one). |
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

### One Auth0 application per system
Budget, HR and Lottery each have **their own Auth0 application**, their own Client ID and **one callback URL each**, so a misconfiguration or outage in one can never stop sign-in in another. The Worker validates tokens with Auth0 `/userinfo` and reads roles per **user**, so no Worker change or role change is needed.

Create three applications in Auth0 (Applications → Create → *Single Page Web Applications*), e.g. `Camps Budget`, `Camps HR`, `Camps Lotto`, and for **each** one:
1. *Allowed Web Origins* = `https://enged.sorasukt.com`
2. *Allowed Callback URLs* **and** *Allowed Logout URLs* = exactly the one URL in the table
3. *Advanced → Grant Types*: Implicit, Authorization Code, **Refresh Token**; and *Refresh Token Rotation* **on** (the apps use refresh tokens)
4. *Connections*: enable **google-oauth2**
5. Copy the **Client ID** into the one constant of that app:

| System | Callback + logout URL (only this one) | Where the Client ID goes |
|---|---|---|
| Budget | `https://enged.sorasukt.com/budget/` | `CLIENT_ID` in `budget/assets/budget-v2.js` (or `window.BUDGET_AUTH0_CLIENT_ID`) |
| HR | `https://enged.sorasukt.com/hr/` | `CLIENT_ID` in `hr/hr.js` (or `window.HR_AUTH0_CLIENT_ID`) |
| Lottery | `https://enged.sorasukt.com/lotto/` | `CLIENT` in `lotto/app.js` (or `window.LOTTO_AUTH0_CLIENT_ID`) |

Until a system's own Client ID is pasted in, it keeps using the old shared application (that application must keep its previous URLs while you migrate; `npm run check` in `worker/` prints a warning while two systems still share an ID). Migrate one system at a time and remove its URLs from the old application afterwards.

Roles (`camp_admin`, `budget_admin`) belong to users, not applications, so they keep working. Each application has its own token cache, so the first time a user opens a second system they go through Auth0 once more; the Auth0 single-sign-on session makes that one click (no new Google prompt). Signing out ends the shared Auth0 session, so the other systems ask for sign-in the next time their token needs refreshing.

### How sign-in works
- Each system has a single callback (`/budget/`, `/hr/`, `/lotto/`). In HR, Auth0 always lands on `/hr/`; the HR page where sign-in started travels in the Auth0 `appState.returnTo` (fallback: the tab's `hrReturn`) and `/hr/` sends you back there (only `/hr/…` paths are accepted).
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
