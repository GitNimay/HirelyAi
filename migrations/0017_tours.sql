-- Product tours a member has finished or skipped. A tour shows until its id has a row here; to show a
-- redesigned tour again, give it a new id ("welcome-2"), and new-feature tours just get their own id.
CREATE TABLE user_tours (
  user_id  TEXT NOT NULL,
  tour_id  TEXT NOT NULL,
  skipped  INTEGER NOT NULL DEFAULT 0,
  done_at  INTEGER NOT NULL,           -- epoch ms
  PRIMARY KEY (user_id, tour_id)
);

-- The welcome tour is for new members: everyone already onboarded counts as having seen it
INSERT INTO user_tours (user_id, tour_id, skipped, done_at)
  SELECT user_id, 'welcome', 1, CAST(unixepoch('subsec') * 1000 AS INTEGER) FROM resumes;
