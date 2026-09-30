"use server";

import { env, waitUntil } from "cloudflare:workers";
import { getFeed, getPost, type FeedTab, type Media } from "@/lib/feed";
import { Fail, failed, text, viewer, writer } from "@/lib/guard";
import { insertInterview, interviewResult, parseInterview, retryEvaluation } from "@/lib/interview";
import { cleanFilters, JOB_TYPES, LEVELS, LIMITS, RESUME_TYPE, STATUSES, WORKPLACES, type AppStatus, type MyJobsTab } from "@/lib/job-fields";
import { getApplicants, getJob, myJobs, searchJobs } from "@/lib/jobs";
import { inFolder, isVideo, newKey, MAX_COMMENT_CHARS, MAX_IMAGES, MAX_POST_CHARS, MEDIA_TYPES } from "@/lib/media";
import { getNetwork, getPersonAndCounts, searchPeople } from "@/lib/network";
import { followersOf, listNotifications, notifyUsers, unseenCount } from "@/lib/notifications";
import { broadcast, sendTo, type NetEvent } from "@/lib/realtime";
import { getResume } from "@/lib/resume";
import { resumePdf } from "@/lib/resume-pdf";
import { enqueue } from "@/lib/tasks";


// Every action re-checks auth (viewer/writer): server actions are public POST endpoints.
// No Clerk call on writes: the dashboard layout already synced this member's users row on page load.

async function pushStats(postId: string) {
  const p = await env.DB.prepare("SELECT like_count, comment_count, repost_count FROM posts WHERE id = ?")
    .bind(postId).first<{ like_count: number; comment_count: number; repost_count: number }>();
  if (p) broadcast({ t: "stats", id: postId, likes: p.like_count, comments: p.comment_count, reposts: p.repost_count });
  return p;
}

const snippet = (s: string) => s.slice(0, 140) || null;
const postOf = (id: string) => env.DB.prepare("SELECT author_id, body FROM posts WHERE id = ?").bind(id).first<{ author_id: string; body: string }>();
const jobTitle = (id: string) => env.DB.prepare("SELECT title FROM jobs WHERE id = ?").bind(id).first<string>("title");

export async function loadFeed(tab: FeedTab, cursor?: string) {
  return getFeed(await viewer(), tab === "following" ? "following" : "for-you", cursor);
}

export async function createPost(input: { body: string; media: string[] }) {
  return publish(input).then((post) => ({ post: post! }), failed);
}

/** Media must be objects this user uploaded (keys are server-issued and namespaced by user id). */
async function checkMedia(userId: string, input: unknown): Promise<Media[]> {
  const keys = Array.isArray(input) ? [...new Set(input.map(String))] : [];
  if (keys.length > MAX_IMAGES) throw new Fail("A post can have up to 4 images or 1 video");
  const media = await Promise.all(
    keys.map(async (key) => {
      if (!inFolder(key, "posts", userId)) throw new Fail("Invalid media");
      const obj = await env.MEDIA.head(key);
      const type = obj?.httpMetadata?.contentType ?? "";
      if (!obj || obj.customMetadata?.owner !== userId || !MEDIA_TYPES[type]) throw new Fail("Invalid media");
      return { key, type };
    }),
  );
  const videos = media.filter((m) => isVideo(m.type)).length;
  if (videos > 1 || (videos === 1 && media.length > 1)) throw new Fail("A post can have up to 4 images or 1 video");
  return media;
}

async function publish(input: { body: string; media: string[] }) {
  const userId = await writer();
  const body = text(input.body, MAX_POST_CHARS);
  const media = await checkMedia(userId, input.media);
  if (!body && media.length === 0) throw new Fail("Write something or add media");

  const id = crypto.randomUUID();
  await env.DB.prepare("INSERT INTO posts (id, author_id, body, media, created_at) VALUES (?, ?, ?, ?, ?)")
    .bind(id, userId, body, media.length ? JSON.stringify(media) : null, Date.now()).run();
  broadcast({ t: "post", id, authorId: userId });
  await notifyUsers(await followersOf(userId), { type: "post", actor: userId, ref: id, link: `/dashboard/post/${id}`, body: snippet(body) });
  return getPost(userId, id);
}

/** Replace a post's text and media (keep, remove, or add newly uploaded files). */
export async function editPost(id: string, input: { body: string; media: string[] }) {
  return edit(String(id), input).then((r) => r, failed);
}

async function edit(id: string, input: { body: string; media: string[] }) {
  const userId = await writer();
  const post = await env.DB.prepare("SELECT media FROM posts WHERE id = ? AND author_id = ? AND repost_of IS NULL")
    .bind(id, userId).first<{ media: string | null }>();
  if (!post) throw new Fail("Post not found");

  const body = text(input?.body, MAX_POST_CHARS);
  const media = await checkMedia(userId, input?.media);
  if (!body && media.length === 0) throw new Fail("Write something or add media");

  const editedAt = Date.now();
  await env.DB.prepare("UPDATE posts SET body = ?, media = ?, edited_at = ? WHERE id = ? AND author_id = ?")
    .bind(body, media.length ? JSON.stringify(media) : null, editedAt, id, userId).run();

  // Files dropped in this edit are no longer referenced anywhere
  const kept = new Set(media.map((m) => m.key));
  const removed = (post.media ? (JSON.parse(post.media) as Media[]) : []).filter((m) => !kept.has(m.key)).map((m) => m.key);
  if (removed.length) await env.MEDIA.delete(removed);

  broadcast({ t: "edit", id, body, media, editedAt });
  return { body, media, editedAt };
}

export async function deletePost(id: string) {
  const userId = await writer();
  const post = await env.DB.prepare("SELECT media, repost_of FROM posts WHERE id = ? AND author_id = ?")
    .bind(String(id), userId).first<{ media: string | null; repost_of: string | null }>();
  if (!post) throw new Error("Not found");
  // Reposts of this post cascade in SQL; their counters don't matter since the original is gone
  await env.DB.batch([
    env.DB.prepare("DELETE FROM posts WHERE id = ?").bind(String(id)),
    // Their notifications would only lead to a missing page
    env.DB.prepare("DELETE FROM notifications WHERE link = ?").bind(`/dashboard/post/${String(id)}`),
  ]);
  if (post.media) await env.MEDIA.delete((JSON.parse(post.media) as Media[]).map((m) => m.key));
  broadcast({ t: "delete", id: String(id) });
  if (post.repost_of) await pushStats(post.repost_of);
}

export async function toggleLike(postId: string) {
  const userId = await writer();
  const id = String(postId);
  const del = await env.DB.prepare("DELETE FROM likes WHERE user_id = ? AND post_id = ?").bind(userId, id).run();
  if (!del.meta.changes) {
    const ins = await env.DB.prepare("INSERT INTO likes (user_id, post_id, created_at) SELECT ?, id, ? FROM posts WHERE id = ? AND repost_of IS NULL")
      .bind(userId, Date.now(), id).run();
    const post = ins.meta.changes ? await postOf(id) : null;
    if (post) await notifyUsers([post.author_id], { type: "like", actor: userId, ref: id, link: `/dashboard/post/${id}`, body: snippet(post.body) });
  }
  await pushStats(id);
  return { liked: !del.meta.changes };
}

export async function toggleRepost(postId: string) {
  const userId = await writer();
  const id = String(postId);
  const removed = await env.DB.prepare("DELETE FROM posts WHERE author_id = ? AND repost_of = ? RETURNING id").bind(userId, id).first<{ id: string }>();
  if (removed) {
    broadcast({ t: "delete", id: removed.id });
  } else {
    const entryId = crypto.randomUUID();
    const ins = await env.DB.prepare(
      "INSERT INTO posts (id, author_id, repost_of, created_at) SELECT ?, ?, id, ? FROM posts WHERE id = ? AND repost_of IS NULL AND author_id <> ?",
    ).bind(entryId, userId, Date.now(), id, userId).run();
    if (ins.meta.changes) {
      broadcast({ t: "post", id: entryId, authorId: userId });
      const post = await postOf(id);
      if (post) await notifyUsers([post.author_id], { type: "repost", actor: userId, ref: id, link: `/dashboard/post/${id}`, body: snippet(post.body) });
    }
  }
  await pushStats(id);
  return { reposted: !removed };
}

export type Comment = { id: string; body: string; createdAt: number; author: { id: string; name: string; imageUrl: string | null; handle: string | null } };

export async function loadComments(postId: string): Promise<Comment[]> {
  await viewer();
  const { results } = await env.DB.prepare(
    `SELECT c.id, c.body, c.created_at, u.id AS uid, u.name, u.image_url, u.handle FROM comments c JOIN users u ON u.id = c.author_id
     WHERE c.post_id = ? ORDER BY c.created_at LIMIT 200`,
  ).bind(String(postId)).all<{ id: string; body: string; created_at: number; uid: string; name: string; image_url: string | null; handle: string | null }>();
  return results.map((r) => ({ id: r.id, body: r.body, createdAt: r.created_at, author: { id: r.uid, name: r.name, imageUrl: r.image_url, handle: r.handle } }));
}

export async function addComment(postId: string, input: string) {
  return comment(postId, input).then((comments) => ({ comments }), failed);
}

async function comment(postId: string, input: string) {
  const userId = await writer();
  const body = text(input, MAX_COMMENT_CHARS);
  if (!body) throw new Fail("Comment is empty");
  const commentId = crypto.randomUUID();
  const ins = await env.DB.prepare("INSERT INTO comments (id, post_id, author_id, body, created_at) SELECT ?, id, ?, ?, ? FROM posts WHERE id = ? AND repost_of IS NULL")
    .bind(commentId, userId, body, Date.now(), String(postId)).run();
  if (!ins.meta.changes) throw new Fail("This post was deleted");
  const post = await postOf(String(postId));
  if (post) {
    const link = `/dashboard/post/${String(postId)}`;
    await notifyUsers([post.author_id], { type: "comment", actor: userId, ref: commentId, link, body: snippet(body) });
    // People already in the conversation hear about it too (the author already got the message above)
    const { results } = await env.DB.prepare("SELECT DISTINCT author_id FROM comments WHERE post_id = ? AND author_id NOT IN (?, ?) LIMIT 50")
      .bind(String(postId), userId, post.author_id).all<{ author_id: string }>();
    await notifyUsers(results.map((r) => r.author_id), { type: "thread", actor: userId, ref: commentId, link, body: snippet(body) });
  }
  await pushStats(String(postId));
  return loadComments(postId);
}

export async function toggleFollow(targetId: string) {
  const userId = await writer();
  const id = String(targetId);
  if (id === userId) throw new Error("You can't follow yourself");
  const del = await env.DB.prepare("DELETE FROM follows WHERE follower_id = ? AND followee_id = ?").bind(userId, id).run();
  if (!del.meta.changes) {
    await env.DB.prepare("INSERT INTO follows (follower_id, followee_id, created_at) SELECT ?, id, ? FROM users WHERE id = ?")
      .bind(userId, Date.now(), id).run();
  }
  notify("follow", userId, id);
  if (!del.meta.changes) await notifyUsers([id], { type: "follow", actor: userId, ref: "", link: "/dashboard/network" });
  return { following: !del.meta.changes };
}

// ---- My Network ----

/**
 * Tell both sides (or just the actor, for changes the other side must not learn about) what changed,
 * each with the other person as they see them and their own fresh counts.
 */
function notify(kind: NetEvent["kind"], actor: string, other: string, both = true) {
  const pair = both ? ([[actor, other, "out"], [other, actor, "in"]] as const) : ([[actor, other, "out"]] as const);
  // After the response: it's two lookups per side, and only feeds realtime
  waitUntil(Promise.all(
    pair.map(async ([to, about, dir]) => {
      const { person, counts } = await getPersonAndCounts(to, about);
      if (person) sendTo(to, { t: "net", kind, dir, person, counts });
    }),
  ).catch((e) => console.error("notify failed", e)));
}

export async function loadNetwork() {
  return getNetwork(await viewer());
}

export async function findPeople(query: string) {
  return searchPeople(await viewer(), String(query));
}

/** Send a connection request, or accept theirs if they already invited you. */
export async function connect(targetId: string) {
  const me = await writer();
  const id = String(targetId);
  if (id === me) throw new Error("You can't connect with yourself");
  const theirs = await env.DB.prepare("SELECT 1 FROM invitations WHERE from_id = ? AND to_id = ?").bind(id, me).first();
  if (theirs) return acceptInvite(id);
  const ins = await env.DB.prepare(
    `INSERT OR IGNORE INTO invitations (from_id, to_id, created_at) SELECT ?1, id, ?3 FROM users
     WHERE id = ?2 AND NOT EXISTS (SELECT 1 FROM connections WHERE user_id = ?1 AND peer_id = ?2)`,
  ).bind(me, id, Date.now()).run();
  if (ins.meta.changes) {
    notify("invite", me, id);
    await notifyUsers([id], { type: "invite", actor: me, ref: me, link: "/dashboard/network" });
  }
}

export async function acceptInvite(fromId: string) {
  const me = await writer();
  const id = String(fromId);
  const del = await env.DB.prepare("DELETE FROM invitations WHERE from_id = ? AND to_id = ?").bind(id, me).run();
  if (!del.meta.changes) throw new Error("This invitation is no longer available");
  const now = Date.now();
  // Connecting also makes you follow each other, like LinkedIn. A crossed invite in the other direction is now moot.
  await env.DB.batch([
    env.DB.prepare("INSERT OR IGNORE INTO connections (user_id, peer_id, created_at) VALUES (?1, ?2, ?3), (?2, ?1, ?3)").bind(me, id, now),
    env.DB.prepare("INSERT OR IGNORE INTO follows (follower_id, followee_id, created_at) VALUES (?1, ?2, ?3), (?2, ?1, ?3)").bind(me, id, now),
    env.DB.prepare("DELETE FROM invitations WHERE from_id = ? AND to_id = ?").bind(me, id),
  ]);
  notify("connect", me, id);
  await notifyUsers([id], { type: "accept", actor: me, ref: me, link: "/dashboard/network" });
}

/** The sender isn't told (same as LinkedIn): their request just stays pending on their side. */
export async function ignoreInvite(fromId: string) {
  const me = await writer();
  const del = await env.DB.prepare("DELETE FROM invitations WHERE from_id = ? AND to_id = ?").bind(String(fromId), me).run();
  if (del.meta.changes) notify("uninvite", me, String(fromId), false);
}

export async function withdrawInvite(toId: string) {
  const me = await writer();
  const del = await env.DB.prepare("DELETE FROM invitations WHERE from_id = ? AND to_id = ?").bind(me, String(toId)).run();
  if (del.meta.changes) notify("uninvite", me, String(toId));
}

export async function removeConnection(peerId: string) {
  const me = await writer();
  const id = String(peerId);
  const [del] = await env.DB.batch([
    env.DB.prepare("DELETE FROM connections WHERE (user_id = ?1 AND peer_id = ?2) OR (user_id = ?2 AND peer_id = ?1)").bind(me, id),
    env.DB.prepare("DELETE FROM follows WHERE (follower_id = ?1 AND followee_id = ?2) OR (follower_id = ?2 AND followee_id = ?1)").bind(me, id),
  ]);
  if (del.meta.changes) notify("disconnect", me, id);
}

// ---- Jobs ----

export async function loadJobs(filters: Record<string, unknown>, cursor?: string) {
  return searchJobs(await viewer(), cleanFilters(filters ?? {}), cursor ? String(cursor) : undefined);
}

export async function loadMyJobs(tab: MyJobsTab) {
  const me = await viewer();
  return myJobs(me, tab === "applied" || tab === "posted" ? tab : "saved");
}

export async function loadJob(id: string) {
  return getJob(await viewer(), String(id));
}

const oneOf = <T extends object>(opts: T, v: unknown, what: string) => {
  if (typeof v !== "string" || !Object.hasOwn(opts, v)) throw new Fail(`Choose a ${what}`);
  return v as keyof T;
};

export async function postJob(input: Record<string, unknown>) {
  return createJob(input ?? {}).then((job) => ({ job: job! }), failed);
}

async function createJob(input: Record<string, unknown>) {
  const me = await writer();
  const job = {
    title: text(input.title, LIMITS.title),
    company: text(input.company, LIMITS.company),
    location: text(input.location, LIMITS.location),
    workplace: oneOf(WORKPLACES, input.workplace, "workplace type"),
    type: oneOf(JOB_TYPES, input.type, "job type"),
    level: oneOf(LEVELS, input.level, "experience level"),
    salary: text(input.salary, LIMITS.salary) || null,
    description: text(input.description, LIMITS.description),
  };
  if (!job.title || !job.company) throw new Fail("Add a job title and company");
  if (job.workplace !== "remote" && !job.location) throw new Fail("Add a location for on-site and hybrid jobs");
  if (job.description.length < 50) throw new Fail("Describe the role in at least 50 characters");
  const interview = parseInterview(input);

  const id = crypto.randomUUID();
  await env.DB.batch([
    env.DB.prepare(
      "INSERT INTO jobs (id, poster_id, title, company, location, workplace, type, level, salary, description, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
    ).bind(id, me, job.title, job.company, job.location, job.workplace, job.type, job.level, job.salary, job.description, Date.now()),
    ...(interview ? [insertInterview(id, interview)] : []),
  ]);
  broadcast({ t: "job", id, posterId: me });
  await notifyUsers(await followersOf(me), { type: "job", actor: me, ref: id, link: `/dashboard/jobs?id=${id}`, body: job.title });
  return getJob(me, id);
}

async function pushJobStats(jobId: string) {
  const j = await env.DB.prepare("SELECT applicant_count, closed_at FROM jobs WHERE id = ?").bind(jobId).first<{ applicant_count: number; closed_at: number | null }>();
  if (j) broadcast({ t: "jobstat", id: jobId, applicants: j.applicant_count, closed: j.closed_at !== null });
}

/** Close a listing to new applicants (it leaves search), or reopen it. */
export async function setJobClosed(jobId: string, closed: boolean) {
  const me = await writer();
  // A job whose interview deadline has passed stays closed (the cron would close it again anyway)
  const upd = await env.DB.prepare(
    "UPDATE jobs SET closed_at = ?1 WHERE id = ?2 AND poster_id = ?3 AND (?1 IS NOT NULL OR NOT EXISTS (SELECT 1 FROM interviews WHERE job_id = ?2 AND deadline <= ?4))",
  ).bind(closed ? Date.now() : null, String(jobId), me, Date.now()).run();
  if (!upd.meta.changes) throw new Error("Job not found, or its interview deadline has passed");
  await pushJobStats(String(jobId));
  if (closed) {
    const { results } = await env.DB.prepare("SELECT applicant_id FROM applications WHERE job_id = ? LIMIT 200").bind(String(jobId)).all<{ applicant_id: string }>();
    await notifyUsers(results.map((r) => r.applicant_id), {
      type: "job_closed", actor: me, ref: String(jobId), link: `/dashboard/jobs?tab=applied&id=${String(jobId)}`, body: await jobTitle(String(jobId)),
    });
  }
}

export async function toggleSaveJob(jobId: string) {
  const me = await writer();
  const id = String(jobId);
  const del = await env.DB.prepare("DELETE FROM saved_jobs WHERE user_id = ? AND job_id = ?").bind(me, id).run();
  if (!del.meta.changes) await env.DB.prepare("INSERT INTO saved_jobs (user_id, job_id, created_at) SELECT ?, id, ? FROM jobs WHERE id = ?").bind(me, Date.now(), id).run();
  return { saved: !del.meta.changes };
}

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Easy Apply: contact details plus a PDF resume this user uploaded, or (no `resumeKey`) their profile resume. */
export async function applyToJob(jobId: string, input: Record<string, unknown>) {
  return apply(String(jobId), input ?? {}).then((job) => ({ job: job! }), failed);
}

async function apply(jobId: string, input: Record<string, unknown>) {
  const me = await writer();
  const email = text(input.email, LIMITS.email);
  const phone = text(input.phone, LIMITS.phone) || null;
  const note = text(input.note, LIMITS.note) || null;
  let resumeKey = text(input.resumeKey, 200);
  if (!EMAIL.test(email)) throw new Fail("Enter a valid email");
  if (phone && !/^[+\d\s().-]{6,}$/.test(phone)) throw new Fail("Enter a valid phone number");
  // No upload: attach a PDF snapshot of their profile resume, so the poster sees it as it was when they applied
  const generated = !resumeKey;
  if (generated) {
    const r = await getResume(me);
    if (!r) throw new Fail("Upload your resume");
    resumeKey = newKey("resumes", me, "pdf");
    await env.MEDIA.put(resumeKey, await resumePdf(r), { httpMetadata: { contentType: RESUME_TYPE }, customMetadata: { owner: me } });
  } else {
    if (!inFolder(resumeKey, "resumes", me)) throw new Fail("Upload your resume");
    const obj = await env.MEDIA.head(resumeKey);
    if (!obj || obj.customMetadata?.owner !== me || obj.httpMetadata?.contentType !== RESUME_TYPE) throw new Fail("Upload your resume");
  }

  const now = Date.now();
  const ins = await env.DB.prepare(
    `INSERT OR IGNORE INTO applications (job_id, applicant_id, email, phone, resume_key, note, created_at, updated_at)
     SELECT id, ?2, ?3, ?4, ?5, ?6, ?7, ?7 FROM jobs WHERE id = ?1 AND closed_at IS NULL AND poster_id <> ?2
       AND NOT EXISTS (SELECT 1 FROM interviews WHERE job_id = ?1 AND deadline <= ?7)`,
  ).bind(jobId, me, email, phone, resumeKey, note, now).run();
  if (!ins.meta.changes) {
    if (generated) await env.MEDIA.delete(resumeKey);
    const job = await getJob(me, jobId);
    if (job?.application) throw new Fail("You already applied to this job");
    throw new Fail(job?.poster.id === me ? "You can't apply to your own job" : "This job is no longer accepting applications");
  }
  const job = await getJob(me, jobId);
  // Queued: Resend is slow-ish and can fail; the link is also on the job page, so the application never waits on it
  if (job?.interview) await enqueue({ t: "invite", jobId, to: email }).catch((e) => console.error("invite: enqueue failed", e));
  if (job) {
    sendTo(job.poster.id, { t: "app", jobId, applicantId: me, status: "submitted" });
    await notifyUsers([job.poster.id], { type: "applicant", actor: me, ref: jobId, link: `/dashboard/jobs?tab=posted&id=${jobId}`, body: job.title });
  }
  await pushJobStats(jobId);
  return job;
}

/** The poster's applicant list. Opening it marks new applications as viewed and tells those applicants, like LinkedIn. */
export async function loadApplicants(jobId: string) {
  const me = await viewer();
  const id = String(jobId);
  const { results } = await env.DB.prepare(
    `UPDATE applications SET status = 'viewed', updated_at = ?3
     WHERE job_id = ?1 AND status = 'submitted' AND EXISTS (SELECT 1 FROM jobs WHERE id = ?1 AND poster_id = ?2)
     RETURNING applicant_id`,
  ).bind(id, me, Date.now()).all<{ applicant_id: string }>();
  results.forEach((r) => sendTo(r.applicant_id, { t: "app", jobId: id, applicantId: r.applicant_id, status: "viewed" }));
  if (results.length) {
    await notifyUsers(results.map((r) => r.applicant_id), {
      type: "app_viewed", actor: me, ref: id, link: `/dashboard/jobs?tab=applied&id=${id}`, body: await jobTitle(id),
    });
  }
  return getApplicants(me, id);
}

export async function setApplicationStatus(jobId: string, applicantId: string, status: AppStatus) {
  const me = await writer();
  const s = oneOf(STATUSES, status, "status");
  const upd = await env.DB.prepare(
    `UPDATE applications SET status = ?4, updated_at = ?5
     WHERE job_id = ?1 AND applicant_id = ?2 AND EXISTS (SELECT 1 FROM jobs WHERE id = ?1 AND poster_id = ?3)`,
  ).bind(String(jobId), String(applicantId), me, s, Date.now()).run();
  if (!upd.meta.changes) throw new Error("Application not found");
  sendTo(String(applicantId), { t: "app", jobId: String(jobId), applicantId: String(applicantId), status: s });
  if (s === "viewed" || s === "shortlisted" || s === "rejected") {
    await notifyUsers([String(applicantId)], {
      type: `app_${s}`, actor: me, ref: String(jobId), link: `/dashboard/jobs?tab=applied&id=${String(jobId)}`, body: await jobTitle(String(jobId)),
    });
  }
}

// ---- Notifications ----

export async function loadNotifications(cursor?: string) {
  return listNotifications(await viewer(), cursor ? String(cursor) : undefined);
}

/** Opening the page clears the badge on every open tab and device; items stay unread until clicked. */
export async function markSeen() {
  const me = await viewer();
  await env.DB.batch([
    env.DB.prepare("UPDATE users SET notif_seen_at = ? WHERE id = ?").bind(Date.now(), me),
    // Keep the table bounded: nobody scrolls back three months
    env.DB.prepare("DELETE FROM notifications WHERE user_id = ? AND created_at < ?").bind(me, Date.now() - 90 * 86_400_000),
  ]);
  sendTo(me, { t: "notif-seen" });
}

export async function markRead(id: string) {
  const me = await viewer();
  await env.DB.prepare("UPDATE notifications SET read_at = ? WHERE id = ? AND user_id = ? AND read_at IS NULL").bind(Date.now(), String(id), me).run();
}

export async function markAllRead() {
  const me = await viewer();
  await env.DB.prepare("UPDATE notifications SET read_at = ? WHERE user_id = ? AND read_at IS NULL").bind(Date.now(), me).run();
}

export async function deleteNotification(id: string) {
  const me = await viewer();
  await env.DB.prepare("DELETE FROM notifications WHERE id = ? AND user_id = ?").bind(String(id), me).run();
}

export const loadUnseen = async () => unseenCount(await viewer());

/** The poster's view of one applicant's voice interview: onboarding answers, transcript and AI evaluation. */
export async function loadInterview(jobId: string, applicantId: string) {
  return interviewResult(await viewer(), String(jobId), String(applicantId));
}

export async function retryInterview(jobId: string, applicantId: string) {
  const me = await writer();
  await retryEvaluation(me, String(jobId), String(applicantId));
  return interviewResult(me, String(jobId), String(applicantId));
}
