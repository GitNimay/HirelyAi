"use server";

import { auth, clerkClient, reverificationError } from "@clerk/nextjs/server";
import { env } from "cloudflare:workers";

/**
 * Delete the caller's account: Clerk first (so the directory sync can't re-add them), then their D1 rows and R2 files.
 * Needs a fresh sign-in (strict reverification); the client's useReverification asks for a code and retries.
 */
export async function deleteAccount() {
  const { userId, has } = await auth();
  if (!userId) throw new Error("Unauthorized");
  if (!has({ reverification: "strict" })) return reverificationError("strict");

  await (await clerkClient()).users.deleteUser(userId);

  // One transaction. Deleting posts/jobs cascades to others' likes, comments, reposts and applications on them.
  const sql = [
    // Notifications to them, and ones where they were the only actor
    `DELETE FROM notifications WHERE user_id = ?1 OR id IN (
       SELECT notification_id FROM notification_actors WHERE actor_id = ?1
       EXCEPT SELECT notification_id FROM notification_actors WHERE actor_id <> ?1)`,
    "DELETE FROM notification_actors WHERE actor_id = ?1",
    "DELETE FROM likes WHERE user_id = ?1",
    "DELETE FROM comments WHERE author_id = ?1",
    "DELETE FROM posts WHERE author_id = ?1",
    "DELETE FROM follows WHERE follower_id = ?1 OR followee_id = ?1",
    "DELETE FROM invitations WHERE from_id = ?1 OR to_id = ?1",
    "DELETE FROM connections WHERE user_id = ?1 OR peer_id = ?1",
    "DELETE FROM saved_jobs WHERE user_id = ?1",
    "DELETE FROM suggestion_dismissals WHERE user_id = ?1 OR peer_id = ?1",
    // Their voice interviews for other people's jobs: onboarding answers and transcripts are personal data
    "DELETE FROM interview_sessions WHERE applicant_id = ?1",
    "DELETE FROM applications WHERE applicant_id = ?1",
    "DELETE FROM jobs WHERE poster_id = ?1",
    "DELETE FROM resumes WHERE user_id = ?1",
    // Company pages stay (and keep their logos, under companies/). Admins of a page they owned become its owners.
    `UPDATE company_admins SET role = 'owner' WHERE user_id <> ?1 AND company_id IN (SELECT company_id FROM company_admins WHERE user_id = ?1 AND role = 'owner')`,
    "DELETE FROM company_admins WHERE user_id = ?1",
    "DELETE FROM company_follows WHERE user_id = ?1",
    "DELETE FROM company_members WHERE user_id = ?1",
    "DELETE FROM company_verifications WHERE user_id = ?1",
    "DELETE FROM users WHERE id = ?1",
  ];
  await env.DB.batch(sql.map((s) => env.DB.prepare(s).bind(userId)));

  // Their uploads (see lib/media.ts for the layout; `<id>/` is the legacy one).
  // ponytail: resumes others sent to their (now deleted) jobs stay in R2, same as the unattached-upload note in /api/uploads.
  for (const prefix of [`posts/${userId}/`, `profiles/${userId}/`, `resumes/${userId}/`, `${userId}/`]) {
    let cursor: string | undefined;
    do {
      const page = await env.MEDIA.list({ prefix, cursor });
      if (page.objects.length) await env.MEDIA.delete(page.objects.map((o) => o.key));
      cursor = page.truncated ? page.cursor : undefined;
    } while (cursor);
  }
  return { ok: true };
}
