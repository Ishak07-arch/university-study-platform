-- Additive, idempotent Phase 2.1 migration. Legacy printable resources are unchanged.
ALTER TABLE resources ADD COLUMN IF NOT EXISTS managed boolean NOT NULL DEFAULT false;
ALTER TABLE resources ADD COLUMN IF NOT EXISTS published boolean NOT NULL DEFAULT false;
ALTER TABLE resources ADD COLUMN IF NOT EXISTS archived boolean NOT NULL DEFAULT false;
ALTER TABLE resources ADD COLUMN IF NOT EXISTS filename text;
ALTER TABLE resources ADD COLUMN IF NOT EXISTS mime_type text;
ALTER TABLE resources ADD COLUMN IF NOT EXISTS file_bytes bytea;
ALTER TABLE resources ADD COLUMN IF NOT EXISTS byte_size integer;
ALTER TABLE resources ADD COLUMN IF NOT EXISTS sha256 text;
ALTER TABLE resources ADD COLUMN IF NOT EXISTS ingestion_status text NOT NULL DEFAULT 'pending';
ALTER TABLE resources ADD COLUMN IF NOT EXISTS ingestion_error text;
ALTER TABLE resources ADD COLUMN IF NOT EXISTS page_count integer;
ALTER TABLE resources ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();
CREATE TABLE IF NOT EXISTS resource_chunks (
 id text PRIMARY KEY, resource_id text NOT NULL REFERENCES resources(id) ON DELETE CASCADE,
 ordinal integer NOT NULL, page_number integer, content text NOT NULL,
 UNIQUE(resource_id,ordinal)
);
CREATE INDEX IF NOT EXISTS resource_chunks_search ON resource_chunks USING gin(to_tsvector('english',content));
CREATE INDEX IF NOT EXISTS resources_lesson_published ON resources(lesson_id,published) WHERE managed=true;
