-- A job's screening is either the AI voice interview or an MCQ test, never both. Same link, password, email,
-- onboarding and deadline; only the questions and the attempt differ.
-- MCQ `questions`: JSON [{ q, options: string[], answer: index }]; the answer key never leaves the server.
ALTER TABLE interviews ADD COLUMN kind TEXT NOT NULL DEFAULT 'voice' CHECK (kind IN ('voice', 'mcq'));

-- MCQ picks, JSON number[] (one per question, -1 = unanswered), saved as the candidate clicks so a reload keeps them.
ALTER TABLE interview_sessions ADD COLUMN answers TEXT;
