-- Status page: response time per check, kept as a day's sum + count so rows stay additive like total/failed
ALTER TABLE status_checks ADD COLUMN ms INTEGER NOT NULL DEFAULT 0;
ALTER TABLE status_checks ADD COLUMN ms_count INTEGER NOT NULL DEFAULT 0;
