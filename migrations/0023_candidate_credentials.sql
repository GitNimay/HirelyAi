-- Per-candidate sign-in for every screening kind (voice, MCQ, AI interview): the invite email carries a candidate ID
-- (`login`) and a password, stored as a SHA-256 hex hash (`pass`). Sessions now exist from the invite, not the gate.
-- interviews.password (the old shared password) is no longer used.
ALTER TABLE interview_sessions ADD COLUMN login TEXT;
ALTER TABLE interview_sessions ADD COLUMN pass TEXT;
CREATE UNIQUE INDEX interview_sessions_login ON interview_sessions(login);
