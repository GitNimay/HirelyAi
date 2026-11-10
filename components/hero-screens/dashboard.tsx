import s from "./screens.module.css";
import { Logo, cx } from "./shared";

/* Dashboard: the feed, your profile and notifications (Doop frame YM7wWXbwMp) */

const Icon = ({ d, fill }: { d: string; fill?: string }) => (
  <svg className={s.icon} viewBox="0 0 24 24" style={fill ? { fill } : undefined}>
    <path d={d} />
  </svg>
);

const I = {
  home: "M3 10.5 12 3l9 7.5V20a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z",
  network:
    "M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8M22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75",
  jobs: "M4 7h16a1 1 0 0 1 1 1v11a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V8a1 1 0 0 1 1-1zM16 7V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v2M3 13h18",
  companies: "M3 21h18M5 21V5a2 2 0 0 1 2-2h6a2 2 0 0 1 2 2v16M15 9h4a2 2 0 0 1 2 2v10M9 7h2M9 11h2M9 15h2",
  bell: "M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9M10.3 21a1.94 1.94 0 0 0 3.4 0",
  me: "M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2M12 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8",
  photo:
    "M5 3h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2zM9 11a2 2 0 1 0 0-4 2 2 0 0 0 0 4M21 15l-5-5L5 21",
  video:
    "m16 13 5.2 3.5a.5.5 0 0 0 .8-.4V7.9a.5.5 0 0 0-.8-.4L16 11M4 6h10a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2z",
  like: "M19 14c1.49-1.46 3-3.21 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.76 0-3 .5-4.5 2-1.5-1.5-2.74-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.5 4.05 3 5.5l7 7z",
  comment: "M7.9 20A9 9 0 1 0 4 16.1L2 22z",
  repost: "m17 2 4 4-4 4M3 11v-1a4 4 0 0 1 4-4h14M7 22l-4-4 4-4M21 13v1a4 4 0 0 1-4 4H3",
  send: "M22 2 11 13M22 2l-7 20-4-9-9-4z",
};

const NAV = [
  { label: "Home", icon: I.home },
  { label: "My Network", icon: I.network },
  { label: "Jobs", icon: I.jobs },
  { label: "Companies", icon: I.companies },
  { label: "Notifications", icon: I.bell, badge: 3 },
  { label: "Me", icon: I.me },
];

const PEOPLE = {
  PN: { name: "Priya Nair", bg: "#D7E3F4", fg: "#1C3A5E" },
  RM: { name: "Rohan Mehta", bg: "#E3EDDF", fg: "#2B4A23" },
  KI: { name: "Kavya Iyer", bg: "#F1E4D8", fg: "#5A3A1E" },
};
type Who = keyof typeof PEOPLE;

const POSTS: {
  by: Who;
  ago: string;
  role: string;
  text: string;
  likes: number;
  liked?: boolean;
  comments: number;
  reposts?: number;
}[] = [
  {
    by: "PN",
    ago: "2h",
    role: "Engineering Manager at Northwind Labs",
    text: "We're hiring two frontend engineers in Pune. Every applicant gets a five-minute first-round interview and hears back within a week, no résumé black hole. Apply from our company page.",
    likes: 48,
    comments: 12,
  },
  {
    by: "RM",
    ago: "5h",
    role: "Data Engineer · Bengaluru",
    text: "Wrote up how we cut our nightly pipeline from 3 hours to 40 minutes: partition pruning, fewer shuffles, and one very boring index. Link in the comments.",
    likes: 126,
    liked: true,
    comments: 31,
    reposts: 9,
  },
];

const NOTIFICATIONS: { by: Who; text: string }[] = [
  { by: "PN", text: "shortlisted you for Senior Frontend Engineer after your AI interview" },
  { by: "RM", text: "liked your post" },
  { by: "KI", text: "started following you" },
];

function Me({ size, ring }: { size: number; ring?: boolean }) {
  return (
    <div
      className={s.av}
      style={{ width: size, height: size, ...(ring && { marginTop: -36, border: "4px solid var(--background)" }) }}
    >
      {/* eslint-disable-next-line @next/next/no-img-element -- 3 KB pre-cropped webp */}
      <img src="/landing/hero-avatar.webp" alt="" />
    </div>
  );
}

function Initials({ who, size, fontSize }: { who: Who; size: number; fontSize?: number }) {
  const p = PEOPLE[who];
  return (
    <div className={s.av} style={{ width: size, height: size, fontSize, background: p.bg, color: p.fg }}>
      {who}
    </div>
  );
}

export function DashboardScreen() {
  return (
    <div className={cx(s.screen, s.dash)}>
      <aside className={s.rail}>
        <div className={s.railLogo}>
          <Logo />
          Hire Excellence
        </div>
        <nav className={s.nav}>
          {NAV.map((n, i) => (
            <span key={n.label} data-anim="nav" className={cx(i === 0 && s.navOn)}>
              {n.badge ? (
                <span className={s.badgeWrap}>
                  <Icon d={n.icon} />
                  <span data-anim="badge" className={s.badge}>
                    {n.badge}
                  </span>
                </span>
              ) : (
                <Icon d={n.icon} />
              )}
              {n.label}
            </span>
          ))}
        </nav>
        <div className={s.railFoot}>
          <div className={s.postBtn}>Post</div>
          <div className={s.me}>
            <Me size={32} />
            <div className="flex-1">
              <p className={s.medium} style={{ lineHeight: "18px" }}>
                Aarav Shah
              </p>
              <p className={s.mute} style={{ fontSize: 12, lineHeight: "16px" }}>
                aa•••@gmail.com
              </p>
            </div>
            <svg
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="var(--muted)"
              strokeWidth="2"
              strokeLinecap="round"
            >
              <path d="m18 15-6-6-6 6" />
            </svg>
          </div>
        </div>
      </aside>

      <main className={s.feed}>
        <div className={s.tabs}>
          <span className={s.tabOn}>
            <span>For you</span>
          </span>
          <span>Following</span>
        </div>
        <section className={s.composer}>
          <Me size={40} />
          <div className="flex flex-1 flex-col gap-2">
            <p data-anim="composer" className={s.mute} style={{ paddingTop: 8, height: 52, lineHeight: "23px" }}>
              Share an update or opportunity
            </p>
            <div className={s.between}>
              <div className="flex gap-1">
                <span className={s.tool}>
                  <Icon d={I.photo} />
                  Photo
                </span>
                <span className={s.tool}>
                  <Icon d={I.video} />
                  Video
                </span>
              </div>
              <span className={s.composeBtn}>Post</span>
            </div>
          </div>
        </section>
        {POSTS.map((p) => (
          <article key={p.by} data-anim="post" className={s.post}>
            <div className="flex gap-3">
              <Initials who={p.by} size={40} />
              <div>
                <p>
                  <span className={s.medium}>{PEOPLE[p.by].name}</span> <span className={s.mute}>· {p.ago}</span>
                </p>
                <p className={s.mute} style={{ fontSize: 12, lineHeight: "16px" }}>
                  {p.role}
                </p>
                <p style={{ lineHeight: "23px", paddingTop: 8 }}>{p.text}</p>
              </div>
            </div>
            <div className={s.postActs}>
              <span data-anim="like" style={p.liked ? { color: "var(--danger)" } : undefined}>
                <Icon d={I.like} fill={p.liked ? "var(--danger)" : undefined} />
                <span>Like {p.likes}</span>
              </span>
              <span>
                <Icon d={I.comment} />
                Comment {p.comments}
              </span>
              <span>
                <Icon d={I.repost} />
                Repost{p.reposts ? ` ${p.reposts}` : ""}
              </span>
              <span>
                <Icon d={I.send} />
              </span>
            </div>
          </article>
        ))}
      </main>

      <aside className={s.right}>
        <section className={s.box}>
          <div
            className={cx(
              s.cover,
              "bg-[url(/landing/hero-clouds-dark.webp)] bg-cover bg-center light:bg-[url(/landing/hero-clouds.webp)]",
            )}
          />
          <div style={{ padding: "0 16px 16px" }}>
            <Me size={64} ring />
            <p className={s.medium} style={{ lineHeight: "18px", paddingTop: 8 }}>
              Aarav Shah
            </p>
            <p style={{ color: "var(--foreground)", paddingTop: 4 }}>
              Frontend engineer building fast, accessible web apps
            </p>
            <p className={s.mute} style={{ fontSize: 12, lineHeight: "16px", paddingTop: 4 }}>
              Pune, India
            </p>
          </div>
          <div style={{ borderTop: "1px solid var(--border)", padding: "8px 0" }}>
            <div className={s.stat}>
              <span className={s.mute}>Connections</span>
              <span className={s.link}>214</span>
            </div>
            <div className={s.stat}>
              <span className={s.mute}>Followers</span>
              <span className={s.link}>1,032</span>
            </div>
          </div>
        </section>
        <section className={s.box}>
          <div className={s.boxHead}>
            <span className={s.medium}>Notifications</span>
            <span style={{ fontSize: 12, color: "var(--link)" }}>See all</span>
          </div>
          {NOTIFICATIONS.map((n) => (
            <div key={n.by} data-anim="notification" className={s.notif}>
              <Initials who={n.by} size={32} fontSize={12} />
              <p>
                <span className={s.medium}>{PEOPLE[n.by].name}</span> {n.text}
              </p>
            </div>
          ))}
        </section>
      </aside>
    </div>
  );
}
