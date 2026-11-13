# Camps · ระบบเช็ค QR (`/qrcheck/`)

A formal, plain tool for checking a student's QR code against the data the other Camps systems already hold, and recording the result of each check. It is **separate from the lottery system** (`/lotto/`): own page, own Auth0 application and callback (`https://enged.sorasukt.com/qrcheck/`), own tables. The two share the student data model (QR = student id) but not their results.

## What it does
1. **Choose the check** (admin-defined), e.g. *ตรวจครั้งที่ 1* or *ตรวจสอบป้ายกับ AKA*.
2. **Scan the QR** with the camera or type the student id (Thai digits and `sb<id>@lru.ac.th` are accepted).
3. **Check the data and record the result.** The page shows what the registration database says: name, year, gender and the **department** the student chose in the HR system (`camp_students`, `camp_selections`, `camp_departments`), plus the Auth0 photo when there is one. A QR that is not in that database shows a red "ไม่พบในฐานข้อมูลลงทะเบียน". The officer then records **ผ่าน** or **ไม่ผ่าน** (a reason is required for ไม่ผ่าน).

Rules: one result per student per check; once recorded an officer cannot record it again (the page shows who and when); only an admin can correct it (the edit keeps who/when). A check can require that the student has already chosen a department (default). The student's history of other checks is listed under the result.

### AKA (future system)
AKA is not connected yet. The check type **"เทียบป้ายกับ AKA"** adds a field for the **badge code**; officers compare the badge by hand today and the code is stored (`camp_qr_results.reference`, searchable and in the Excel export) so it can be matched automatically when AKA is connected.

## Who can use it
- **Admins** (`camp_admin` / `budget_admin`): everything, including the tabs below.
- **Officers**: accounts with a verified email that an admin added under *ตั้งค่า → เจ้าหน้าที่ผู้ตรวจ* (`camp_qr_officers`). They only see the *ตรวจ QR* tab. This list is independent from the lottery scanners.

## Tabs
| Tab | For | Content |
|---|---|---|
| ตรวจ QR | everyone | the three steps above |
| ผลการตรวจ | admins | summary per check (checked / passed / failed / still to check among registered students), filterable result list (check, result, name / id / badge code), **Excel export** |
| ตั้งค่า | admins | add / rename / reorder / deactivate / delete checks (a check with results can only be deactivated), manage officers |

## API (`/camps/qrcheck/*`, Worker handler `handlers/qrcheck.js`, migration `0011_camps_qrcheck.sql`)
`GET me` · `GET checks` (`?all=1` for admins) · `POST lookup` (read-only) · `POST record` · admin: `GET|POST admin/checks`, `PATCH|DELETE admin/checks/:id`, `GET admin/results`, `GET|POST admin/officers`, `DELETE admin/officers/:email`. Every write is audited in `budget_audit_logs` (`entity_type = qrcheck`). The migration seeds the two example checks; admins can rename or remove them.

## Files
`index.html`, `app.js` (its own Client ID constant `CLIENT`, or `window.QRCHECK_AUTH0_CLIENT_ID`), `style.css`, `vendor/xlsx.mini.min.js` (Excel export, loaded on demand). Camera scanning uses `html5-qrcode` from unpkg.
