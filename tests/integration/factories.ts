import { env } from "cloudflare:workers";

// Test data builders. Every row gets a unique id, so tests in one file never see each other's data and can
// run in any order. Defaults are the smallest valid row; pass only what the test is about.

export const uid = (prefix: string) => `${prefix}_${crypto.randomUUID().slice(0, 8)}`;

const run = (sql: string, ...args: unknown[]) =>
  env.DB.prepare(sql)
    .bind(...args)
    .run();

export async function user(over: { name?: string; resumePublic?: boolean; handle?: string } = {}) {
  const id = uid("user");
  await run(
    "INSERT INTO users (id, name, handle, resume_public, updated_at) VALUES (?, ?, ?, ?, ?)",
    id,
    over.name ?? `User ${id}`,
    over.handle ?? null,
    over.resumePublic ? 1 : 0,
    Date.now(),
  );
  return id;
}

export async function company(
  createdBy: string,
  over: { name?: string; slug?: string; domain?: string; specialties?: string[] } = {},
) {
  const id = uid("co");
  await run(
    "INSERT INTO companies (id, slug, name, domain, specialties, created_by, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
    id,
    over.slug ?? id.replace("_", "-"),
    over.name ?? `Company ${id}`,
    over.domain ?? null,
    over.specialties ? JSON.stringify(over.specialties) : null,
    createdBy,
    Date.now(),
    Date.now(),
  );
  return id;
}

export const companyAdmin = (companyId: string, userId: string, role: "owner" | "admin" = "owner") =>
  run(
    "INSERT INTO company_admins (company_id, user_id, role, created_at) VALUES (?, ?, ?, ?)",
    companyId,
    userId,
    role,
    Date.now(),
  );

export const verifyWorkEmail = (companyId: string, userId: string, email = `${userId}@acme.test`) =>
  run(
    "INSERT INTO company_verifications (company_id, user_id, email, verified_at) VALUES (?, ?, ?, ?)",
    companyId,
    userId,
    email,
    Date.now(),
  );

export const companyMember = (companyId: string, userId: string, title = "Engineer", current = true) =>
  run(
    "INSERT INTO company_members (company_id, user_id, title, current) VALUES (?, ?, ?, ?)",
    companyId,
    userId,
    title,
    current ? 1 : 0,
  );

export const followCompany = (userId: string, companyId: string) =>
  run("INSERT INTO company_follows (user_id, company_id, created_at) VALUES (?, ?, ?)", userId, companyId, Date.now());

export async function post(
  authorId: string,
  over: { body?: string; at?: number; media?: unknown[]; repostOf?: string; companyId?: string } = {},
) {
  const id = uid("post");
  await run(
    "INSERT INTO posts (id, author_id, body, media, repost_of, company_id, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)",
    id,
    authorId,
    over.body ?? (over.repostOf ? "" : `Post ${id}`),
    over.media ? JSON.stringify(over.media) : null,
    over.repostOf ?? null,
    over.companyId ?? null,
    over.at ?? Date.now(),
  );
  return id;
}

export const follow = (followerId: string, followeeId: string) =>
  run(
    "INSERT INTO follows (follower_id, followee_id, created_at) VALUES (?, ?, ?)",
    followerId,
    followeeId,
    Date.now(),
  );

export const like = (userId: string, postId: string, kind = "like") =>
  run("INSERT INTO likes (user_id, post_id, kind, created_at) VALUES (?, ?, ?, ?)", userId, postId, kind, Date.now());

export async function comment(postId: string, authorId: string, body = "Nice") {
  const id = uid("cmt");
  await run(
    "INSERT INTO comments (id, post_id, author_id, body, created_at) VALUES (?, ?, ?, ?, ?)",
    id,
    postId,
    authorId,
    body,
    Date.now(),
  );
  return id;
}

export async function job(posterId: string, over: { companyId?: string; closed?: boolean; title?: string } = {}) {
  const id = uid("job");
  await run(
    `INSERT INTO jobs (id, poster_id, title, company, workplace, type, level, description, company_id, closed_at, created_at)
     VALUES (?, ?, ?, 'Acme', 'remote', 'full-time', 'entry', 'Build things', ?, ?, ?)`,
    id,
    posterId,
    over.title ?? "Engineer",
    over.companyId ?? null,
    over.closed ? Date.now() : null,
    Date.now(),
  );
  return id;
}

/** Reads one row back, for asserting on what a function wrote. */
export const row = <T = Record<string, unknown>>(sql: string, ...args: unknown[]) =>
  env.DB.prepare(sql)
    .bind(...args)
    .first<T>();
