-- Public status page (/status): one row per component per UTC day, bumped by every check (cron + page views)
CREATE TABLE status_checks (
  component TEXT NOT NULL,
  day       TEXT NOT NULL,             -- YYYY-MM-DD, UTC
  total     INTEGER NOT NULL DEFAULT 0,
  failed    INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (component, day)
);
