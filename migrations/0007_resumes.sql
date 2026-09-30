-- A member's structured resume, filled at onboarding (from an uploaded PDF or by hand) and editable from their profile.
-- Name, city and headline live on users (one source of truth for the profile); everything else is this JSON (see lib/resume-fields.ts).
-- Having a row = onboarding done.
CREATE TABLE resumes (
  user_id    TEXT PRIMARY KEY REFERENCES users(id),
  data       TEXT NOT NULL,
  updated_at INTEGER NOT NULL
) WITHOUT ROWID;
