# Camps · ระบบเช็ค QR (`/qrcheck/`)

A separate system (own page, own Auth0 application and callback `https://enged.sorasukt.com/qrcheck/`) for the officers who scan student QR codes. The roster, draw numbers and officer assignment stay in `/lotto/`; the API is the same Worker (`/camps/lotto/*`), so a problem in one page cannot take down the other.

Who can use it: admins (`camp_admin` / `budget_admin`) and the officers an admin assigned in `/lotto/` → เจ้าหน้าที่สแกน (verified email required). Admins also see the stats row.

## Scan → found in the database → check in → open the gift
With the switch **"เช็คชื่อและเปิดของขวัญอัตโนมัติ"** on (default) one scan does everything:
1. the QR is looked up in the roster (`camp_lotto_students`) — a QR that is not there gives a red **"ไม่พบในฐานข้อมูล"** (and a QR that is not a student id is explained);
2. if it is there the student is **checked in right away** (green "พบในฐานข้อมูล · เช็คชื่อสำเร็จ"; "เช็คชื่อไปแล้ว" if scanned before);
3. a gift box 🎁 is shown and the draw number stays hidden until someone taps **เปิดของขวัญ**, which reveals the number in huge type. A gift can be opened **once** (`POST /camps/lotto/scanner/gift/open`, only after check-in; who and when are stored in `gift_opened_at` / `gift_opened_by`, migration `0010`, and logged as `gift_opened` in `camp_lotto_scan_logs`). Scanning again shows it as already opened, with the number, time and officer.

Every popup shows the student's name and **Auth0 profile photo** (looked up with the Management API by the university email `sb<student id>@lru.ac.th`, cached 10 min, 2.5 s cap; the M2M application needs the `read:users` scope; without a photo the initial is shown). "สแกนคนต่อไป" / Enter / Esc / tap outside closes the popup and re-opens the camera when the scan came from the camera.

## Read-only mode
Switch the toggle off to only *look* (`GET /camps/lotto/scanner/verify?studentId=…`, never writes): red **"เช็คแล้ว · ตัดสิทธิ์แล้ว"** with the number, time and officer, or green **"ยังไม่ได้เช็ค · ใช้สิทธิ์ได้"** with an optional "เช็คชื่อตอนนี้" button that does the normal check-in and offers the gift.

## Files
`index.html`, `app.js` (its own Client ID constant `CLIENT`, or `window.QRCHECK_AUTH0_CLIENT_ID`), `style.css`; camera scanning uses `html5-qrcode` from unpkg.
