-- Company pages (LinkedIn style). Any member can create one and becomes its owner.
CREATE TABLE companies (
  id             TEXT PRIMARY KEY,
  slug           TEXT NOT NULL UNIQUE,      -- /company/<slug>
  name           TEXT NOT NULL,
  tagline        TEXT,
  about          TEXT,
  website        TEXT,
  domain         TEXT,                      -- website host ("acme.com"); work emails on it verify employees
  industry       TEXT,
  size           TEXT,
  type           TEXT,
  hq             TEXT,
  founded        INTEGER,
  specialties    TEXT,                      -- JSON ["..."]
  logo_key       TEXT,
  cover_key      TEXT,
  follower_count INTEGER NOT NULL DEFAULT 0,
  created_by     TEXT NOT NULL,             -- no FK: the page outlives its creator's account
  created_at     INTEGER NOT NULL,
  updated_at     INTEGER NOT NULL
);
CREATE INDEX companies_name ON companies(lower(name));
-- One page per domain, so a look-alike page can't verify the real company's employees
CREATE UNIQUE INDEX companies_domain ON companies(domain) WHERE domain IS NOT NULL;

CREATE TABLE company_admins (
  company_id TEXT NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  user_id    TEXT NOT NULL REFERENCES users(id),
  role       TEXT NOT NULL CHECK (role IN ('owner', 'admin')),
  created_at INTEGER NOT NULL,
  PRIMARY KEY (company_id, user_id)
) WITHOUT ROWID;
CREATE INDEX company_admins_user ON company_admins(user_id);

CREATE TABLE company_follows (
  user_id    TEXT NOT NULL,
  company_id TEXT NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  created_at INTEGER NOT NULL,
  PRIMARY KEY (user_id, company_id)
) WITHOUT ROWID;
CREATE TRIGGER company_follows_ins AFTER INSERT ON company_follows BEGIN
  UPDATE companies SET follower_count = follower_count + 1 WHERE id = NEW.company_id;
END;
CREATE TRIGGER company_follows_del AFTER DELETE ON company_follows BEGIN
  UPDATE companies SET follower_count = follower_count - 1 WHERE id = OLD.company_id;
END;

-- Who lists the company in their resume experience. Derived: rewritten from resumes.data on every resume save.
CREATE TABLE company_members (
  company_id TEXT NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  user_id    TEXT NOT NULL REFERENCES users(id),
  title      TEXT NOT NULL,
  current    INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (company_id, user_id)
) WITHOUT ROWID;
CREATE INDEX company_members_user ON company_members(user_id);

-- A member proved a work email on the company's domain. Only verified members can post its jobs.
CREATE TABLE company_verifications (
  company_id  TEXT NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  user_id     TEXT NOT NULL REFERENCES users(id),
  email       TEXT NOT NULL,
  verified_at INTEGER NOT NULL,
  PRIMARY KEY (company_id, user_id)
) WITHOUT ROWID;

-- Older jobs keep only the free-text company
ALTER TABLE jobs ADD COLUMN company_id TEXT REFERENCES companies(id);
CREATE INDEX jobs_company_created ON jobs(company_id, created_at DESC) WHERE company_id IS NOT NULL;

-- Posted by an admin (author_id) on behalf of the page
ALTER TABLE posts ADD COLUMN company_id TEXT REFERENCES companies(id);
CREATE INDEX posts_company_created ON posts(company_id, created_at DESC) WHERE company_id IS NOT NULL;
