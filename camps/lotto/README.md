# Camps · จับสลาก · เช็กชื่อ (`/lotto/`)

Registration at the entrance: an officer scans the student's QR (the student id), the student is **checked in** and the **draw number** is shown in huge type. The page is built to move a crowd: scan fast, nothing to tap on a normal scan.

The roster, draw numbers, QR printing, Excel/CSV import and the officer list are managed in the admin page (`/admin/#lotto`); `/lotto/` itself is only the scan page (it links to the admin page for admins).

## How a scan works
1. **The camera is on from the start** (only the "ปิดกล้อง" button turns it off); a scan only pauses the picture behind the pop-up. Torch / switch-camera buttons appear on phones that have them. If the camera cannot open, a box explains how to allow it. The same QR in front of the camera is ignored for 3 s.
2. **The number appears at once.** The phone keeps a copy of the roster (`GET /camps/lotto/scanner/roster`, refreshed every 2 min), so the pop-up shows the number and name the instant the QR is read ("กำลังบันทึก…"); the server answer then turns it green (checked in), amber (already checked, with who / when) or red (not on the list).
3. **A successful check-in closes its own pop-up after 3 s** (a bar counts down; touching the pop-up keeps it open). Duplicates and errors stay until closed. A short tone tells pass / warning / problem without looking (toggle: *เสียง*), and the phone vibrates.
4. **Undo:** "ยกเลิกการเช็กชื่อ" removes a wrong check-in (the officer who made it, or an admin; logged as `undone`). Same button when a name is opened from the recent list.
5. **Progress:** "เช็กชื่อแล้ว N / total", how many *you* checked and how many are left, and the latest check-ins (tap one to open it).
6. **No signal:** the roster on the phone still answers; check-ins wait in the phone (`localStorage`), a banner shows how many, and they are sent when the signal is back. Anything the server then refuses (e.g. someone else checked the same student in) is listed. The page itself must already be open (a cold start with no signal is not cached).
7. The student's Auth0 photo is fetched separately (`GET /camps/lotto/scanner/picture`) and fills in when it arrives, so it never slows a scan.

Speed on the server: a scan is one atomic `UPDATE … RETURNING` (a second scan matches no row) plus one log row; an officer assigned by an admin needs no Auth0 role lookup, and there is no photo lookup.

The draw number is not a secret: it is given to the person at the gate. (The earlier "open the gift" step is gone from the pages; `POST /camps/lotto/scanner/gift/open` and the gift columns remain in the Worker but nothing calls them.)

## Who can use it
- Admins: Auth0 role `camp_admin` or `budget_admin` (and the `lotto` admin permission).
- Officers: accounts with a verified email an admin added (`camp_lotto_scanners`).

## API (`/camps/lotto/*`, Worker handler `handlers/lotto.js`, migrations `0007_camps_lotto.sql`, `0010_camps_lotto_gift.sql`)
Officers and admins: `GET scanner/me` · `GET scanner/roster` · `GET scanner/stats` · `GET scanner/picture?studentId=` · `GET scanner/verify?studentId=` (read-only) · `GET scanner/lookup?q=` · `POST admin/scan` (check in; 409 if already checked) · `POST scanner/undo`.
Admins: `GET admin/overview` · `GET|POST admin/students` · `POST admin/students/import` · `DELETE admin/students/:id` · `GET|POST admin/scanners` · `DELETE admin/scanners/:email`.

## Files
`index.html`, `app.js` (its own Client ID constant, or `window.LOTTO_AUTH0_CLIENT_ID`), `style.css`. Camera scanning uses `html5-qrcode` (`/assets/vendor/`).
