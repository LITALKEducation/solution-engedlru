-- Extra personal details a student fills in on /hr/ (ข้อมูลของฉัน): English full name, birth date (ISO yyyy-mm-dd), own and guardian phone numbers.
ALTER TABLE camp_students ADD COLUMN name_en TEXT;
ALTER TABLE camp_students ADD COLUMN birth_date TEXT;
ALTER TABLE camp_students ADD COLUMN phone TEXT;
ALTER TABLE camp_students ADD COLUMN guardian_phone TEXT;
