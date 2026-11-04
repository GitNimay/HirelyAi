-- Candidate funnel: when they accepted the consent notice, when the invite email went out (so a queue retry doesn't
-- issue new credentials), and why an AI interview ended (the room's reason, e.g. 'abandoned').
ALTER TABLE interview_sessions ADD COLUMN consented_at INTEGER;
ALTER TABLE interview_sessions ADD COLUMN invited_at INTEGER;
ALTER TABLE interview_sessions ADD COLUMN end_reason TEXT;
