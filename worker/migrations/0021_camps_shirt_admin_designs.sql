-- Camp shirt designs are uploaded by the admins on behalf of the designers, so a design carries the designer's name and class group (หมู่เรียน)
-- instead of being tied to one student. SQLite cannot drop the old UNIQUE(student_id) / NOT NULL in place, so the table is rebuilt (votes keep pointing at the same ids).
CREATE TABLE camp_shirt_designs_v2 (
  id TEXT PRIMARY KEY,
  designer_name TEXT NOT NULL DEFAULT '',
  class_group TEXT NOT NULL DEFAULT '',
  title TEXT NOT NULL DEFAULT '',
  description TEXT NOT NULL DEFAULT '',
  image_key TEXT NOT NULL,
  image_mime TEXT NOT NULL,
  hidden INTEGER NOT NULL DEFAULT 0,
  created_by TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
INSERT INTO camp_shirt_designs_v2 (id,designer_name,class_group,title,description,image_key,image_mime,hidden,created_by,created_at,updated_at)
  SELECT d.id, COALESCE((SELECT s.name FROM camp_students s WHERE s.student_id=d.student_id), ''), '', d.title, d.description, d.image_key, d.image_mime, d.hidden, d.student_id, d.created_at, d.updated_at
  FROM camp_shirt_designs d;
DROP TABLE camp_shirt_designs;
ALTER TABLE camp_shirt_designs_v2 RENAME TO camp_shirt_designs;
