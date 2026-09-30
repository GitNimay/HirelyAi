-- Deleting a post clears notifications that link to it (app/dashboard/actions.ts deletePost); without this it scans the table
CREATE INDEX notifications_link ON notifications(link);
-- The cron's stuck-grading sweep (lib/interview.ts closeExpired) only ever looks at this handful of rows
CREATE INDEX interview_sessions_processing ON interview_sessions(ended_at) WHERE status = 'processing';
