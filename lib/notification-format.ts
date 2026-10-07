/** Pure text helpers for notifications; no server imports so the client and the test can use them. */

export type NotificationType =
  | "like" | "repost" | "comment" | "thread" | "post" | "follow" | "invite" | "accept"
  | "applicant" | "app_viewed" | "app_shortlisted" | "app_rejected" | "job" | "job_closed";

export type Actor = { id: string; name: string; imageUrl: string | null };

/** "Ada", "Ada and Bo", "Ada, Bo and 3 others" (`shown` is the newest few, `count` everyone). */
export function who(shown: Pick<Actor, "name">[], count: number) {
  const [a, b] = shown.map((s) => s.name);
  if (count <= 1 || !b) return a ?? "Someone";
  if (count === 2) return `${a} and ${b}`;
  const rest = count - 2;
  return `${a}, ${b} and ${rest} other${rest === 1 ? "" : "s"}`;
}

/** What happened, without the people: "reacted to your post". `body` is the job title for job types. */
export function verb(type: NotificationType, body: string | null) {
  switch (type) {
    case "like": return "reacted to your post";
    case "repost": return "reposted your post";
    case "comment": return "commented on your post";
    case "thread": return "also commented on a post you commented on";
    case "post": return "shared a post";
    case "follow": return "started following you";
    case "invite": return "sent you a connection invitation";
    case "accept": return "accepted your connection invitation";
    case "applicant": return `applied to ${body}`;
    case "app_viewed": return `viewed your application to ${body}`;
    case "app_shortlisted": return `shortlisted your application to ${body}`;
    case "app_rejected": return `moved forward with other candidates for ${body}`;
    case "job": return `posted a job: ${body}`;
    case "job_closed": return `is no longer accepting applications for ${body}`;
  }
}

/** Notification types that carry a text preview under the sentence (job titles are already in it). */
export const hasPreview = (type: NotificationType) => ["like", "repost", "comment", "thread", "post"].includes(type);

export type Category = "posts" | "network" | "jobs";

export function categoryOf(type: NotificationType): Category {
  if (["like", "repost", "comment", "thread", "post"].includes(type)) return "posts";
  if (["follow", "invite", "accept"].includes(type)) return "network";
  return "jobs";
}
