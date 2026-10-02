"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import * as actions from "@/app/dashboard/actions";
import { categoryOf, hasPreview, verb, who, type Category, type NotificationType } from "@/lib/notification-format";
import type { Notification } from "@/lib/notifications";
import { setParam, Tabs, useClientValue } from "./kit";
import { NotificationRowsSkeleton } from "./skeleton";
import { ago, Avatar, btnGhost, Icon, icons, type IconDef } from "./ui";
import { useRealtime } from "./use-realtime";

type Page = { items: Notification[]; next: string | null };
export type NotificationTab = "all" | Category;
type Tab = NotificationTab;

const TABS: { id: Tab; label: string }[] = [
  { id: "all", label: "All" },
  { id: "posts", label: "Posts" },
  { id: "network", label: "Network" },
  { id: "jobs", label: "Jobs" },
];

const ICON: Record<NotificationType, IconDef> = {
  like: icons.like, repost: icons.repost, comment: icons.comment, thread: icons.comment, post: icons.article,
  follow: icons.connect, invite: icons.connect, accept: icons.check,
  applicant: icons.file, app_viewed: icons.jobs, app_shortlisted: icons.check, app_rejected: icons.close, job: icons.jobs, job_closed: icons.jobs,
};

const newestFirst = (a: Notification, b: Notification) => b.at - a.at;

/** Split a newest-first list into Today / Earlier, dropping empty groups. `midnight` is null until mounted
    (the server doesn't know the viewer's time zone), so the first render is one plain list. */
function groups(items: Notification[], midnight: number | null): [string, Notification[]][] {
  if (midnight === null) return [["Notifications", items]];
  const today = items.filter((n) => n.at >= midnight);
  const earlier = items.filter((n) => n.at < midnight);
  return ([["Today", today], ["Earlier", earlier]] as [string, Notification[]][]).filter(([, l]) => l.length > 0);
}

/** Notifications: everything that happens to you, grouped LinkedIn/X style, live via /api/realtime. */
export function Notifications({ initial, initialTab = "all" }: { initial: Page; initialTab?: Tab }) {
  const [page, setPage] = useState(initial);
  const [tab, setTab] = useState<Tab>(initialTab);
  const midnight = useClientValue<number | null>(() => new Date().setHours(0, 0, 0, 0), null);
  const [loading, setLoading] = useState(false);

  const refresh = () => actions.loadNotifications().then(setPage, () => {});

  // Being here means they're seen: clears the badge on every open tab and device
  useEffect(() => {
    actions.markSeen().catch(() => {});
  }, []);

  useRealtime((e) => {
    if (e.t !== "notif") return;
    // A known notification (more likes on the same post) moves to the top with its new count
    setPage((p) => ({ ...p, items: [e.n, ...p.items.filter((n) => n.id !== e.n.id)].sort(newestFirst) }));
    actions.markSeen().catch(() => {});
  });

  // Events sent while the socket was down are gone, so resync whenever the tab comes back
  useEffect(() => {
    const onShow = () => {
      if (document.visibilityState !== "visible") return;
      refresh();
      actions.markSeen().catch(() => {});
    };
    document.addEventListener("visibilitychange", onShow);
    return () => document.removeEventListener("visibilitychange", onShow);
  }, []);

  async function more() {
    if (!page.next || loading) return;
    setLoading(true);
    try {
      const next = await actions.loadNotifications(page.next);
      setPage((p) => ({ items: [...p.items, ...next.items.filter((n) => !p.items.some((x) => x.id === n.id))], next: next.next }));
    } finally {
      setLoading(false);
    }
  }

  const patch = (fn: (n: Notification) => Notification | null) =>
    setPage((p) => ({ ...p, items: p.items.flatMap((n) => fn(n) ?? []) }));

  function open(n: Notification) {
    if (n.read) return;
    patch((x) => (x.id === n.id ? { ...x, read: true } : x));
    actions.markRead(n.id).catch(refresh);
  }

  function remove(n: Notification) {
    patch((x) => (x.id === n.id ? null : x));
    actions.deleteNotification(n.id).catch(refresh);
  }

  function readAll() {
    patch((x) => ({ ...x, read: true }));
    actions.markAllRead().catch(refresh);
  }

  const items = tab === "all" ? page.items : page.items.filter((n) => categoryOf(n.type) === tab);

  return (
    <>
      <header className="sticky top-0 z-10 border-b border-border bg-background/80 backdrop-blur">
        <div className="flex h-14 items-center justify-between px-4">
          <h1 className="text-sm font-semibold">Notifications</h1>
          {page.items.some((n) => !n.read) && (
            <button type="button" className={btnGhost} onClick={readAll}>
              <Icon d={icons.check} size={14} />
              Mark all as read
            </button>
          )}
        </div>
        <Tabs
          label="Notification types"
          tabs={TABS}
          value={tab}
          onChange={(t) => {
            setTab(t);
            setParam("tab", t === "all" ? null : t);
          }}
        />
      </header>

      {items.length === 0 ? (
        <div className="flex flex-col items-center px-4 py-24 text-center">
          <Icon d={icons.notifications} size={28} className="text-muted" />
          <p className="mt-4 text-sm font-medium">{tab === "all" ? "No notifications yet" : "Nothing here"}</p>
          <p className="mt-1 text-sm text-muted">
            {tab === "all" ? "Likes, comments, invitations and job updates show up here the moment they happen." : "Nothing in this category yet."}
          </p>
        </div>
      ) : (
        groups(items, midnight).map(([label, list]) => (
          <section key={label} aria-label={label}>
            {midnight !== null && <h2 className="border-b border-border px-4 py-2 text-xs font-medium text-muted">{label}</h2>}
            <ul>
              {list.map((n) => (
                <Row key={n.id} n={n} onOpen={open} onRemove={remove} />
              ))}
            </ul>
          </section>
        ))
      )}

      {loading ? (
        <NotificationRowsSkeleton n={3} />
      ) : (
        page.next && (
          <button type="button" onClick={more} className="h-12 w-full text-sm text-muted transition-colors hover:bg-surface hover:text-foreground">
            Show earlier notifications
          </button>
        )
      )}
    </>
  );
}

function Row({ n, onOpen, onRemove }: { n: Notification; onOpen: (n: Notification) => void; onRemove: (n: Notification) => void }) {
  const first = n.actors[0];
  return (
    <li className="group relative border-b border-border">
      <Link
        href={n.link}
        onClick={() => onOpen(n)}
        className={`flex gap-3 px-4 py-3 pr-12 outline-none transition-colors focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring ${n.read ? "hover:bg-surface" : "bg-surface hover:bg-surface-hover"}`}
      >
        <span className="relative shrink-0 self-start">
          <Avatar name={first?.name ?? "?"} src={first?.imageUrl ?? undefined} size={40} />
          <span className="absolute -bottom-1 -right-1 flex size-[18px] items-center justify-center rounded-full border-2 border-background bg-surface-hover text-foreground">
            <Icon d={ICON[n.type]} size={10} />
          </span>
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-sm">
            <span className="font-medium">{who(n.actors, n.count)}</span> <span className="text-muted">{verb(n.type, n.body)}</span>
          </span>
          {hasPreview(n.type) && n.body && <span className="mt-0.5 line-clamp-2 block text-xs text-muted">{n.body}</span>}
          <span className="mt-1 flex items-center gap-2 text-xs text-muted">
            {ago(n.at)}
            {!n.read && (
              <>
                <span aria-hidden className="size-1.5 rounded-full bg-link" />
                <span className="sr-only">Unread</span>
              </>
            )}
          </span>
        </span>
      </Link>
      <button
        type="button"
        title="Delete notification"
        aria-label="Delete notification"
        onClick={() => onRemove(n)}
        className={`${btnGhost} absolute right-3 top-3 px-2 sm:opacity-0 sm:group-hover:opacity-100 focus-visible:opacity-100`}
      >
        <Icon d={icons.trash} size={14} />
      </button>
    </li>
  );
}
