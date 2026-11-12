# Camps Lotto · ระบบจัดการการจับสลาก

หน้าเว็บอยู่ที่ `/camps/lotto/` และ API อยู่ภายใต้ `/camps/lotto/*` ใน Cloudflare Worker `engedlru-api`

## ความสามารถ

- ผู้ดูแลจัดการรหัสนักศึกษา ชื่อ และเลขจับสลากรายบุคคล
- นำเข้ารายชื่อจำนวนมากจาก CSV: `รหัสนักศึกษา,ชื่อ-นามสกุล,เลขจับสลาก`
- สร้าง QR Code จากรหัสนักศึกษาเพื่อพิมพ์/นำไปแสดง
- ผู้ดูแลกำหนดอีเมลเจ้าหน้าที่ที่มีสิทธิ์สแกนได้จากเมนู “เจ้าหน้าที่สแกน”
- เจ้าหน้าที่สแกนผ่านกล้องมือถือหรือกรอกรหัสด้วยตนเอง
- บันทึกเวลาที่ตัดสิทธิ์และอีเมลเจ้าหน้าที่ การสแกนซ้ำไม่สามารถตัดสิทธิ์ซ้ำได้
- หน้าตรวจสอบแสดงสถานะและประวัติการตัดสิทธิ์ของแต่ละคน

## สิทธิ์การใช้งาน

- ผู้จัดการระบบ: Auth0 Role `camp_admin` หรือ `budget_admin`
- เจ้าหน้าที่สแกน: บัญชี Auth0 ที่ผู้จัดการเพิ่มอีเมลไว้ใน `camp_lotto_scanners`
- เจ้าหน้าที่ต้องเข้าสู่ระบบด้วยบัญชีที่ยืนยันอีเมลแล้ว

## ติดตั้งฐานข้อมูล

เพิ่ม migration ที่ `worker/migrations/0007_camps_lotto.sql` แล้วรันจากโฟลเดอร์ `worker`:

```bash
npx wrangler d1 migrations apply engedlru-db --remote
```

จากนั้น deploy Worker ตาม workflow ปกติ:

```bash
npm run deploy
```

ไม่ต้องสร้าง D1 database หรือ Worker ใหม่ ระบบใช้ binding `DB` และ Auth0 configuration ที่มีอยู่

## API

| Method | Endpoint | สิทธิ์ |
|---|---|---|
| GET | `/camps/lotto/scanner/me` | ผู้ดูแลหรือเจ้าหน้าที่ที่ได้รับมอบหมาย |
| GET | `/camps/lotto/scanner/lookup?q=` | ผู้ดูแลหรือเจ้าหน้าที่ที่ได้รับมอบหมาย |
| POST | `/camps/lotto/admin/scan` | ผู้ดูแลหรือเจ้าหน้าที่ที่ได้รับมอบหมาย |
| GET | `/camps/lotto/admin/overview` | ผู้ดูแล |
| GET | `/camps/lotto/admin/students?q=` | ผู้ดูแล |
| POST | `/camps/lotto/admin/students` | ผู้ดูแล |
| POST | `/camps/lotto/admin/students/import` | ผู้ดูแล |
| DELETE | `/camps/lotto/admin/students/:studentId` | ผู้ดูแล |
| GET/POST | `/camps/lotto/admin/scanners` | ผู้ดูแล |
| DELETE | `/camps/lotto/admin/scanners/:email` | ผู้ดูแล |

## ข้อควรทราบ

- เลขจับสลากไม่ซ้ำกันในชุดข้อมูลนี้
- รหัสนักศึกษาเป็น Primary Key และ QR Code เก็บเพียงรหัสนักศึกษา ไม่ฝังข้อมูลส่วนบุคคล
- เมื่อถูกตัดสิทธิ์แล้ว จะไม่สามารถลบรายชื่อนั้นผ่านหน้าเว็บได้ เพื่อรักษาความถูกต้องของผลการตรวจสอบ
- การบันทึกใช้ SQL conditional update (`checked_at IS NULL`) เพื่อป้องกันการสแกนพร้อมกันแล้วบันทึกซ้ำ

## Scan popup (ตัวเลขใหญ่ + รูปจาก Auth0)
After every scan a popup shows the **draw number in huge type**, the student's name and their **Auth0 profile photo** (green = checked in, amber = already scanned with time and officer, red = error). "สแกนคนต่อไป" (or Enter / Esc / tapping outside) closes it and re-opens the camera when the scan came from the camera.

The photo is looked up by the university email `sb<student id>@lru.ac.th` with the Auth0 Management API (`GET /api/v2/users-by-email`). The M2M application used by the Worker therefore needs the **`read:users`** scope. A student who has never signed in (no Auth0 user) or a lookup failure just shows the student's initial; scanning is never blocked or slowed more than 2.5 s by it.
