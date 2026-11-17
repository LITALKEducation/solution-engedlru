-- 13-digit national ID (เลขบัตรประชาชน) of each student, shown only to the student on their own profile page (/hr/) and to admins.
ALTER TABLE camp_students ADD COLUMN national_id TEXT;
