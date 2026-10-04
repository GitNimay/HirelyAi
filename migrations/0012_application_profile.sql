-- Easy Apply sends the applicant's profile (a snapshot of their resumes.data, as it was when they applied), and the
-- recruiter reads it on the applicant page. Attaching a PDF becomes optional, so resume_key is nullable.
-- SQLite can't drop NOT NULL in place: rebuild the table (nothing references it), then restore its index and triggers.
CREATE TABLE applications_new (
  job_id       TEXT NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
  applicant_id TEXT NOT NULL REFERENCES users(id),
  email        TEXT NOT NULL,
  phone        TEXT,
  resume_key   TEXT,                      -- optional attached PDF, "<applicant_id>/<uuid>.pdf"
  profile      TEXT,                      -- JSON Resume snapshot (lib/resume-fields.ts); NULL on applications from before this
  note         TEXT,
  status       TEXT NOT NULL DEFAULT 'submitted' CHECK (status IN ('submitted', 'viewed', 'shortlisted', 'rejected')),
  created_at   INTEGER NOT NULL,
  updated_at   INTEGER NOT NULL,
  PRIMARY KEY (job_id, applicant_id)
) WITHOUT ROWID;
INSERT INTO applications_new (job_id, applicant_id, email, phone, resume_key, note, status, created_at, updated_at)
  SELECT job_id, applicant_id, email, phone, resume_key, note, status, created_at, updated_at FROM applications;
DROP TABLE applications;
ALTER TABLE applications_new RENAME TO applications;
CREATE INDEX applications_applicant ON applications(applicant_id, created_at DESC);

CREATE TRIGGER applications_ins AFTER INSERT ON applications BEGIN
  UPDATE jobs SET applicant_count = applicant_count + 1 WHERE id = NEW.job_id;
END;
CREATE TRIGGER applications_del AFTER DELETE ON applications BEGIN
  UPDATE jobs SET applicant_count = applicant_count - 1 WHERE id = OLD.job_id;
END;
