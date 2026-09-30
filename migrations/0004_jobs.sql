-- A job listing. Everyone applies in-app (Easy Apply); closing hides it from search but keeps applications.
CREATE TABLE jobs (
  id              TEXT PRIMARY KEY,
  poster_id       TEXT NOT NULL REFERENCES users(id),
  title           TEXT NOT NULL,
  company         TEXT NOT NULL,
  location        TEXT NOT NULL DEFAULT '',
  workplace       TEXT NOT NULL CHECK (workplace IN ('onsite', 'hybrid', 'remote')),
  type            TEXT NOT NULL CHECK (type IN ('full-time', 'part-time', 'contract', 'temporary', 'internship')),
  level           TEXT NOT NULL CHECK (level IN ('internship', 'entry', 'associate', 'mid-senior', 'director', 'executive')),
  salary          TEXT,
  description     TEXT NOT NULL,
  applicant_count INTEGER NOT NULL DEFAULT 0,
  closed_at       INTEGER,
  created_at      INTEGER NOT NULL
);
CREATE INDEX jobs_open_created ON jobs(created_at DESC, id DESC) WHERE closed_at IS NULL;
CREATE INDEX jobs_poster_created ON jobs(poster_id, created_at DESC);

-- One application per person per job. Status moves submitted → viewed → shortlisted | rejected.
CREATE TABLE applications (
  job_id       TEXT NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
  applicant_id TEXT NOT NULL REFERENCES users(id),
  email        TEXT NOT NULL,
  phone        TEXT,
  resume_key   TEXT NOT NULL,             -- R2 key of the PDF, "<applicant_id>/<uuid>.pdf"
  note         TEXT,
  status       TEXT NOT NULL DEFAULT 'submitted' CHECK (status IN ('submitted', 'viewed', 'shortlisted', 'rejected')),
  created_at   INTEGER NOT NULL,
  updated_at   INTEGER NOT NULL,
  PRIMARY KEY (job_id, applicant_id)
) WITHOUT ROWID;
CREATE INDEX applications_applicant ON applications(applicant_id, created_at DESC);

CREATE TABLE saved_jobs (
  user_id    TEXT NOT NULL,
  job_id     TEXT NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
  created_at INTEGER NOT NULL,
  PRIMARY KEY (user_id, job_id)
) WITHOUT ROWID;

CREATE TRIGGER applications_ins AFTER INSERT ON applications BEGIN
  UPDATE jobs SET applicant_count = applicant_count + 1 WHERE id = NEW.job_id;
END;
CREATE TRIGGER applications_del AFTER DELETE ON applications BEGIN
  UPDATE jobs SET applicant_count = applicant_count - 1 WHERE id = OLD.job_id;
END;
