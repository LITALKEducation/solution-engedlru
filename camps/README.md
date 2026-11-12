# Camps (enged.sorasukt.com)

Cloudflare Pages project, root directory `camps`, no build command.

| Path | What |
| --- | --- |
| `/` | Camps home: choose **งบประมาณ** (finance) or **ฝ่ายบุคคล** (coming soon). Plain web page. |
| `/hr/` | ฝ่ายบุคคล: the 5 camp departments, student department selection (Google sign-in) and the admin panel. Plain web page (not a web app). |
| `/budget/` | Finance web app (Auth0 login, installable PWA, phone install required). See `budget/README.md`. |
| `/budget/verify/` | Public receipt verification page (QR target). |

Only `/budget/` is a web app. `sw.js` at the root is a one-off migration worker that unregisters the old root-scope service worker; `_redirects` keeps old `/verify/…` QR links and the old manifest URL working.

## ฝ่ายบุคคล (department selection)

- **Students** sign in with Google using the university email `sb6740102220@lru.ac.th`; the student ID (`6740102220`) is read from the email (domain must be exactly `lru.ac.th` and the email verified by Google). They must be on the roster, then pick **one** department. Each department/year has a quota and the page shows how many slots remain; students may switch or cancel while registration is open.
- **Admins** (Auth0 role `camp_admin` or `budget_admin`) manage everything on the same page: roster (student ID → name + year 1–4, single add or paste/CSV import), quotas per department per year, registration state (เร็วๆ นี้ / เปิดรับ / ปิดรับ), per-student clear, CSV export.
- Slots are claimed with one atomic SQL statement, so two students can't take the last slot.
- API: `/camps/*` on the Worker; tables from `worker/migrations/0006_camps_hr.sql` (applied automatically by the deploy workflow).

### Auth0 setup for /hr/
Add `https://enged.sorasukt.com/hr/` to **Allowed Callback URLs** and **Allowed Logout URLs** (same application and Google connection as the finance app; the login session is shared). Optional: create a role `camp_admin` for people who should manage ฝ่ายบุคคล but not the finance system.
