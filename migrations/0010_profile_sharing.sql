-- Opt-in profile visibility: show the resume's summary, experience, education, projects and skills on the public
-- profile (never contact details), and an "Open to work" badge next to the name. Both off until the member turns them on.
ALTER TABLE users ADD COLUMN resume_public INTEGER NOT NULL DEFAULT 0;
ALTER TABLE users ADD COLUMN open_to_work  INTEGER NOT NULL DEFAULT 0;

-- "People you may know" entries a member dismissed stay hidden from their suggestions
CREATE TABLE suggestion_dismissals (
  user_id    TEXT NOT NULL REFERENCES users(id),
  peer_id    TEXT NOT NULL REFERENCES users(id),
  created_at INTEGER NOT NULL,
  PRIMARY KEY (user_id, peer_id)
) WITHOUT ROWID;
