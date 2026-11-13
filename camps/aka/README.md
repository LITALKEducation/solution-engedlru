# Camps · ระบบ AKA (`/aka/`)

AKA is the **name people call each other in the camp** (plus a nickname, ชื่อเล่น). Each student sets it themselves; people, years and departments come from the HR registration data (`camp_students`, `camp_selections`, `camp_departments`). A separate system: own page, own Auth0 application and callback `https://enged.sorasukt.com/aka/`, own table (`camp_aka`, migration `0012_camps_aka.sql`).

## Students
Sign in with Google (university email → student id, like the HR system). The page shows name, id, year and department from HR and a form for **ชื่อเล่น** (≤ 30 characters) and **AKA** (≤ 40). Both are required, Thai and any characters are fine, extra spaces and zero-width marks are cleaned. A live preview shows how friends will call them.

**Names can be changed at any time until an admin closes naming.** After that the page shows the saved names read-only and the API refuses changes (`CLOSED`). Accounts that are not a university mailbox, have an unverified email or are not in the HR roster get a clear message instead of the form.

## Admins (`camp_admin` / `budget_admin`)
| Tab | Content |
|---|---|
| ชื่อของฉัน | the student view (for admins who are also students) |
| รายชื่อ | everyone in the HR roster with ชื่อเล่น and AKA, filter by department / year / named or not, search by name, id, nickname or AKA, **edit or clear** any student's names (also while naming is closed) |
| ตั้งค่าและส่งออก | **เปิด / ปิดรับการตั้งชื่อ** with progress (named / total), and the export below |

### Export
**Excel** (one sheet per department) and **PDF** (one page per department, Thai font embedded, year sub-headings), grouped by **ฝ่าย** in the HR order, students with no department last (“ยังไม่เลือกฝ่าย”). Inside a department students are ordered from the **highest year to the lowest (4 → 1)**, then by student id. The Excel sheets have exactly four columns: **รหัสนักศึกษา · ชื่อ-สกุล · ชื่อเล่น · AKA**. "เฉพาะผู้ที่ตั้งชื่อแล้ว" leaves out students who have not named themselves (they appear with empty cells otherwise, so gaps are visible).

## Link with the QR check system
`/qrcheck/` shows the student's AKA (and nickname) in a highlighted box for the check type **เทียบป้ายกับ AKA**, so the officer compares the badge with the name the student chose.

## API (`/camps/aka/*`, `handlers/aka.js`)
`GET status` (public) · `GET me` · `POST save` · admin: `GET overview`, `POST state`, `GET list` (`department`, `year`, `named`, `q`), `POST set` (`studentId` + names, or `clear`). Admin writes are audited in `budget_audit_logs` (`entity_type = aka`); naming state is `camp_settings.aka_state` (`open` by default).

## Files
`index.html`, `app.js` (own Client ID constant `CLIENT` or `window.AKA_AUTH0_CLIENT_ID`), `style.css`, `vendor/` (SheetJS, jsPDF + autotable, loaded when exporting) and `fonts/` (Sarabun for the PDF) — copied here so this system does not depend on another one.
