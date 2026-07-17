# engedlru-api (Cloudflare Worker)

Backend ใหม่สำหรับโปรเจกต์ ENGEDLRU แทนที่ Google Apps Script + Google Sheets เดิม
ใช้ **Cloudflare Workers** เป็น API, **D1** เป็นฐานข้อมูล และ **R2** เก็บไฟล์แนบ (ใบเสร็จงบประมาณ, รูปโปรไฟล์)

## โครงสร้าง

| Endpoint | Method | แทนที่ระบบเดิม |
|---|---|---|
| `/checkup/schedule` | GET | checkup.gs `doGet` (ตาราง Time Table) |
| `/checkup/checkin` | POST | checkup.gs `doPost` (บันทึกเช็คชื่อ GPS) |
| `/tokens?action=getActivities` | GET | ระบบค้นหา Token — รายการกิจกรรม |
| `/tokens?action=search&id=&criteria=` | GET | ระบบค้นหา Token — ค้นหารหัส/Token |
| `/budget` | POST | ระบบบันทึกงบประมาณ + อัปโหลดไฟล์ |
| `/profile` | POST | auth0_m2m.gs (อัปเดตชื่อ/รูปโปรไฟล์ Auth0) |
| `/files/:key` | GET | เสิร์ฟไฟล์จาก R2 (แทนลิงก์ Google Drive) |
| `/checkup/qr` | POST | นักศึกษาขอรหัส QR เช็คชื่อ (ใช้ครั้งเดียว, อายุ 5 นาที) |
| `/admin/me` | GET | เช็คสถานะแอดมินของผู้ล็อกอิน (ไม่ต้องเป็นแอดมิน) |
| `/admin/checkup/schedule` | GET/POST | ดู/เพิ่มกิจกรรมเช็คชื่อ + พิกัด |
| `/admin/checkup/schedule/:id` | PUT/DELETE | แก้ไข/ลบกิจกรรม |
| `/admin/checkup/logs?scheduleId=` | GET | รายชื่อเช็คชื่อ กรองตามกิจกรรม |
| `/admin/checkup/qr/scan` | POST | แอดมินแสกน/กรอกรหัส QR เพื่อบันทึกเช็คชื่อ |
| `/admin/tokens/template.csv` | GET | ดาวน์โหลดเทมเพลต CSV สำหรับ Token Key |
| `/admin/tokens/import` | POST | นำเข้ารายชื่อ/รหัสกิจกรรมจาก CSV |
| `/admin/admins` | GET/POST | ดู/เพิ่มอีเมลแอดมิน |
| `/admin/admins/:email` | DELETE | ลบสิทธิ์แอดมิน |

เส้นทาง `/admin/*` (ยกเว้น `/admin/me`) ต้องส่ง header `Authorization: Bearer <auth0_access_token>`
และอีเมลของผู้ใช้ต้องอยู่ในตาราง `admin_users` (seed เริ่มต้น: `sb6740102220@lru.ac.th`)

## ขั้นตอน Deploy

### 1. ติดตั้งและ Login

```bash
cd worker
npm install
npx wrangler login
```

### 2. สร้าง D1 database

```bash
npx wrangler d1 create engedlru-db
```

นำ `database_id` ที่ได้ไปแทนที่ `REPLACE_WITH_D1_DATABASE_ID` ใน `wrangler.toml`

รัน schema (ต้องรันสองไฟล์ตามลำดับ — `schema.sql` ก่อน แล้วตามด้วย `schema-admin.sql`
ซึ่งเพิ่มตาราง/คอลัมน์สำหรับ Admin Dashboard):

```bash
npm run db:migrate:remote
npx wrangler d1 execute engedlru-db --remote --file=./schema-admin.sql
npx wrangler d1 execute engedlru-db --remote --file=./schema-admin2.sql
```

(`schema-admin2.sql` แก้ให้ `checkup_logs.lat/lng` เป็น NULL ได้ — จำเป็นสำหรับการเช็คชื่อผ่าน QR ที่ไม่มีพิกัด GPS)

### 3. สร้าง R2 bucket

```bash
npx wrangler r2 bucket create engedlru-files
```

### 4. ตั้งค่า Secrets (Auth0 M2M — ห้ามใส่ในไฟล์ wrangler.toml)

```bash
npx wrangler secret put AUTH0_M2M_CLIENT_ID
npx wrangler secret put AUTH0_M2M_CLIENT_SECRET
```

ค่าเหล่านี้มาจาก Auth0 Application ประเภท **Machine to Machine** ที่ได้รับสิทธิ์ `update:users`
บน Auth0 Management API (เดิมตั้งค่าไว้ใน `api/auth0_m2m.gs`)

### 5. ตรวจสอบตัวแปรใน `wrangler.toml`

- `ALLOWED_ORIGINS` — origin ของหน้าเว็บที่อนุญาตให้เรียก API (CORS)
- `AUTH0_DOMAIN` — ต้องตรงกับ `JavaScript/auth.js`
- `BUDGET_ALLOWED_EMAILS` — อีเมลที่มีสิทธิ์บันทึกงบประมาณ (คั่นด้วยจุลภาคถ้ามีหลายคน)

### 6. Deploy

```bash
npm run deploy
```

Wrangler จะแสดง URL ของ Worker เช่น `https://engedlru-api.<subdomain>.workers.dev`
นำ URL นี้ไปแทนที่ค่าใน `JavaScript/apiConfig.js` (`API_BASE_URL`)

หากต้องการ custom domain (เช่น `api.solution.litalkeducation.com`) ให้ตั้งค่า Route ใน
Cloudflare Dashboard → Workers & Pages → engedlru-api → Settings → Domains & Routes

## ย้ายข้อมูลจาก Google Sheets

ต้อง export ข้อมูลจาก Google Sheets เป็น CSV แล้วแปลงเป็น SQL `INSERT` ก่อนรันเข้า D1:

- **checkup_schedule** ← Sheet "Time Table" (name, open date+time, close date+time)
- **checkup_students** ← Sheet "รายชื่อ" (รหัสนักศึกษา, ชื่อ)
- **checkup_logs** ← Sheet "system" (ประวัติเช็คชื่อเดิม ถ้าต้องการเก็บย้อนหลัง)
- **token_activities** / **token_records** ← Sheet ของระบบค้นหา Token (ไม่มี source `.gs` ในโปรเจกต์
  ต้องตรวจ Sheet จริงเพื่อ map คอลัมน์ให้ตรง: ชื่อกิจกรรม, รหัสนักศึกษา, ชื่อ-กลุ่ม, code, token)
- **budget_entries** ← Sheet ของระบบงบประมาณ (ไฟล์แนบเดิมที่อยู่ใน Google Drive ต้องดาวน์โหลดแล้ว
  อัปโหลดเข้า R2 bucket ใหม่ด้วย `wrangler r2 object put`, แล้วอัปเดตคอลัมน์ `file_key`)

ตัวอย่างการรัน SQL ไฟล์ migrate ข้อมูลที่แปลงแล้ว:

```bash
npx wrangler d1 execute engedlru-db --remote --file=./data-migration.sql
```

## พัฒนา/ทดสอบ Local

```bash
npm run db:migrate:local
npm run dev
```

แล้วตั้งค่า `API_BASE_URL` ใน `JavaScript/apiConfig.js` ชั่วคราวเป็น `http://127.0.0.1:8787` เพื่อทดสอบ
