-- Camp shirt, part 2: a design carries the designer's name and class group (หมู่เรียน), and the admins upload the SAMPLE SHIRT (the blank shirt the designs are
-- shown on) once; its picture lives in R2 and its key / print area in camp_settings (shirt_sample_key, shirt_sample_mime, shirt_sample_area, shirt_sample_v).
ALTER TABLE camp_shirt_designs ADD COLUMN designer_name TEXT NOT NULL DEFAULT '';
ALTER TABLE camp_shirt_designs ADD COLUMN class_group TEXT NOT NULL DEFAULT '';
UPDATE camp_shirt_designs SET designer_name = COALESCE((SELECT s.name FROM camp_students s WHERE s.student_id = camp_shirt_designs.student_id), '');
