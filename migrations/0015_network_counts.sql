-- Network counts kept on the user row (same trigger pattern as like_count / follower_count on companies), so the
-- dashboard card, profile header and network page stop running COUNT(*) over follows / connections on every load.
ALTER TABLE users ADD COLUMN follower_count INTEGER NOT NULL DEFAULT 0;
ALTER TABLE users ADD COLUMN following_count INTEGER NOT NULL DEFAULT 0;
ALTER TABLE users ADD COLUMN connection_count INTEGER NOT NULL DEFAULT 0;

UPDATE users SET
  follower_count = (SELECT COUNT(*) FROM follows WHERE followee_id = users.id),
  following_count = (SELECT COUNT(*) FROM follows WHERE follower_id = users.id),
  connection_count = (SELECT COUNT(*) FROM connections WHERE user_id = users.id);

CREATE TRIGGER follows_ins AFTER INSERT ON follows BEGIN
  UPDATE users SET follower_count = follower_count + 1 WHERE id = NEW.followee_id;
  UPDATE users SET following_count = following_count + 1 WHERE id = NEW.follower_id;
END;
CREATE TRIGGER follows_del AFTER DELETE ON follows BEGIN
  UPDATE users SET follower_count = follower_count - 1 WHERE id = OLD.followee_id;
  UPDATE users SET following_count = following_count - 1 WHERE id = OLD.follower_id;
END;
-- A connection is two rows (one per side), so each side counts its own row
CREATE TRIGGER connections_ins AFTER INSERT ON connections BEGIN
  UPDATE users SET connection_count = connection_count + 1 WHERE id = NEW.user_id;
END;
CREATE TRIGGER connections_del AFTER DELETE ON connections BEGIN
  UPDATE users SET connection_count = connection_count - 1 WHERE id = OLD.user_id;
END;
