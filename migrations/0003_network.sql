-- Pending connection requests. Accepting turns one into a connection, ignoring or withdrawing deletes it.
CREATE TABLE invitations (
  from_id    TEXT NOT NULL REFERENCES users(id),
  to_id      TEXT NOT NULL REFERENCES users(id),
  created_at INTEGER NOT NULL,
  PRIMARY KEY (from_id, to_id),
  CHECK (from_id <> to_id)
) WITHOUT ROWID;
CREATE INDEX invitations_to ON invitations(to_id, created_at DESC);

-- Mutual (1st degree) connections, stored in both directions so every lookup is a prefix scan
CREATE TABLE connections (
  user_id    TEXT NOT NULL REFERENCES users(id),
  peer_id    TEXT NOT NULL REFERENCES users(id),
  created_at INTEGER NOT NULL,
  PRIMARY KEY (user_id, peer_id),
  CHECK (user_id <> peer_id)
) WITHOUT ROWID;

CREATE INDEX follows_followee ON follows(followee_id);
