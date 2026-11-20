# Camps · ระบบเช็ก QR (`/qrcheck/`)

A formal, plain tool for checking a student's QR code against the data the other Camps systems already hold, and recording the result of each check. It is **separate from the lottery system** (`/lotto/`): own page, own Auth0 application and callback (`https://enged.sorasukt.com/qrcheck/`), own tables. The two share the student data model (QR = student id) but not their results.

## What it does
1. **Choose the check** (admin-defined), e.g. *ตรวจครั้งที่ 1* or *ตรวจสอบป้ายกับ AKA*.
2. **Scan the QR** with the camera or type the student id (Thai digits and `sb<id>@lru.ac.th` are accepted).
3. **The scan itself records the check.** The student is looked up in the registration database — name, year, gender and the **department** chosen in the HR system (`camp_students`, `camp_selections`, `camp_departments`), plus the Auth0 photo when there is one — and, if found, the page immediately shows a large green **"ตรวจแล้ว"** and saves it (who, when) for the chosen check (`POST /camps/qrcheck/scan`). No extra button.

| Scan of … | Shown | Saved |
|---|---|---|
| a student not checked yet | green **ตรวจแล้ว** | yes (result "ผ่าน", checked by the officer) |
| a student already checked for this check | amber **ตรวจแล้ว (บันทึกไว้ก่อนหน้านี้)** with who / when | no, nothing changes |
| a student who has not chosen a department, when the check requires it (default) | red **บันทึกไม่ได้** | no |
| a QR that is not in the registration database | red **ไม่พบในฐานข้อมูลลงทะเบียน** | no |
| something that is not a student QR | red "ตรวจสอบไม่ได้" with the reason | no |

Switching the check while a student is on screen only *looks* (read-only) and offers **บันทึกว่าตรวจแล้ว**, so changing the dropdown never records by accident.

**Optional follow-up on a recorded check** (folded away, opens by itself for AKA checks without a badge code): a **note**, the **AKA badge code**, or changing the result to **ไม่ผ่าน** (a reason is required) / back to ผ่าน. Allowed for the officer who recorded it and for admins; the edit keeps who/when. One result per student per check; the student's history of other checks is listed under the result.

### AKA
The check type **"เทียบป้ายกับ AKA"** shows the student's **AKA and nickname from the AKA system** (`/aka/`, table `camp_aka`) in a highlighted box, so the officer compares the badge the student wears with the name they chose. If the student has not named themselves yet the box says so. Whatever the badge actually shows can be typed into **ข้อความบนป้าย** (stored in `camp_qr_results.reference`, searchable, in the Excel export). The AKA lookup is optional: without the AKA table the page still works.

## Who can use it
- **Admins** (`camp_admin` / `budget_admin`): everything, including the tabs below.
- **Officers**: accounts with a verified email that an admin added under *ตั้งค่า → เจ้าหน้าที่ผู้ตรวจ* (`camp_qr_officers`). They only see the *ตรวจ QR* tab. This list is independent from the lottery scanners.

## The scan page (officers and admins)
- **Round chip:** the round being checked is a big chip above the camera. It is chosen again every day (yesterday's choice is never reused silently); until it is chosen, scans are refused with a shake + message. With a single active check it is selected for you.
- **Camera always on:** it starts by itself, a scan only pauses the picture behind the pop-up, closing the pop-up resumes scanning. Buttons: *ปิดกล้อง*, *ไฟฉาย* and *สลับกล้อง* (only when the phone has them), *เสียง* (a short tone: pass, warning, problem). If the camera cannot open, a persistent box explains how to allow it, with a retry button. The same QR held in front of the camera is ignored for 3 s.
- **Fast pop-up:** a successful scan closes its own pop-up after 2.5 s (a bar counts down; touching the pop-up keeps it open). Problems (not passed, not found, blocked, already checked) and AKA checks (which may need a badge code) stay until closed.
- **Undo:** *ยกเลิกการตรวจ* in the pop-up removes a wrong scan (the officer who made it, or an admin; logged as `QR_CHECK_UNDO`). The same button is there when a name is opened from the recent list.
- **Progress:** "ตรวจแล้ว N / total" for the round, how many *you* checked, and the latest scans (tap one to open it).
- **No signal:** scans made offline wait on the phone (`localStorage`), a banner shows how many, and they are sent when the signal is back (original time kept in the audit log as `queuedAt`); anything the server then refuses is listed. The page itself must already be open (it is not cached for a cold start offline).
- Results, rounds and officers are managed in the admin page (`/admin/#qr`); the scan page links to it for admins.

## API (`/camps/qrcheck/*`, Worker handler `handlers/qrcheck.js`, migration `0011_camps_qrcheck.sql`)
`GET me` · `GET checks` (`?all=1` for admins) · `POST scan` (look up + record) · `POST lookup` (read-only) · `POST record` (add a note / badge code, change the result) · `POST undo` · `GET stats?checkId=` · admin: `GET|POST admin/checks`, `PATCH|DELETE admin/checks/:id`, `GET admin/results`, `GET|POST admin/officers`, `DELETE admin/officers/:email`. Every write is audited in `budget_audit_logs` (`entity_type = qrcheck`). The migration seeds the two example checks; admins can rename or remove them.

## Files
`index.html`, `app.js` (its own Client ID constant `CLIENT`, or `window.QRCHECK_AUTH0_CLIENT_ID`), `style.css`. Camera scanning uses `html5-qrcode` from unpkg.

**Camera always on:** the camera starts by itself when the scan tab opens. A scan only pauses the picture behind the result pop-up; closing the pop-up resumes scanning (no need to press anything). It is turned off only by the "ปิดกล้อง" button, and it restarts when the page comes back to the foreground.
