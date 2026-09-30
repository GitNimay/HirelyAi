"use client";

import { useEffect, useState } from "react";
import * as actions from "@/app/dashboard/actions";
import type { Network as Net, Person } from "@/lib/network";
import type { NetEvent } from "@/lib/realtime";
import { ago, Avatar, btn, btnGhost, btnOutline, btnPrimary, Icon, icons } from "./ui";
import { useRealtime } from "./use-realtime";

type Tab = "grow" | "connections" | "sent";

const without = (list: Person[], id: string) => list.filter((p) => p.id !== id);
const upsert = (list: Person[], p: Person) => [p, ...without(list, p.id)];

/** Same transition for our own clicks (instant) and for pushed events (other tabs, other people); applying twice is harmless. */
function apply(net: Net, { kind, dir, person }: Pick<NetEvent, "kind" | "dir" | "person">): Net {
  const p = { ...person, at: person.at || Date.now() }; // suggestions carry no timestamp yet
  switch (kind) {
    case "invite":
      return dir === "in"
        ? { ...net, received: upsert(net.received, p), suggestions: without(net.suggestions, p.id) }
        : { ...net, sent: upsert(net.sent, p), suggestions: without(net.suggestions, p.id) };
    case "uninvite":
      return { ...net, received: without(net.received, p.id), sent: without(net.sent, p.id) };
    case "connect":
      return {
        ...net,
        received: without(net.received, p.id),
        sent: without(net.sent, p.id),
        suggestions: without(net.suggestions, p.id),
        connections: upsert(net.connections, p),
      };
    case "disconnect":
      return { ...net, connections: without(net.connections, p.id) };
    default:
      return net;
  }
}

function why(p: Person) {
  if (p.mutual) return `${p.mutual} mutual connection${p.mutual === 1 ? "" : "s"}`;
  return p.followsYou ? "Follows you" : null;
}

/** My Network: invitations, people you may know, connections, sent requests. Live via /api/realtime. */
export function Network({ initial }: { initial: Net }) {
  const [net, setNet] = useState(initial);
  const [tab, setTab] = useState<Tab>("grow");
  const [busy, setBusy] = useState<Set<string>>(new Set());
  const [allInvites, setAllInvites] = useState(false);
  const [query, setQuery] = useState("");
  const [find, setFind] = useState("");
  const [found, setFound] = useState<Person[] | null>(null);

  const refresh = () => actions.loadNetwork().then(setNet, () => {});

  useRealtime((e) => {
    if (e.t !== "net") return;
    setNet((n) => ({ ...apply(n, e), counts: e.counts }));
  });

  // Events sent while the socket was down are gone, so resync whenever the tab comes back
  useEffect(() => {
    const onShow = () => document.visibilityState === "visible" && refresh();
    document.addEventListener("visibilitychange", onShow);
    return () => document.removeEventListener("visibilitychange", onShow);
  }, []);

  // Search everyone on the platform, debounced; a newer keystroke cancels an older request's result
  useEffect(() => {
    const q = find.trim();
    let live = true;
    const t = setTimeout(() => {
      if (q) actions.findPeople(q).then((r) => live && setFound(r), () => live && setFound([]));
      else setFound(null);
    }, q ? 250 : 0);
    return () => {
      live = false;
      clearTimeout(t);
    };
  }, [find]);

  /** Update the UI now, then call the server; on failure resync from the server. */
  async function act(p: Person, kind: NetEvent["kind"], dir: NetEvent["dir"], call: (id: string) => Promise<unknown>) {
    setBusy((s) => new Set(s).add(p.id));
    setNet((n) => apply(n, { kind, dir, person: p }));
    try {
      await call(p.id);
    } catch {
      await refresh();
    } finally {
      setBusy((s) => {
        const next = new Set(s);
        next.delete(p.id);
        return next;
      });
    }
  }

  const accept = (p: Person) => act(p, "connect", "out", actions.acceptInvite);
  const ignore = (p: Person) => act(p, "uninvite", "out", actions.ignoreInvite);
  const invite = (p: Person) => act(p, "invite", "out", actions.connect);
  const withdraw = (p: Person) => act(p, "uninvite", "out", actions.withdrawInvite);
  const remove = (p: Person) => confirm(`Remove ${p.name} from your connections?`) && act(p, "disconnect", "out", actions.removeConnection);

  /** The one button that fits where you stand with this person. */
  function personAction(p: Person) {
    const off = busy.has(p.id);
    if (net.connections.some((c) => c.id === p.id))
      return (
        <span className={`${btn} text-muted`}>
          <Icon d={icons.check} size={14} />
          Connected
        </span>
      );
    if (net.sent.some((c) => c.id === p.id))
      return (
        <button type="button" title="Withdraw invitation" className={btnOutline} disabled={off} onClick={() => withdraw(p)}>
          <Icon d={icons.clock} size={14} />
          Pending
        </button>
      );
    if (net.received.some((c) => c.id === p.id))
      return <button type="button" className={btnPrimary} disabled={off} onClick={() => accept(p)}>Accept</button>;
    return (
      <button type="button" className={btnOutline} disabled={off} onClick={() => invite(p)}>
        <Icon d={icons.connect} size={14} />
        Connect
      </button>
    );
  }

  const { counts } = net;
  const tabs: { id: Tab; label: string; count?: number }[] = [
    { id: "grow", label: "Grow", count: net.received.length || undefined },
    { id: "connections", label: "Connections" },
    { id: "sent", label: "Sent", count: net.sent.length || undefined },
  ];
  const q = query.trim().toLowerCase();
  const connections = q ? net.connections.filter((p) => `${p.name} ${p.headline ?? ""}`.toLowerCase().includes(q)) : net.connections;
  const invites = allInvites ? net.received : net.received.slice(0, 3);

  return (
    <>
      <header className="sticky top-0 z-10 border-b border-border bg-background/80 backdrop-blur">
        <div className="flex h-14 items-center justify-between px-4">
          <h1 className="text-sm font-semibold">My Network</h1>
          <dl className="flex gap-4 text-xs text-muted">
            {(["connections", "following", "followers"] as const).map((k) => (
              <div key={k} className="flex gap-1">
                <dt className="sr-only">{k}</dt>
                <dd className="font-medium tabular-nums text-foreground">{counts[k]}</dd>
                <span aria-hidden className="capitalize">{k}</span>
              </div>
            ))}
          </dl>
        </div>
        <nav className="flex px-2" aria-label="Network sections">
          {tabs.map((t) => (
            <button
              key={t.id}
              type="button"
              aria-pressed={tab === t.id}
              onClick={() => setTab(t.id)}
              className={`relative flex h-10 items-center gap-1.5 px-3 text-sm transition-colors hover:text-foreground ${tab === t.id ? "font-medium text-foreground" : "text-muted"}`}
            >
              {t.label}
              {t.count !== undefined && <span className="rounded-full bg-surface-hover px-1.5 text-xs tabular-nums text-muted">{t.count}</span>}
              {tab === t.id && <span className="absolute inset-x-3 bottom-0 h-0.5 rounded-full bg-link" />}
            </button>
          ))}
        </nav>
      </header>

      {tab === "grow" && (
        <div className="border-b border-border px-4 py-3">
          <label className="flex h-9 items-center gap-2 rounded-md border border-border px-3 text-muted focus-within:border-ring">
            <Icon d={icons.search} size={16} />
            <input
              type="search"
              value={find}
              onChange={(e) => setFind(e.target.value)}
              placeholder="Search people by name or headline"
              aria-label="Search people"
              className="min-w-0 flex-1 bg-transparent text-sm text-foreground placeholder:text-muted outline-none"
            />
          </label>
        </div>
      )}

      {tab === "grow" && find.trim() && (
        <Section title="People" count={found?.length} last>
          {found === null ? (
            <Empty>Searching…</Empty>
          ) : found.length === 0 ? (
            <Empty>No one matches “{find.trim()}”.</Empty>
          ) : (
            <ul className="divide-y divide-border">
              {found.map((p) => (
                <Row key={p.id} person={p} meta={why(p) ?? ""}>
                  {personAction(p)}
                </Row>
              ))}
            </ul>
          )}
        </Section>
      )}

      {tab === "grow" && !find.trim() && (
        <>
          <Section title="Invitations" count={net.received.length}>
            {net.received.length === 0 ? (
              <Empty>No pending invitations.</Empty>
            ) : (
              <>
                <ul className="divide-y divide-border">
                  {invites.map((p) => (
                    <Row key={p.id} person={p} meta={[why(p), ago(p.at)].filter(Boolean).join(" · ")}>
                      <button type="button" className={btnGhost} disabled={busy.has(p.id)} onClick={() => ignore(p)}>Ignore</button>
                      <button type="button" className={btnPrimary} disabled={busy.has(p.id)} onClick={() => accept(p)}>Accept</button>
                    </Row>
                  ))}
                </ul>
                {net.received.length > 3 && (
                  <button type="button" onClick={() => setAllInvites((v) => !v)} className="h-10 w-full border-t border-border text-sm text-muted transition-colors hover:bg-surface hover:text-foreground">
                    {allInvites ? "Show less" : `Show all ${net.received.length}`}
                  </button>
                )}
              </>
            )}
          </Section>

          <Section title="People you may know" last>
            {net.suggestions.length === 0 ? (
              <Empty>No suggestions right now. Check back as more people join.</Empty>
            ) : (
              <ul className="divide-y divide-border">
                {net.suggestions.map((p) => (
                  <Row key={p.id} person={p} meta={why(p) ?? ""}>
                    {personAction(p)}
                  </Row>
                ))}
              </ul>
            )}
          </Section>
        </>
      )}

      {tab === "connections" && (
        <Section
          title="Connections"
          count={counts.connections}
          last
          action={
            <label className="flex h-8 w-48 items-center gap-2 rounded-md border border-border px-2 text-muted focus-within:border-ring">
              <Icon d={icons.search} size={14} />
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search connections"
                aria-label="Search connections"
                className="min-w-0 flex-1 bg-transparent text-sm text-foreground placeholder:text-muted outline-none"
              />
            </label>
          }
        >
          {connections.length === 0 ? (
            <Empty>{q ? `No connections match “${query}”.` : "No connections yet. Start with People you may know."}</Empty>
          ) : (
            <ul className="divide-y divide-border">
              {connections.map((p) => (
                <Row key={p.id} person={p} meta={`Connected ${ago(p.at)}`}>
                  <button type="button" title="Remove connection" aria-label={`Remove ${p.name}`} className={`${btnGhost} px-2`} disabled={busy.has(p.id)} onClick={() => remove(p)}>
                    <Icon d={icons.close} size={16} />
                  </button>
                </Row>
              ))}
            </ul>
          )}
        </Section>
      )}

      {tab === "sent" && (
        <Section title="Sent invitations" count={net.sent.length} last>
          {net.sent.length === 0 ? (
            <Empty>No pending invitations sent.</Empty>
          ) : (
            <ul className="divide-y divide-border">
              {net.sent.map((p) => (
                <Row key={p.id} person={p} meta={`Sent ${ago(p.at)}`}>
                  <button type="button" className={btnOutline} disabled={busy.has(p.id)} onClick={() => withdraw(p)}>Withdraw</button>
                </Row>
              ))}
            </ul>
          )}
        </Section>
      )}
    </>
  );
}

function Section({ title, count, action, last, children }: { title: string; count?: number; action?: React.ReactNode; last?: boolean; children: React.ReactNode }) {
  return (
    <section className={last ? "" : "border-b border-border"}>
      <div className="flex h-12 items-center justify-between gap-4 px-4">
        <h2 className="text-sm font-semibold">
          {title} {count !== undefined && <span className="font-normal tabular-nums text-muted">{count}</span>}
        </h2>
        {action}
      </div>
      {children}
    </section>
  );
}

function Row({ person: p, meta, children }: { person: Person; meta: string; children: React.ReactNode }) {
  return (
    <li className="flex items-center gap-3 px-4 py-3">
      <Avatar name={p.name} src={p.imageUrl ?? undefined} size={48} />
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium">{p.name}</p>
        {p.headline && <p className="truncate text-xs text-muted">{p.headline}</p>}
        {meta && <p className="truncate text-xs text-muted">{meta}</p>}
      </div>
      <div className="flex items-center gap-2">{children}</div>
    </li>
  );
}

const Empty = ({ children }: { children: React.ReactNode }) => <p className="px-4 pb-6 text-sm text-muted">{children}</p>;
