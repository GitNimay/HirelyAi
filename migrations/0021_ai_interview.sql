-- Full AI interview (third screening kind, 'ai'): Phonic voice agent run by a deterministic harness in the InterviewRoom
-- Durable Object, through phases (intro, resume deep-dive, coding, system design, wrap-up). SQLite can't widen a CHECK in
-- place, so `interviews` is rebuilt (nothing references it; interview_sessions points at jobs).
-- `config`: JSON role config for 'ai' (lib/harness.ts RoleConfig: phase order + minutes, competencies with 1-5 rubric);
-- NULL for voice/mcq. For 'ai', `questions` holds the recruiter's general/behavioral questions (string[]), and `password`
-- is unused: each candidate gets their own link (the session id) by email.
CREATE TABLE interviews_new (
  job_id     TEXT PRIMARY KEY REFERENCES jobs(id) ON DELETE CASCADE,
  slug       TEXT NOT NULL UNIQUE,
  password   TEXT NOT NULL,
  kind       TEXT NOT NULL DEFAULT 'voice' CHECK (kind IN ('voice', 'mcq', 'ai')),
  questions  TEXT NOT NULL,
  config     TEXT,
  deadline   INTEGER NOT NULL,
  created_at INTEGER NOT NULL
);
INSERT INTO interviews_new (job_id, slug, password, kind, questions, deadline, created_at)
  SELECT job_id, slug, password, kind, questions, deadline, created_at FROM interviews;
DROP TABLE interviews;
ALTER TABLE interviews_new RENAME TO interviews;
CREATE INDEX interviews_deadline ON interviews(deadline);

-- 'ai' sessions are created when the invite goes out (not at a password gate).
-- plan:  JSON { claims: Claim[], order, built_at } from the resume snapshot (lib/ai-interview.ts buildPlan)
-- state: JSON harness checkpoint (phase, timers, claim results, notes, concerns, hints), written by the room after every turn
-- The full event log is JSONL in R2 at iv/<session id>/events.jsonl; recordings at iv/<session id>/<track>/...
ALTER TABLE interview_sessions ADD COLUMN plan TEXT;
ALTER TABLE interview_sessions ADD COLUMN state TEXT;

-- The recruiter's own call on the AI report (the evaluator only recommends): advance | hold | reject, with a note.
-- review: JSON { dismissed: string[] } integrity flags the recruiter cleared after watching the evidence.
-- media_deleted_at: recordings removed (by the recruiter, or the retention sweep); the report and transcript stay.
ALTER TABLE interview_sessions ADD COLUMN decision TEXT CHECK (decision IN ('advance', 'hold', 'reject'));
ALTER TABLE interview_sessions ADD COLUMN decision_note TEXT;
ALTER TABLE interview_sessions ADD COLUMN decided_at INTEGER;
ALTER TABLE interview_sessions ADD COLUMN review TEXT;
ALTER TABLE interview_sessions ADD COLUMN media_deleted_at INTEGER;
