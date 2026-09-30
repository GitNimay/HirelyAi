-- Profile fields. name / image_url / headline already exist; image_url now also holds "/api/media/<key>" for uploaded avatars.
ALTER TABLE users ADD COLUMN handle    TEXT;    -- public URL slug: /in/<handle>. Assigned lazily by the app on first sync.
ALTER TABLE users ADD COLUMN bio       TEXT;
ALTER TABLE users ADD COLUMN location  TEXT;
ALTER TABLE users ADD COLUMN website   TEXT;
ALTER TABLE users ADD COLUMN cover_key TEXT;    -- R2 key of the cover image
ALTER TABLE users ADD COLUMN joined_at INTEGER; -- Clerk sign-up time, epoch ms
-- Set once the member edits their profile here: from then on D1 is the source of truth and Clerk no longer overwrites name/photo/headline
ALTER TABLE users ADD COLUMN custom    INTEGER NOT NULL DEFAULT 0;

-- NULLs (not assigned yet) don't collide
CREATE UNIQUE INDEX users_handle ON users(handle);
