-- Admin overrides for the link preview (Open Graph) of each Camps page. A NULL column means "use the default" (src/lib/og-pages.js).
-- The image is stored in R2 (key in image_key); the default images are static files in camps/assets/og/.
CREATE TABLE IF NOT EXISTS camp_og_pages (
  page TEXT PRIMARY KEY,
  title TEXT,
  description TEXT,
  image_key TEXT,
  image_mime TEXT,
  updated_by TEXT,
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
