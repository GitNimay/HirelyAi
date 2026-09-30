-- Optional AI voice interview on a job. One link + password shared by every applicant (mailed when they apply);
-- open until the deadline, after which the job closes.
CREATE TABLE interviews (
  job_id     TEXT PRIMARY KEY REFERENCES jobs(id) ON DELETE CASCADE,
  slug       TEXT NOT NULL UNIQUE,   -- public link: /interview/<slug>
  password   TEXT NOT NULL,          -- shared access code (shown to the poster, mailed to applicants), not a user secret
  questions  TEXT NOT NULL,          -- JSON string[], asked in order
  deadline   INTEGER NOT NULL,
  created_at INTEGER NOT NULL
);
CREATE INDEX interviews_deadline ON interviews(deadline);

-- One attempt per applicant. The id is the LiveKit room name and the candidate's session cookie.
-- Status: verified → onboarded → live → processing → done | failed (evaluation failed, transcript kept).
CREATE TABLE interview_sessions (
  id           TEXT PRIMARY KEY,
  job_id       TEXT NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
  applicant_id TEXT NOT NULL,
  status       TEXT NOT NULL DEFAULT 'verified' CHECK (status IN ('verified', 'onboarded', 'live', 'processing', 'done', 'failed')),
  profile      TEXT,                 -- JSON: onboarding answers
  transcript   TEXT,                 -- JSON [{ role: "agent" | "candidate", text }]
  report       TEXT,                 -- JSON evaluation, see lib/interview-fields.ts
  score        INTEGER,
  started_at   INTEGER,
  ended_at     INTEGER,
  created_at   INTEGER NOT NULL,
  UNIQUE (job_id, applicant_id)
);
