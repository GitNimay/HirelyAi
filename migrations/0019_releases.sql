-- The public changelog (/changelog). Deploys add a 'pending' row with the merged PR's title and description
-- (.github/workflows/ci.yml); the cron writes the member-facing entry (lib/changelog.ts) and publishes it, or skips it.
CREATE TABLE releases (
  version     TEXT PRIMARY KEY,            -- "1.2.19", the GitHub Release tag without the v
  released_at TEXT NOT NULL,               -- ISO 8601
  state       TEXT NOT NULL DEFAULT 'pending', -- pending | published | skipped | failed
  source      TEXT,                        -- PR title + description, input for the writer
  title       TEXT,
  changes     TEXT,                        -- JSON [["new" | "improved" | "fixed", text], ...]
  attempts    INTEGER NOT NULL DEFAULT 0,  -- AI tries (2 at most)
  ai_day      TEXT                         -- UTC day of the last AI try: the daily cap counts these
);
CREATE INDEX releases_published ON releases (state, released_at);

-- Releases before the pipeline, written by hand
INSERT INTO releases (version, released_at, state, title, changes) VALUES
  ('1.2.19', '2026-10-10T17:14:49Z', 'published', 'Sharper interview results', '[["improved","Interview grading is more precise, and results now fit in one compact summary."],["improved","Voice interviews feel smoother from start to finish."]]'),
  ('1.2.18', '2026-10-10T16:31:14Z', 'published', 'Profile and application, side by side', '[["new","Switch between an applicant''s profile and their application without leaving the page."]]'),
  ('1.2.17', '2026-10-09T17:19:05Z', 'published', 'Link previews', '[["new","Links to Hire Excellence now show a preview image when you share them."],["fixed","The sign-up button in the header is the right size on phones."]]'),
  ('1.2.15', '2026-10-08T17:58:31Z', 'published', 'A guided tour and screening at a glance', '[["new","A short hand-drawn tour shows new members around the dashboard."],["new","See each applicant''s screening status, and export everyone who finished it."],["improved","The homepage shows a live preview of the dashboard."],["improved","Redesigned emails for invites and updates."]]'),
  ('1.2.9', '2026-10-07T22:30:13Z', 'published', 'Reactions', '[["new","React to posts with more than a like."],["new","Subtle sounds when you like or publish a post."]]'),
  ('1.2.8', '2026-10-07T22:15:02Z', 'published', 'More privacy controls', '[["new","Turn usage analytics off in Settings."],["improved","Your email and phone number are masked in Settings until you reveal them."]]'),
  ('1.2.5', '2026-10-07T21:20:58Z', 'published', 'Faster social sign-in', '[["improved","Signing in with Google, GitHub or X is quicker and more reliable."]]'),
  ('1.2.3', '2026-10-07T20:11:34Z', 'published', 'Made for phones', '[["improved","Every screen now fits small phones comfortably."]]'),
  ('1.2.2', '2026-10-07T19:55:50Z', 'published', 'Live notifications', '[["improved","Notifications arrive instantly on every page."],["improved","Reading a notification on one device marks it read everywhere."]]'),
  ('1.2.0', '2026-10-07T19:26:27Z', 'published', 'Faster and safer', '[["improved","Pages load faster across the app."],["improved","Security improvements throughout."]]'),
  ('1.1.13', '2026-10-06T19:17:06Z', 'published', 'A new homepage', '[["new","A homepage that explains how Hire Excellence works for candidates and recruiters, with answers to common questions."],["fixed","Feature tiles on the homepage display correctly in dark mode."]]'),
  ('1.1.7', '2026-10-05T10:38:30Z', 'published', 'Post from anywhere', '[["new","A Post button in the sidebar, so you can share from any page."]]'),
  ('1.1.3', '2026-10-04T17:56:56Z', 'published', 'Protection from bots', '[["improved","A quick human check keeps bots away from sign-up and shared pages."]]'),
  ('1.1.2', '2026-10-04T17:47:20Z', 'published', 'Fixes', '[["fixed","Voice interviews play through the loudspeaker on iPhone."],["fixed","You''re no longer left on the sign-in page after logging in."]]'),
  ('1.1.0', '2026-10-04T14:07:34Z', 'published', 'Multiple-choice tests', '[["new","Screen applicants with a multiple-choice test, written by you or drafted by AI, alongside the voice interview."]]'),
  ('1.0.17', '2026-10-04T13:16:41Z', 'published', 'A warmer light theme', '[["improved","A warmer light theme with a clearer sidebar."],["improved","Messages now appear in the bottom-right corner."],["new","An animated like button."]]'),
  ('1.0.14', '2026-10-04T12:57:01Z', 'published', 'Better jobs and interviews', '[["new","Edit or delete jobs you''ve posted."],["new","Your profile summary and latest notifications beside the feed."],["improved","Easy Apply sends your profile; a resume is now optional."],["improved","Voice interviews start faster, with more accurate transcripts."],["improved","Job pages show more about the role."]]'),
  ('1.0.7', '2026-10-02T10:00:20Z', 'published', 'Smoother everywhere', '[["improved","Fluid animations, new buttons and icons, and an easier code input."],["improved","A cleaner, icon-only tab bar on phones."]]'),
  ('1.0.5', '2026-10-02T07:53:47Z', 'published', 'Company pages', '[["new","Create a page for your company with an About section."],["new","Post jobs once your work email is verified."]]'),
  ('1.0.4', '2026-09-30T21:38:38Z', 'published', 'Share with anyone', '[["new","Share posts, jobs and profiles with people who don''t have an account."],["new","An About tab on profiles, and lists of followers."],["improved","Add descriptions to images for screen readers."]]'),
  ('1.0.3', '2026-09-30T21:31:17Z', 'published', 'Verified emails', '[["new","Confirm your email with a one-time code when you finish onboarding."],["improved","Sign-in codes arrive in a branded email."]]'),
  ('1.0.0', '2026-09-30T20:45:39Z', 'published', 'Hello, Hire Excellence', '[["new","A feed to share posts, photos and video."],["new","My Network: invitations, suggestions and people search."],["new","Jobs with search, Easy Apply, and applicant management for recruiters."],["new","Profiles, notifications, and light and dark themes."],["new","Onboarding that fills in your profile from your resume."],["new","AI voice interviews for job applicants."]]');
