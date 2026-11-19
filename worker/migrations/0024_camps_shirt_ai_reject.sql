-- Camp shirt: a design an admin (or the AI check, on a re-check) rejects as AI-generated. A rejected design is also hidden (out of the gallery, its votes returned);
-- the student sees the reason when they come back and can only take part again with a new picture (or when an admin lifts it).
ALTER TABLE camp_shirt_designs ADD COLUMN ai_rejected INTEGER NOT NULL DEFAULT 0;
ALTER TABLE camp_shirt_designs ADD COLUMN reject_note TEXT NOT NULL DEFAULT '';
ALTER TABLE camp_shirt_designs ADD COLUMN rejected_at INTEGER;
