-- Share link for an AI interview report: a random token the poster turns on (and off). Null = not shared.
ALTER TABLE interview_sessions ADD COLUMN share_token TEXT;
CREATE UNIQUE INDEX interview_sessions_share ON interview_sessions(share_token) WHERE share_token IS NOT NULL;
