-- Camp shirt: AI-generated image check. Every new upload is assessed (embedded generator tags reported by the browser + an optional detection service)
-- and the result is stored for the admins. It never blocks an upload; admins review flagged designs.
--   ai_level: '' (not checked) | 'none' | 'review' (possible) | 'likely';  ai_score: 0..1 from the detection service or NULL;  ai_signals: JSON array of short keys
ALTER TABLE camp_shirt_designs ADD COLUMN ai_level TEXT NOT NULL DEFAULT '';
ALTER TABLE camp_shirt_designs ADD COLUMN ai_score REAL;
ALTER TABLE camp_shirt_designs ADD COLUMN ai_signals TEXT NOT NULL DEFAULT '[]';
