# Camps (enged.sorasukt.com)

Cloudflare Pages project, root directory `camps`, no build command.

| Path | What |
| --- | --- |
| `/` | Camps home: choose **งบประมาณ** (finance) or **ฝ่ายบุคคล** (coming soon). Plain web page. |
| `/hr/` | ฝ่ายบุคคล · ลงทะเบียน: the 5 camp departments and student registration (Google sign-in). Plain web page (not a web app). |
| `/hr/overview` `/hr/quota` `/hr/students` `/hr/settings` | ฝ่ายบุคคล · ผู้ดูแล: one page per admin function, each a menu item visible only to admins (`/hr/admin` redirects to `/hr/overview`). |
| `/budget/` | Finance web app (Auth0 login, installable PWA, phone install required). See `budget/README.md`. |
| `/budget/verify/` | Public receipt verification page (QR target). |

Only `/budget/` is a web app. `sw.js` at the root is a one-off migration worker that unregisters the old root-scope service worker; `_redirects` keeps old `/verify/…` QR links and the old manifest URL working.

## ฝ่ายบุคคล (department selection)

- **Students** sign in with Google using the university email `sb6740102220@lru.ac.th`; the student ID (`6740102220`) is read from the email (domain must be exactly `lru.ac.th` and the email verified by Google). They first pick a department, then press **ลงทะเบียน** (Google sign-in happens at that step and the choice is remembered across the redirect). They must be on the roster and can hold **one** department. Each department has a quota per year and gender, and the page shows registered/quota and open/closed for every slot; students may switch or cancel while registration is open.
- **Admins** (Auth0 role `camp_admin` or `budget_admin`) manage everything on separate pages (ภาพรวม · โควตา · นักศึกษา · ตั้งค่า): roster (student ID → name + year 1–4 + gender; add one by one, or import a **CSV file** / pasted text), quotas per department per **year and gender (ชาย / หญิง)**, registration state (เร็วๆ นี้ / เปิดรับ / ปิดรับ), per-student clear, CSV export.
- Slots are claimed with one atomic SQL statement, so two students can't take the last slot.
- API: `/camps/*` on the Worker; tables from `worker/migrations/0006_camps_hr.sql` (applied automatically by the deploy workflow).

### Auth0 setup for /hr/
Add `https://enged.sorasukt.com/hr/` to **Allowed Callback URLs** and **Allowed Logout URLs** (`/hr/admin/` needs no extra entry: Auth0 returns to `/hr/` and the app sends admins back to where they started) (same application and Google connection as the finance app; the login session is shared). Optional: create a role `camp_admin` for people who should manage ฝ่ายบุคคล but not the finance system.

### CSV import (admin → นักศึกษา)
Columns `รหัสนักศึกษา, ชื่อ-นามสกุล, ชั้นปี, เพศ` (a template can be downloaded on the page). The header row is optional and may be Thai or English, in any order (`id, name, year, gender`); separators `,` `;` or tab; quoted values and a UTF-8 BOM are fine (old Excel files in Thai Windows-874 are decoded too). Gender can be `ชาย/หญิง` or `M/F`; when there is no gender column it is read from the title in the name (`นาย`, `นางสาว`, `นาง`). Existing student IDs are updated, bad rows are skipped and listed with the reason.
