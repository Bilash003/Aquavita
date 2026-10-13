CREATE TABLE IF NOT EXISTS locations (
 id TEXT PRIMARY KEY,
 name TEXT NOT NULL,
 kind TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS sources (
 code TEXT PRIMARY KEY,
 location_id TEXT NOT NULL REFERENCES locations(id)
);
CREATE TABLE IF NOT EXISTS reports (
 id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
 source_code TEXT NOT NULL REFERENCES sources(code),
 sampled_at DATE NOT NULL,
 laboratory TEXT NOT NULL DEFAULT '',
 coliform_status TEXT NOT NULL DEFAULT 'not_tested' CHECK (coliform_status IN ('detected','not_detected','not_tested')),
 ph NUMERIC CHECK(ph BETWEEN 0 AND 14),
 tds NUMERIC CHECK(tds >= 0),
 turbidity NUMERIC CHECK(turbidity >= 0),
 photo_url TEXT,
 notes TEXT NOT NULL DEFAULT '',
 published_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS reports_source_date ON reports(source_code,sampled_at DESC);

-- Add report presentation fields for new and existing installations.
-- No screening outcome or test date is inferred from previous coliform data.
ALTER TABLE reports ADD COLUMN IF NOT EXISTS screening_status TEXT NOT NULL DEFAULT 'pending'
 CHECK (screening_status IN ('no_growth','growth_detected','pending','retest_recommended'));
ALTER TABLE reports ADD COLUMN IF NOT EXISTS tested_at DATE;
ALTER TABLE reports ADD COLUMN IF NOT EXISTS next_screening_at DATE;
ALTER TABLE reports ALTER COLUMN sampled_at DROP NOT NULL;

ALTER TABLE locations ADD COLUMN IF NOT EXISTS name_bn TEXT NOT NULL DEFAULT '';
ALTER TABLE locations ADD COLUMN IF NOT EXISTS sort_order INTEGER NOT NULL DEFAULT 0;
ALTER TABLE locations ADD COLUMN IF NOT EXISTS revision INTEGER NOT NULL DEFAULT 1;
ALTER TABLE sources ADD COLUMN IF NOT EXISTS label TEXT NOT NULL DEFAULT '';
ALTER TABLE sources ADD COLUMN IF NOT EXISTS label_bn TEXT NOT NULL DEFAULT '';
ALTER TABLE sources ADD COLUMN IF NOT EXISTS sort_order INTEGER NOT NULL DEFAULT 0;
ALTER TABLE sources ADD COLUMN IF NOT EXISTS revision INTEGER NOT NULL DEFAULT 1;
ALTER TABLE reports ADD COLUMN IF NOT EXISTS laboratory_bn TEXT NOT NULL DEFAULT '';
ALTER TABLE reports ADD COLUMN IF NOT EXISTS notes_bn TEXT NOT NULL DEFAULT '';
ALTER TABLE reports ADD COLUMN IF NOT EXISTS is_published BOOLEAN NOT NULL DEFAULT TRUE;
ALTER TABLE reports ADD COLUMN IF NOT EXISTS revision INTEGER NOT NULL DEFAULT 1;
ALTER TABLE reports DROP CONSTRAINT IF EXISTS reports_source_code_fkey;
ALTER TABLE reports ADD CONSTRAINT reports_source_code_fkey FOREIGN KEY (source_code)
 REFERENCES sources(code) ON UPDATE CASCADE ON DELETE RESTRICT;
CREATE TABLE IF NOT EXISTS site_settings (
 id INTEGER PRIMARY KEY CHECK(id=1),
 data JSONB NOT NULL DEFAULT '{}',
 revision INTEGER NOT NULL DEFAULT 1
);
INSERT INTO site_settings(id) VALUES(1) ON CONFLICT DO NOTHING;
CREATE TABLE IF NOT EXISTS admins (
 uid TEXT PRIMARY KEY,
 email TEXT NOT NULL,
 created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE TABLE IF NOT EXISTS media (
 id UUID PRIMARY KEY,
 filename TEXT NOT NULL,
 mime_type TEXT NOT NULL,
 bytes BYTEA NOT NULL,
 size INTEGER NOT NULL CHECK (size>0 AND size<=5242880),
 created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE TABLE IF NOT EXISTS audit_log (
 id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
 actor_uid TEXT NOT NULL,
 actor_email TEXT NOT NULL DEFAULT '',
 action TEXT NOT NULL,
 entity TEXT NOT NULL,
 entity_id TEXT NOT NULL,
 created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS problem_reports (
 id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
 reporter_name TEXT NOT NULL,
 reporter_id TEXT NOT NULL,
 location_or_source TEXT NOT NULL,
 problem_type TEXT NOT NULL CHECK (problem_type IN ('unusual_colour','odour','visible_particles','suspected_contamination')),
 description TEXT NOT NULL DEFAULT '',
 status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','verified','rejected')),
 created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
 verified_at TIMESTAMPTZ,
 verified_by TEXT DEFAULT ''
);
CREATE INDEX IF NOT EXISTS problem_reports_status_idx ON problem_reports(status, created_at DESC);
