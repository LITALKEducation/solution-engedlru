-- Lottery gift: opened once, after the student has been checked in (who opened it and when).
ALTER TABLE camp_lotto_students ADD COLUMN gift_opened_at TEXT;
ALTER TABLE camp_lotto_students ADD COLUMN gift_opened_by TEXT;
