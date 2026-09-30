-- Badge = notifications newer than this ("seen": opening the page). Each one stays "unread" until clicked.
ALTER TABLE users ADD COLUMN notif_seen_at INTEGER NOT NULL DEFAULT 0;

-- One row per (recipient, type, ref). Repeat activity (more likes, more applicants) adds an actor to the same row
-- instead of a new one, so the list shows "Ada, Bo and 3 others liked your post" like LinkedIn and X.
CREATE TABLE notifications (
  id         TEXT PRIMARY KEY,
  user_id    TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  type       TEXT NOT NULL,
  ref_id     TEXT NOT NULL,             -- what it is about: post id, job id, comment id, "" for follows
  link       TEXT NOT NULL,             -- where clicking it goes
  body       TEXT,                      -- preview: post/comment text or job title
  created_at INTEGER NOT NULL,          -- latest activity, bumped when a new actor joins
  read_at    INTEGER
);
CREATE UNIQUE INDEX notifications_key ON notifications(user_id, type, ref_id);
CREATE INDEX notifications_user_created ON notifications(user_id, created_at DESC, id DESC);

CREATE TABLE notification_actors (
  notification_id TEXT NOT NULL REFERENCES notifications(id) ON DELETE CASCADE,
  actor_id        TEXT NOT NULL REFERENCES users(id),
  created_at      INTEGER NOT NULL,
  PRIMARY KEY (notification_id, actor_id)
) WITHOUT ROWID;

-- A new actor resurfaces the notification: newest first, unread again. Known actors acting twice do nothing.
CREATE TRIGGER notification_actors_ins AFTER INSERT ON notification_actors BEGIN
  UPDATE notifications SET created_at = NEW.created_at, read_at = NULL WHERE id = NEW.notification_id;
END;
