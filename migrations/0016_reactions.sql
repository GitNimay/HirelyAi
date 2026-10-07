-- LinkedIn-style reactions: a like row now carries which reaction it is. One reaction per member per post.
-- posts.reactions keeps per-kind counts as JSON ({"like":3,"love":1}) so the feed reads them without GROUP BY;
-- like_count stays the total (ranking and every existing reader use it).
ALTER TABLE likes ADD COLUMN kind TEXT NOT NULL DEFAULT 'like'
  CHECK (kind IN ('like', 'celebrate', 'support', 'love', 'insightful', 'funny'));
ALTER TABLE posts ADD COLUMN reactions TEXT NOT NULL DEFAULT '{}';

UPDATE posts SET reactions = json_object('like', like_count) WHERE like_count > 0;

DROP TRIGGER likes_ins;
DROP TRIGGER likes_del;

CREATE TRIGGER likes_ins AFTER INSERT ON likes BEGIN
  UPDATE posts SET
    like_count = like_count + 1,
    reactions = json_set(reactions, '$.' || NEW.kind, COALESCE(json_extract(reactions, '$.' || NEW.kind), 0) + 1)
  WHERE id = NEW.post_id;
END;

CREATE TRIGGER likes_del AFTER DELETE ON likes BEGIN
  UPDATE posts SET
    like_count = like_count - 1,
    reactions = CASE WHEN COALESCE(json_extract(reactions, '$.' || OLD.kind), 0) <= 1
      THEN json_remove(reactions, '$.' || OLD.kind)
      ELSE json_set(reactions, '$.' || OLD.kind, json_extract(reactions, '$.' || OLD.kind) - 1) END
  WHERE id = OLD.post_id;
END;

-- Switching reaction (like → love): total unchanged, one kind down, the other up
CREATE TRIGGER likes_kind AFTER UPDATE OF kind ON likes WHEN OLD.kind <> NEW.kind BEGIN
  UPDATE posts SET reactions = CASE WHEN COALESCE(json_extract(reactions, '$.' || OLD.kind), 0) <= 1
      THEN json_remove(reactions, '$.' || OLD.kind)
      ELSE json_set(reactions, '$.' || OLD.kind, json_extract(reactions, '$.' || OLD.kind) - 1) END
  WHERE id = NEW.post_id;
  UPDATE posts SET
    reactions = json_set(reactions, '$.' || NEW.kind, COALESCE(json_extract(reactions, '$.' || NEW.kind), 0) + 1)
  WHERE id = NEW.post_id;
END;
