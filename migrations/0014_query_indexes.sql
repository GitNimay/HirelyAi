-- Ordered lists: let SQLite walk the index and stop at LIMIT instead of sorting every matching row (TEMP B-TREE)
CREATE INDEX follows_followee_created ON follows(followee_id, created_at DESC);  -- followers list, followersOf
CREATE INDEX follows_follower_created ON follows(follower_id, created_at DESC);  -- following list
DROP INDEX follows_followee;                                                     -- prefix of follows_followee_created
CREATE INDEX connections_user_created ON connections(user_id, created_at DESC);  -- connections list
CREATE INDEX invitations_from_created ON invitations(from_id, created_at DESC);  -- sent invitations
CREATE INDEX likes_user_created ON likes(user_id, created_at DESC);              -- profile Likes tab
CREATE INDEX applications_job_created ON applications(job_id, created_at DESC);  -- applicant list
-- Cascades and lookups that scanned the whole table
CREATE INDEX saved_jobs_job ON saved_jobs(job_id);
CREATE INDEX company_verifications_user ON company_verifications(user_id);
