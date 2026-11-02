import { env } from "cloudflare:workers";
import { describe, expect, it, onTestFinished, vi } from "vitest";
import {
  deliverNotifications,
  followersOf,
  listNotifications,
  notifyUsers,
  retractNotification,
  unseenCount,
  type Spec,
} from "@/lib/notifications";
import { sendEach, sendTo } from "@/lib/realtime";
import { follow, like, post, row, user } from "./factories";

// Live pushes go through a Durable Object; the test checks what would be pushed, not the socket.
vi.mock("@/lib/realtime", () => ({ sendEach: vi.fn(), sendTo: vi.fn() }));

const likeSpec = (actor: string, postId: string): Spec => ({
  type: "like",
  actor,
  ref: postId,
  link: `/post/${postId}`,
});

/** Swaps the queue binding for a fake for one test (the local binding's methods can't be spied on). */
function fakeQueue(send = vi.fn().mockResolvedValue(undefined)) {
  const real = env.TASKS;
  env.TASKS = { send } as unknown as typeof env.TASKS;
  onTestFinished(() => {
    env.TASKS = real;
  });
  return send;
}

/** A liked post, ready for "X reacted to your post" deliveries. */
async function likedPost() {
  const author = await user();
  const postId = await post(author);
  return { author, postId };
}

describe("notifyUsers", () => {
  it("queues one task for everyone but the actor, without duplicates", async () => {
    const send = fakeQueue();
    const [actor, a, b] = [await user(), await user(), await user()];
    const spec = likeSpec(actor, "p1");

    await notifyUsers([a, b, a, actor], spec);

    expect(send).toHaveBeenCalledExactlyOnceWith({ t: "notify", to: [a, b], spec }, { contentType: "json" });
  });

  it("sends nothing when the actor is the only recipient", async () => {
    const send = fakeQueue();
    const actor = await user();
    await notifyUsers([actor], likeSpec(actor, "p1"));
    expect(send).not.toHaveBeenCalled();
  });

  it("never fails the write that caused it when the queue is down", async () => {
    fakeQueue(vi.fn().mockRejectedValue(new Error("queue down")));
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    await expect(notifyUsers([await user()], likeSpec(await user(), "p1"))).resolves.toBeUndefined();
    expect(error).toHaveBeenCalled();
  });
});

describe("deliverNotifications", () => {
  it("stores the notification and pushes it to the recipient", async () => {
    const { author, postId } = await likedPost();
    const fan = await user({ name: "Ada" });
    await like(fan, postId);

    await deliverNotifications([author], likeSpec(fan, postId));

    const { items } = await listNotifications(author);
    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({ type: "like", link: `/post/${postId}`, read: false, count: 1 });
    expect(items[0].actors).toEqual([{ id: fan, name: "Ada", imageUrl: null }]);
    expect(sendEach).toHaveBeenCalledWith([
      expect.objectContaining({ to: author, event: expect.objectContaining({ t: "notif", unseen: 1 }) }),
    ]);
  });

  it("groups a second actor into the same notification", async () => {
    const { author, postId } = await likedPost();
    const [a, b] = [await user(), await user()];
    await like(a, postId);
    await like(b, postId);

    await deliverNotifications([author], likeSpec(a, postId));
    await deliverNotifications([author], likeSpec(b, postId));

    const { items } = await listNotifications(author);
    expect(items).toHaveLength(1);
    expect(items[0].count).toBe(2);
    expect(items[0].actors.map((x) => x.id)).toEqual(expect.arrayContaining([a, b]));
  });

  it("is idempotent: a retried queue message adds nothing", async () => {
    const { author, postId } = await likedPost();
    const fan = await user();
    await like(fan, postId);

    await deliverNotifications([author], likeSpec(fan, postId));
    await deliverNotifications([author], likeSpec(fan, postId));

    const { items } = await listNotifications(author);
    expect(items).toHaveLength(1);
    expect(items[0].count).toBe(1);
  });

  it("skips a delivery that lands after the action was undone", async () => {
    const { author, postId } = await likedPost();
    const fan = await user();
    // The like was removed before the queued message ran: nothing to announce
    await deliverNotifications([author], likeSpec(fan, postId));
    expect((await listNotifications(author)).items).toEqual([]);
  });

  it("ignores recipients that are not members", async () => {
    const { postId } = await likedPost();
    const fan = await user();
    await like(fan, postId);
    await deliverNotifications(["user_deleted"], likeSpec(fan, postId));
    expect(await row("SELECT COUNT(*) AS n FROM notifications WHERE user_id = 'user_deleted'")).toEqual({ n: 0 });
  });
});

describe("retractNotification", () => {
  it("deletes the notification when its last actor undoes the action", async () => {
    const { author, postId } = await likedPost();
    const fan = await user();
    await like(fan, postId);
    await deliverNotifications([author], likeSpec(fan, postId));

    await retractNotification("like", fan, postId, author);

    expect((await listNotifications(author)).items).toEqual([]);
    expect(sendEach).toHaveBeenLastCalledWith([
      expect.objectContaining({ to: author, event: expect.objectContaining({ t: "notif-del", unseen: 0 }) }),
    ]);
  });

  it("keeps the notification for the remaining actors and pushes the update", async () => {
    const { author, postId } = await likedPost();
    const [a, b] = [await user(), await user()];
    await like(a, postId);
    await like(b, postId);
    await deliverNotifications([author], likeSpec(a, postId));
    await deliverNotifications([author], likeSpec(b, postId));

    await retractNotification("like", a, postId, author);

    const { items } = await listNotifications(author);
    expect(items[0].count).toBe(1);
    expect(sendTo).toHaveBeenCalledWith(author, expect.objectContaining({ t: "notif" }));
  });

  it("does nothing for an actor who was never on it", async () => {
    const { author, postId } = await likedPost();
    await retractNotification("like", await user(), postId, author);
    expect(sendTo).not.toHaveBeenCalled();
    expect(sendEach).not.toHaveBeenCalled();
  });
});

describe("listing", () => {
  it("pages newest first with a cursor and no overlap", async () => {
    const me = await user();
    for (let i = 0; i < 32; i++) {
      const fan = await user();
      await follow(fan, me);
      await deliverNotifications([me], { type: "follow", actor: fan, ref: fan, link: `/u/${fan}` });
    }

    const first = await listNotifications(me);
    expect(first.items).toHaveLength(30);
    expect(first.next).not.toBeNull();
    const second = await listNotifications(me, first.next!);
    expect(second.items).toHaveLength(2);
    expect(second.next).toBeNull();

    const ids = [...first.items, ...second.items].map((n) => n.id);
    expect(new Set(ids).size).toBe(32);
    expect(await unseenCount(me)).toBe(32);
  });

  it("counts only notifications newer than the last time the bell was opened", async () => {
    const me = await user();
    const fan = await user();
    await follow(fan, me);
    await deliverNotifications([me], { type: "follow", actor: fan, ref: fan, link: "/" });
    expect(await unseenCount(me)).toBe(1);

    await env.DB.prepare("UPDATE users SET notif_seen_at = ? WHERE id = ?")
      .bind(Date.now() + 1, me)
      .run();
    expect(await unseenCount(me)).toBe(0);
  });

  it("lists followers for fan-out", async () => {
    const me = await user();
    const fans = [await user(), await user()];
    for (const f of fans) await follow(f, me);
    expect((await followersOf(me)).sort()).toEqual(fans.sort());
  });
});
