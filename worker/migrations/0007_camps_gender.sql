-- Gender-aware quotas for Camps / ฝ่ายบุคคล.
-- 0006 was already applied in production without gender, so this migration upgrades those tables in place
-- (never edit an applied migration: wrangler tracks them by file name only).

-- 1. Students: add gender (nullable for existing rows), guess it from the Thai title in the name where possible.
ALTER TABLE camp_students ADD COLUMN gender TEXT CHECK (gender IN ('M', 'F'));
UPDATE camp_students SET gender = CASE
  WHEN name LIKE 'นาย%' OR name LIKE 'เด็กชาย%' THEN 'M'
  WHEN name LIKE 'นางสาว%' OR name LIKE 'นาง%' OR name LIKE 'เด็กหญิง%' THEN 'F'
  ELSE NULL END;

-- 2. Selections: copy the student's gender (still NULL when unknown; admins fill it in on the students page).
ALTER TABLE camp_selections ADD COLUMN gender TEXT;
UPDATE camp_selections SET gender = (SELECT s.gender FROM camp_students s WHERE s.student_id = camp_selections.student_id);
CREATE INDEX IF NOT EXISTS idx_camp_selections_slot ON camp_selections(department_code, gender, year);

-- 3. Quotas: rebuild with gender in the key. The old per-year number is copied to BOTH genders so nothing is lost;
--    admins should review the numbers (they now mean "per gender").
CREATE TABLE camp_quotas_v2 (
  department_code TEXT NOT NULL,
  gender TEXT NOT NULL CHECK (gender IN ('M', 'F')),
  year INTEGER NOT NULL CHECK (year BETWEEN 1 AND 4),
  quota INTEGER NOT NULL DEFAULT 0 CHECK (quota >= 0),
  PRIMARY KEY (department_code, gender, year)
);
INSERT INTO camp_quotas_v2 (department_code, gender, year, quota)
  SELECT q.department_code, g.gender, q.year, q.quota FROM camp_quotas q CROSS JOIN (SELECT 'M' AS gender UNION ALL SELECT 'F') g;
DROP TABLE camp_quotas;
ALTER TABLE camp_quotas_v2 RENAME TO camp_quotas;

-- 4. Capacity semantics changed: if registration was open, close it until an admin has reviewed quotas and genders.
UPDATE camp_settings SET value = 'closed' WHERE key = 'registration_state' AND value = 'open';
