-- Migration: อนุญาต lat/lng เป็น NULL ใน checkup_logs (QR check-in ไม่มีพิกัด GPS)
-- SQLite ไม่รองรับ ALTER COLUMN DROP NOT NULL ตรง ๆ ต้องสร้างตารางใหม่แล้วย้ายข้อมูล

CREATE TABLE checkup_logs_new (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  created_at  TEXT NOT NULL DEFAULT (datetime('now')),
  student_id  TEXT NOT NULL,
  name        TEXT NOT NULL,
  lat         REAL,
  lng         REAL,
  distance    INTEGER,
  map_link    TEXT,
  schedule_id INTEGER,
  method      TEXT NOT NULL DEFAULT 'gps'
);

INSERT INTO checkup_logs_new (id, created_at, student_id, name, lat, lng, distance, map_link, schedule_id, method)
  SELECT id, created_at, student_id, name, lat, lng, distance, map_link, schedule_id, method FROM checkup_logs;

DROP TABLE checkup_logs;
ALTER TABLE checkup_logs_new RENAME TO checkup_logs;
