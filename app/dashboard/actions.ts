"use server";

import { env, waitUntil } from "cloudflare:workers";
import { getFeed, getPost, type FeedTab, type Media } from "@/lib/feed";
import { track } from "@/lib/analytics";
import { aiWriter, Fail, failed, text, viewer, writer } from "@/lib/guard";
import { generateMcq, insertInterview, interviewResult, parseInterview, retryEvaluation } from "@/lib/interview";
import type { Kind } from "@/lib/interview-fields";
import { cleanFilters, JOB_TYPES, LEVELS, LIMITS, RESUME_TYPE, STATUSES, WORKPLACES, type AppStatus, type MyJobsTab } from "@/lib/job-fields";
import { canPostJobs, roleOf } from "@/lib/companies";
import { getApplicants, getJob, myJobs, searchJobs } from "@/lib/jobs";
import { inFolder, isVideo, MAX_ALT_CHARS, MAX_COMMENT_CHARS, MAX_IMAGES, MAX_POST_CHARS, MEDIA_TYPES } from "@/lib/media";
import { getNetwork, getPersonAndCounts, searchPeople } from "@/lib/network";
import { announceRemoved, followersOf, latestNotifications, listNotifications, notifyUsers, retractNotification, unseenCount } from "@/lib/notifications";
import type { NotificationType } from "@/lib/notification-format";
import { isReaction, type Reaction } from "@/lib/reactions";
import { broadcast, sendTo, type NetEvent } from "@/lib/realtime";
import { signedIn } from "@/lib/profile";
import { getResume } from "@/lib/resume";
import { enqueue } from "@/lib/tasks";


// Every action re-checks auth (viewer/writer): server actions are public POST endpoints.
// No Clerk call on writes: the dashboard layout already synced this member's users row on page load.

async function pushStats(postId: string) {
  const p = await env.DB.prepare("SELECT like_count, reactions, comment_count, repost_count FROM posts WHERE id = ?")
    .bind(postId).first<{ like_count: number; reactions: string; comment_count: number; repost_count: number }>();
  if (p) broadcast({ t: "stats", id: postId, likes: p.like_count, reactions: JSON.parse(p.reactions), comments: p.comment_count, reposts: p.repost_count });
  return p;
}

const snippet = (s: string) => s.slice(0, 140) || null;
const postOf = (id: string) => env.DB.prepare("SELECT author_id, body FROM posts WHERE id = ?").bind(id).first<{ author_id: string; body: string }>();
/** After the response: the undo is already committed, so the recipient's notification loses this actor (lib/notifications.ts). */
const retract = (type: NotificationType, actor: string, ref: string, to: string) =>
  waitUntil(retractNotification(type, actor, ref, to).catch((e) => console.error("retract failed", e)));
const jobTitle = (id: string) => env.DB.prepare("SELECT title FROM jobs WHERE id = ?").bind(id).first<string>("title");

export async function loadFeed(tab: FeedTab, cursor?: string) {
  return getFeed(await viewer(), tab === "following" ? "following" : "for-you", cursor);
}

/** A post's media from the client: a stored key, optionally with an image description. */
export type MediaInput = { key: string; alt?: string };

/** `companyId`: post as that company page (admins only). */
export async function createPost(input: { body: string; media: MediaInput[]; companyId?: string }) {
  return publish(input).then((post) => ({ post: post! }), failed);
}

/** Media must be objects this user uploaded (keys are server-issued and namespaced by user id). */
async function checkMedia(userId: string, input: unknown): Promise<Media[]> {
  // Plain key strings are still accepted (older clients); alt text is trimmed and capped
  const items = (Array.isArray(input) ? input : []).map((m) =>
    typeof m === "string" ? { key: m, alt: "" } : { key: String(m?.key ?? ""), alt: text(m?.alt, MAX_ALT_CHARS) },
  );
  const alts = new Map(items.map((m) => [m.key, m.alt]));
  const keys = [...alts.keys()];
  if (keys.length > MAX_IMAGES) throw new Fail("A post can have up to 4 images or 1 video");
  const media = await Promise.all(
    keys.map(async (key): Promise<Media> => {
      if (!inFolder(key, "posts", userId)) throw new Fail("Invalid media");
      const obj = await env.MEDIA.head(key);
      const type = obj?.httpMetadata?.contentType ?? "";
      if (!obj || obj.customMetadata?.owner !== userId || !MEDIA_TYPES[type]) throw new Fail("Invalid media");
      const alt = isVideo(type) ? "" : alts.get(key);
      return alt ? { key, type, alt } : { key, type };
    }),
  );
  const videos = media.filter((m) => isVideo(m.type)).length;
  if (videos > 1 || (videos === 1 && media.length > 1)) throw new Fail("A post can have up to 4 images or 1 video");
  return media;
}

async function publish(input: { body: string; media: MediaInput[]; companyId?: string }) {
  const userId = await writer();
  const body = text(input.body, MAX_POST_CHARS);
  const media = await checkMedia(userId, input.media);
  if (!body && media.length === 0) throw new Fail("Write something or add media");
  const companyId = input.companyId ? String(input.companyId) : null;
  if (companyId && !(await roleOf(userId, companyId))) throw new Fail("Only page admins can post as this company");

  const id = crypto.randomUUID();
  await env.DB.prepare("INSERT INTO posts (id, author_id, body, media, company_id, created_at) VALUES (?, ?, ?, ?, ?, ?)")
    .bind(id, userId, body, media.length ? JSON.stringify(media) : null, companyId, Date.now()).run();
  broadcast({ t: "post", id, authorId: userId });
  await track(userId, "post created", { post_id: id, media: media.length, as_company: !!companyId });
  // ponytail: company posts reach followers through their Following feed, not notifications; add a fan-out when pages get big audiences
  if (!companyId) await notifyUsers(await followersOf(userId), { type: "post", actor: userId, ref: id, link: `/dashboard/post/${id}`, body: snippet(body) });
  return getPost(userId, id);
}

/** Replace a post's text and media (keep, remove, or add newly uploaded files). */
export async function editPost(id: string, input: { body: string; media: MediaInput[] }) {
  return edit(String(id), input).then((r) => r, failed);
}

async function edit(id: string, input: { body: string; media: MediaInput[] }) {
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
  const [, notifs] = await env.DB.batch<{ id: string; user_id: string }>([
    env.DB.prepare("DELETE FROM posts WHERE id = ?").bind(String(id)),
    // Their notifications would only lead to a missing page: gone from the list, and from open tabs
    env.DB.prepare("DELETE FROM notifications WHERE link = ? RETURNING id, user_id").bind(`/dashboard/post/${String(id)}`),
  ]);
  waitUntil(announceRemoved(notifs.results).catch(() => {}));
  if (post.media) await env.MEDIA.delete((JSON.parse(post.media) as Media[]).map((m) => m.key));
  broadcast({ t: "delete", id: String(id) });
  if (post.repost_of) await pushStats(post.repost_of);
}

/** Set the viewer's reaction to a post (`null` removes it). Only a first reaction notifies; switching kind doesn't. */
export async function react(postId: string, kind: Reaction | null) {
  const userId = await writer();
  const id = String(postId);
  if (kind !== null && !isReaction(kind)) throw new Fail("Unknown reaction");
  if (kind === null) {
    const del = await env.DB.prepare("DELETE FROM likes WHERE user_id = ? AND post_id = ?").bind(userId, id).run();
    const post = del.meta.changes ? await postOf(id) : null;
    if (post) retract("like", userId, id, post.author_id);
  } else {
    // Switch an existing reaction, or add one (OR IGNORE: a double-click race is a no-op, not an error)
    const upd = await env.DB.prepare("UPDATE likes SET kind = ? WHERE user_id = ? AND post_id = ?").bind(kind, userId, id).run();
    const ins = upd.meta.changes ? null : await env.DB.prepare(
      "INSERT OR IGNORE INTO likes (user_id, post_id, kind, created_at) SELECT ?, id, ?, ? FROM posts WHERE id = ? AND repost_of IS NULL",
    ).bind(userId, kind, Date.now(), id).run();
    const post = ins?.meta.changes ? await postOf(id) : null;
    if (post) await notifyUsers([post.author_id], { type: "like", actor: userId, ref: id, link: `/dashboard/post/${id}`, body: snippet(post.body) });
  }
  await pushStats(id);
  return { reaction: kind };
}

export async function toggleRepost(postId: string) {
  const userId = await writer();
  const id = String(postId);
  const removed = await env.DB.prepare("DELETE FROM posts WHERE author_id = ? AND repost_of = ? RETURNING id").bind(userId, id).first<{ id: string }>();
  if (removed) {
    broadcast({ t: "delete", id: removed.id });
    const post = await postOf(id);
    if (post) retract("repost", userId, id, post.author_id);
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
  await track(userId, "comment added", { post_id: String(postId) });
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
  await track(userId, del.meta.changes ? "user unfollowed" : "user followed");
  if (!del.meta.changes) await notifyUsers([id], { type: "follow", actor: userId, ref: "", link: "/dashboard/network" });
  else retract("follow", userId, "", id);
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
/** Hide someone from your "People you may know" for good. */
export async function dismissSuggestion(peerId: string) {
  const me = await writer();
  await env.DB.prepare("INSERT OR IGNORE INTO suggestion_dismissals (user_id, peer_id, created_at) SELECT ?1, id, ?3 FROM users WHERE id = ?2 AND id <> ?1")
    .bind(me, String(peerId), Date.now()).run();
}

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
    await track(me, "connection requested");
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
  await track(me, "connection accepted");
  retract("invite", id, id, me); // answered: no longer an open invitation
  await notifyUsers([id], { type: "accept", actor: me, ref: me, link: "/dashboard/network" });
}

/** The sender isn't told (same as LinkedIn): their request just stays pending on their side. */
export async function ignoreInvite(fromId: string) {
  const me = await writer();
  const del = await env.DB.prepare("DELETE FROM invitations WHERE from_id = ? AND to_id = ?").bind(String(fromId), me).run();
  if (del.meta.changes) {
    notify("uninvite", me, String(fromId), false);
    retract("invite", String(fromId), String(fromId), me);
  }
}

export async function withdrawInvite(toId: string) {
  const me = await writer();
  const del = await env.DB.prepare("DELETE FROM invitations WHERE from_id = ? AND to_id = ?").bind(me, String(toId)).run();
  if (del.meta.changes) {
    notify("uninvite", me, String(toId));
    retract("invite", me, me, String(toId));
  }
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

/** The form fields a poster sets, on posting and on editing. */
function jobFields(input: Record<string, unknown>) {
  const job = {
    title: text(input.title, LIMITS.title),
    location: text(input.location, LIMITS.location),
    workplace: oneOf(WORKPLACES, input.workplace, "workplace type"),
    type: oneOf(JOB_TYPES, input.type, "job type"),
    level: oneOf(LEVELS, input.level, "experience level"),
    salary: text(input.salary, LIMITS.salary) || null,
    description: text(input.description, LIMITS.description),
  };
  if (!job.title) throw new Fail("Add a job title");
  if (job.workplace !== "remote" && !job.location) throw new Fail("Add a location for on-site and hybrid jobs");
  if (job.description.length < 50) throw new Fail("Describe the role in at least 50 characters");
  return job;
}

async function createJob(input: Record<string, unknown>) {
  const me = await writer();
  const companyId = text(input.companyId, 40);
  const company = companyId && (await canPostJobs(me, companyId))
    ? await env.DB.prepare("SELECT name FROM companies WHERE id = ?").bind(companyId).first<string>("name")
    : null;
  if (!company) throw new Fail("Only employees who verified their work email on the company page can post its jobs");
  const job = { ...jobFields(input), company };
  const interview = parseInterview(input);

  const id = crypto.randomUUID();
  await env.DB.batch([
    env.DB.prepare(
      "INSERT INTO jobs (id, poster_id, title, company, company_id, location, workplace, type, level, salary, description, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
    ).bind(id, me, job.title, job.company, companyId, job.location, job.workplace, job.type, job.level, job.salary, job.description, Date.now()),
    ...(interview ? [insertInterview(id, interview)] : []),
  ]);
  broadcast({ t: "job", id, posterId: me });
  await track(me, "job posted", { job_id: id, company_id: companyId, interview: interview?.kind ?? null, workplace: job.workplace, level: job.level, salary_shown: !!job.salary });
  await notifyUsers(await followersOf(me), { type: "job", actor: me, ref: id, link: `/dashboard/jobs?id=${id}`, body: job.title });
  return getJob(me, id);
}

/**
 * The poster edits a listing. Company stays; an existing screening's questions and deadline can change, but it can't be
 * added, removed or switched between voice and MCQ. MCQ questions lock once a candidate has started (their picks index them).
 */
export async function updateJob(jobId: string, input: Record<string, unknown>) {
  return editJob(String(jobId), input ?? {}).then((job) => ({ job: job! }), failed);
}

async function editJob(id: string, input: Record<string, unknown>) {
  const me = await writer();
  const job = jobFields(input);
  const current = await env.DB.prepare(
    `SELECT i.deadline, i.kind, i.questions, EXISTS (SELECT 1 FROM interview_sessions s WHERE s.job_id = j.id AND s.started_at IS NOT NULL) AS started
     FROM jobs j LEFT JOIN interviews i ON i.job_id = j.id WHERE j.id = ? AND j.poster_id = ?`,
  ).bind(id, me).first<{ deadline: number | null; kind: Kind | null; questions: string | null; started: number }>();
  if (!current) throw new Fail("Job not found");
  const interview = current.deadline === null ? null : parseInterview(input, { kind: current.kind!, deadline: current.deadline });
  if (interview && current.started && JSON.stringify(interview.questions) !== current.questions) {
    // Answers are graded against the stored questions, so changing them would re-score earlier candidates
    throw new Fail("Questions can't change after a candidate has started");
  }
  await env.DB.batch([
    env.DB.prepare("UPDATE jobs SET title = ?, location = ?, workplace = ?, type = ?, level = ?, salary = ?, description = ? WHERE id = ? AND poster_id = ?")
      .bind(job.title, job.location, job.workplace, job.type, job.level, job.salary, job.description, id, me),
    ...(interview ? [env.DB.prepare("UPDATE interviews SET questions = ?, deadline = ? WHERE job_id = ?").bind(JSON.stringify(interview.questions), interview.deadline, id)] : []),
  ]);
  return getJob(me, id);
}

/**
 * The poster deletes a listing; applications, saves and the interview cascade with it.
 * ponytail: applicants' resume PDFs stay in R2 (later applications may reuse them); sweep unreferenced ones if storage matters.
 */
export async function deleteJob(jobId: string) {
  const me = await writer();
  const id = String(jobId);
  const del = await env.DB.prepare("DELETE FROM jobs WHERE id = ? AND poster_id = ?").bind(id, me).run();
  if (!del.meta.changes) throw new Error("Job not found");
  // Every notification about it (new job, applicants, status changes) would lead to a missing listing
  const { results } = await env.DB.prepare("DELETE FROM notifications WHERE link IN (?1, ?2, ?3) RETURNING id, user_id")
    .bind(`/dashboard/jobs?id=${id}`, `/dashboard/jobs?tab=applied&id=${id}`, `/dashboard/jobs?tab=posted&id=${id}`).all<{ id: string; user_id: string }>();
  waitUntil(announceRemoved(results).catch(() => {}));
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
  await track(me, closed ? "job closed" : "job reopened", { job_id: String(jobId) });
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
  await track(me, del.meta.changes ? "job unsaved" : "job saved", { job_id: id });
  return { saved: !del.meta.changes };
}

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Easy Apply: contact details plus the applicant's profile (snapshotted), and optionally a PDF resume they uploaded. */
export async function applyToJob(jobId: string, input: Record<string, unknown>) {
  return apply(String(jobId), input ?? {}).then((job) => ({ job: job! }), failed);
}

async function apply(jobId: string, input: Record<string, unknown>) {
  const me = await writer();
  const email = text(input.email, LIMITS.email);
  const phone = text(input.phone, LIMITS.phone) || null;
  const note = text(input.note, LIMITS.note) || null;
  const resumeKey = text(input.resumeKey, 200) || null;
  if (!EMAIL.test(email)) throw new Fail("Enter a valid email");
  if (phone && !/^[+\d\s().-]{6,}$/.test(phone)) throw new Fail("Enter a valid phone number");
  if (resumeKey) {
    if (!inFolder(resumeKey, "resumes", me)) throw new Fail("Upload your resume again");
    const obj = await env.MEDIA.head(resumeKey);
    if (!obj || obj.customMetadata?.owner !== me || obj.httpMetadata?.contentType !== RESUME_TYPE) throw new Fail("Upload your resume again");
  }
  // The profile as it is now, so the poster reads what was sent even if it's edited later
  const profile = await getResume(me);
  if (!profile) throw new Fail("Finish setting up your profile before applying");

  const now = Date.now();
  const ins = await env.DB.prepare(
    `INSERT OR IGNORE INTO applications (job_id, applicant_id, email, phone, resume_key, profile, note, created_at, updated_at)
     SELECT id, ?2, ?3, ?4, ?5, ?8, ?6, ?7, ?7 FROM jobs WHERE id = ?1 AND closed_at IS NULL AND poster_id <> ?2
       AND NOT EXISTS (SELECT 1 FROM interviews WHERE job_id = ?1 AND deadline <= ?7)
       AND NOT EXISTS (SELECT 1 FROM applications WHERE job_id = ?1 AND email = ?3 COLLATE NOCASE)`,
  ).bind(jobId, me, email, phone, resumeKey, note, now, JSON.stringify(profile)).run();
  if (!ins.meta.changes) {
    const job = await getJob(me, jobId);
    if (job?.application) throw new Fail("You already applied to this job");
    // The interview gate signs candidates in by job + email, so one email must map to one applicant
    if (await env.DB.prepare("SELECT 1 FROM applications WHERE job_id = ? AND email = ? COLLATE NOCASE").bind(jobId, email).first()) {
      throw new Fail("Another applicant already used this email. Use your own email address.");
    }
    throw new Fail(job?.poster.id === me ? "You can't apply to your own job" : "This job is no longer accepting applications");
  }
  const job = await getJob(me, jobId);
  await track(me, "job applied", { job_id: jobId, resume_attached: !!resumeKey, interview: job?.interview?.kind ?? null });
  // Queued: Resend is slow-ish and can fail; the link is also on the job page, so the application never waits on it
  // Only to the account's own (Clerk-verified) address, so the form can't make us mail strangers. Others use the link on the job page.
  const own = job?.interview && (await signedIn())?.account.email.toLowerCase() === email.toLowerCase();
  if (own) await enqueue({ t: "invite", jobId, to: email }).catch((e) => console.error("invite: enqueue failed", e));
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
  await track(me, "application status changed", { job_id: String(jobId), status: s });
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

/** The newest three, for the dashboard rail after a reconnect. */
export async function loadLatestNotifications() {
  return latestNotifications(await viewer());
}

/**
 * Opening the page clears the badge on every open tab and device; items stay unread until clicked.
 * Writes (and pushes) only when something was actually unseen, since the open page calls this on every new notification.
 */
export async function markSeen() {
  const me = await viewer();
  const now = Date.now();
  const [upd] = await env.DB.batch([
    env.DB.prepare("UPDATE users SET notif_seen_at = ?1 WHERE id = ?2 AND EXISTS (SELECT 1 FROM notifications WHERE user_id = ?2 AND created_at > users.notif_seen_at)").bind(now, me),
    // Keep the table bounded: nobody scrolls back three months
    env.DB.prepare("DELETE FROM notifications WHERE user_id = ? AND created_at < ?").bind(me, now - 90 * 86_400_000),
  ]);
  if (upd.meta.changes) sendTo(me, { t: "notif-seen" });
}

// Read state and deletions follow the member to every open tab and device

export async function markRead(id: string) {
  const me = await viewer();
  const upd = await env.DB.prepare("UPDATE notifications SET read_at = ? WHERE id = ? AND user_id = ? AND read_at IS NULL").bind(Date.now(), String(id), me).run();
  if (upd.meta.changes) sendTo(me, { t: "notif-read", id: String(id) });
}

export async function markAllRead() {
  const me = await viewer();
  const upd = await env.DB.prepare("UPDATE notifications SET read_at = ? WHERE user_id = ? AND read_at IS NULL").bind(Date.now(), me).run();
  if (upd.meta.changes) sendTo(me, { t: "notif-read" });
}

export async function deleteNotification(id: string) {
  const me = await viewer();
  const { results } = await env.DB.prepare("DELETE FROM notifications WHERE id = ? AND user_id = ? RETURNING id, user_id").bind(String(id), me).all<{ id: string; user_id: string }>();
  waitUntil(announceRemoved(results).catch(() => {}));
}

export const loadUnseen = async () => unseenCount(await viewer());

/** The poster's view of one applicant's voice interview: onboarding answers, transcript and AI evaluation. */
export async function loadInterview(jobId: string, applicantId: string) {
  return interviewResult(await viewer(), String(jobId), String(applicantId));
}

/** AI-drafted MCQs for the post form (topic, difficulty, count, optional context). */
export async function generateQuestions(input: Record<string, unknown>) {
  try {
    await aiWriter();
    return { questions: await generateMcq(input ?? {}) };
  } catch (e) {
    return failed(e);
  }
}

export async function retryInterview(jobId: string, applicantId: string) {
  const me = await writer();
  await retryEvaluation(me, String(jobId), String(applicantId));
  return interviewResult(me, String(jobId), String(applicantId));
}
