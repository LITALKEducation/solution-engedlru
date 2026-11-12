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
