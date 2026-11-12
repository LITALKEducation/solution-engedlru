-- Department heads (หัวหน้าฝ่าย), shown on the student page and editable by camp admins.
ALTER TABLE camp_departments ADD COLUMN head_name TEXT;
ALTER TABLE camp_departments ADD COLUMN head_contact TEXT;
