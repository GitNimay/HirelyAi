"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useId, useRef, useState } from "react";
import { addAdmin, createCompany, findCompanies, removeAdmin, toggleCompanyFollow, updateCompany, verifyWorkEmail, type PageInput } from "@/app/company/actions";
import type { Admin, Company, CompanyCard } from "@/lib/companies";
import { INDUSTRIES, LIMITS, SIZES, TYPES } from "@/lib/company-fields";
import { cropImage } from "@/lib/crop-image";
import { AVATAR_PX, COVER_PX, maskEmail, MAX_PROFILE_IMAGE_BYTES, PROFILE_IMAGE_TYPES, profileHref, shortUrl, slugify } from "@/lib/profile-fields";
import { field, Field } from "./jobs";
import { ask, BackButton, leaveIfClean, Select, TabLabel, toast, useUnsavedGuard } from "./kit";
import { uploadImage } from "./profile";
import { Avatar, backBtn, btnGhost, btnLg, btnOutline, btnPrimary, CompanyLogo, Icon, icons } from "./ui";

const errMsg = (e: unknown) => (e instanceof Error && e.message ? e.message : "Something went wrong");
const camera = "M14.5 4h-5L7 7H4a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2h-3zM12 17a4 4 0 1 0 0-8 4 4 0 0 0 0 8";
const control = `${field} max-sm:text-base`; // 16px on phones so iOS doesn't zoom on focus
const select = `${control} bg-surface`;

/** Cover, logo, name, actions and tabs of a company page. The tab pages render below it. */
export function CompanyHeader({ company: c }: { company: Company }) {
  const router = useRouter();
  const pathname = usePathname();
  const [following, setFollowing] = useState(c.me.following);
  const [busy, setBusy] = useState(false);
  const base = `/company/${c.slug}`;
  const followers = c.followers + Number(following) - Number(c.me.following);
  const tabs = [
    { href: base, label: "About" },
    { href: `${base}/posts`, label: "Posts" },
    { href: `${base}/jobs`, label: c.counts.jobs ? `Jobs (${c.counts.jobs})` : "Jobs" },
    { href: `${base}/people`, label: "People" },
  ];

  async function follow() {
    setBusy(true);
    setFollowing(!following);
    try {
      setFollowing((await toggleCompanyFollow(c.id)).following);
    } catch {
      setFollowing(following);
      toast("Couldn't update. Try again.", "error");
    } finally {
      setBusy(false);
    }
  }

  async function verify() {
    setBusy(true);
    const r = await verifyWorkEmail(c.id).catch(() => ({ error: "Couldn't check. Try again." }));
    setBusy(false);
    if ("error" in r) {
      if (await ask({ title: "Verify your work email", body: r.error, confirm: "Open account settings" })) router.push("/settings/account");
      return;
    }
    toast(`Verified with ${maskEmail(r.email)}`);
    router.refresh();
  }

  return (
    <>
      <header className="sticky top-14 sm:top-0 z-10 flex h-14 items-center gap-4 border-b border-border bg-background/80 px-4 backdrop-blur">
        <BackButton />
        <div className="min-w-0 flex-1">
          <h1 className="truncate text-sm font-medium leading-tight">{c.name}</h1>
          <p className="text-xs text-muted">Company page</p>
        </div>
      </header>

      <section>
        <div className="aspect-[5/2] bg-gradient-to-br from-surface-hover to-surface sm:aspect-[4/1]">
          {/* eslint-disable-next-line @next/next/no-img-element -- auth-gated R2 media, served by /api/media */}
          {c.coverUrl && <img src={c.coverUrl} alt="" className="size-full object-cover" />}
        </div>
        <div className="px-4">
          <div className="flex items-end justify-between gap-3">
            <div className="-mt-10 rounded-lg border-4 border-background bg-background">
              <CompanyLogo name={c.name} src={c.logoUrl} size={80} />
            </div>
            <div className="flex flex-wrap justify-end gap-2 pt-3">
              {c.me.role && <Link href={`${base}/edit`} className={btnOutline}><Icon d={icons.edit} size={14} />Edit page</Link>}
              <button type="button" aria-pressed={following} disabled={busy} onClick={follow} className={following ? btnOutline : btnPrimary}>
                {following ? "Following" : <><Icon d={icons.plus} size={14} />Follow</>}
              </button>
            </div>
          </div>
          <div className="mt-3">
            <h2 className="flex min-w-0 items-center gap-1.5 font-display text-xl font-normal leading-tight">
              <span className="min-w-0 break-words">{c.name}</span>
              {c.verified && <span title={`Run by verified ${c.domain} employees`} className="shrink-0 text-link"><Icon d={icons.verified} size={18} /></span>}
            </h2>
            {c.tagline && <p className="mt-1 break-words text-sm">{c.tagline}</p>}
            <p className="mt-1 break-words text-sm text-muted">
              {[c.industry, c.hq, `${followers} ${followers === 1 ? "follower" : "followers"}`, c.counts.people > 0 && `${c.counts.people} on Hire Excellence`].filter(Boolean).join(" · ")}
            </p>
          </div>
          <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2 text-sm">
            {c.website && (
              <a href={c.website} target="_blank" rel="noopener noreferrer nofollow" className="max-w-full truncate text-link underline-offset-2 hover:underline">{shortUrl(c.website)}</a>
            )}
            {c.me.verified ? (
              <span className="flex items-center gap-1 text-success"><Icon d={icons.check} size={14} />You work here (verified)</span>
            ) : c.domain && (
              <button type="button" disabled={busy} onClick={verify} className="flex items-center gap-1 text-muted transition-colors duration-150 hover:text-foreground">
                <Icon d={icons.verified} size={14} />Work here? Verify your @{c.domain} email
              </button>
            )}
          </div>
        </div>

        <nav aria-label="Company sections" className="mt-3 flex overflow-x-auto whitespace-nowrap border-b border-border [scrollbar-width:none] sm:overflow-visible [&::-webkit-scrollbar]:hidden">
          {tabs.map((t) => {
            const active = pathname === t.href;
            return (
              <Link
                key={t.href}
                href={t.href}
                aria-current={active ? "page" : undefined}
                className={`flex h-12 flex-1 items-center justify-center px-4 text-sm outline-none sm:px-0 transition-colors duration-150 hover:bg-surface hover:text-foreground focus-visible:bg-surface ${active ? "font-medium text-foreground" : "text-muted"}`}
              >
                <TabLabel on={active}>{t.label}</TabLabel>
              </Link>
            );
          })}
        </nav>
      </section>
    </>
  );
}

type Picked = { blob: Blob; url: string };

/** Create a page (no `company`) or edit one. Logo is cropped 1:1 and the cover 3:1 in the browser, then uploaded. */
export function CompanyForm({ company: c }: { company?: Company }) {
  const router = useRouter();
  const back = c ? `/company/${c.slug}` : "/dashboard/companies";
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [dirty, setDirty] = useState(false);
  const [logo, setLogo] = useState<Picked | null>(null);
  const [cover, setCover] = useState<Picked | null>(null);
  const [coverRemoved, setCoverRemoved] = useState(false);
  const [name, setName] = useState(c?.name ?? "");
  const [slug, setSlug] = useState(c?.slug ?? "");
  const [slugTouched, setSlugTouched] = useState(!!c);
  const logoInput = useRef<HTMLInputElement>(null);
  const coverInput = useRef<HTMLInputElement>(null);
  const unsaved = dirty || !!logo || !!cover || coverRemoved;
  useUnsavedGuard(unsaved && !busy);

  function leave(e: React.MouseEvent) {
    if (!unsaved) return;
    e.preventDefault();
    leaveIfClean(true).then((ok) => ok && router.push(back));
  }

  async function pick(file: File | undefined, size: { w: number; h: number }, set: (p: Picked) => void) {
    if (!file) return;
    setError("");
    if (!PROFILE_IMAGE_TYPES.includes(file.type)) return setError("Use a JPEG, PNG or WebP image");
    if (file.size > MAX_PROFILE_IMAGE_BYTES * 2) return setError("That image is too large (max 10 MB)");
    try {
      const blob = await cropImage(file, size.w, size.h);
      set({ blob, url: URL.createObjectURL(blob) });
    } catch (e) {
      setError(errMsg(e));
    }
  }

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const val = (k: string) => String(fd.get(k) ?? "");
    setBusy(true);
    setError("");
    try {
      const [logoKey, coverKey] = await Promise.all([logo && uploadImage(logo.blob, "company"), cover && uploadImage(cover.blob, "company")]);
      const input: PageInput = {
        name, slug, tagline: val("tagline"), about: val("about"), website: val("website"), industry: val("industry"), size: val("size"), type: val("type"),
        hq: val("hq"), founded: val("founded"), specialties: val("specialties"),
        logoKey: logoKey || undefined, coverKey: coverKey || undefined, removeCover: coverRemoved && !cover,
      };
      const res = c ? await updateCompany(c.id, input) : await createCompany(input);
      if ("error" in res) throw new Error(res.error);
      setDirty(false);
      toast(c ? "Page saved" : "Page created");
      router.push(`/company/${res.slug}`);
      router.refresh();
    } catch (err) {
      setError(errMsg(err));
      setBusy(false);
    }
  }

  const coverSrc = cover?.url ?? (coverRemoved ? null : c?.coverUrl);
  const overlay = "flex size-9 items-center justify-center rounded-full bg-black/60 text-white transition-colors hover:bg-black/80 disabled:opacity-50";
  const options = (list: string[]) => [{ value: "", label: "Choose…" }, ...list.map((v) => ({ value: v, label: v }))];

  return (
    <form onSubmit={submit} onChange={() => setDirty(true)} className="space-y-4 pb-8">
      <header className="sticky top-14 sm:top-0 z-10 flex h-14 items-center gap-4 border-b border-border bg-background/80 px-4 backdrop-blur">
        <Link href={back} onClick={leave} aria-label="Back" className={backBtn}><Icon d={icons.back} size={18} /></Link>
        <h1 className="min-w-0 flex-1 truncate text-sm font-medium">{c ? "Edit page" : "Create a company page"}</h1>
        <button aria-busy={busy} type="submit" className={btnPrimary} disabled={busy}>{c ? "Save" : "Create page"}</button>
      </header>

      <div className="relative aspect-[5/2] bg-gradient-to-br from-surface-hover to-surface sm:aspect-[4/1]">
        {/* eslint-disable-next-line @next/next/no-img-element -- blob preview or auth-gated R2 media */}
        {coverSrc && <img src={coverSrc} alt="" className="size-full object-cover" />}
        <div className="absolute inset-0 flex items-center justify-center gap-2">
          <button type="button" aria-label="Change cover image" disabled={busy} onClick={() => coverInput.current?.click()} className={overlay}><Icon d={camera} size={18} /></button>
          {coverSrc && (
            <button type="button" aria-label="Remove cover image" disabled={busy} onClick={() => (setCover(null), setCoverRemoved(true))} className={overlay}><Icon d={icons.close} size={18} /></button>
          )}
        </div>
        <input ref={coverInput} type="file" hidden accept={PROFILE_IMAGE_TYPES.join()} onChange={(e) => (pick(e.target.files?.[0], COVER_PX, (p) => (setCover(p), setCoverRemoved(false))), (e.target.value = ""))} />
      </div>
      <div className="px-4">
        <div className="relative -mt-12 w-fit rounded-lg border-4 border-background bg-background">
          <CompanyLogo name={name || "?"} src={logo?.url ?? c?.logoUrl} size={80} />
          <button type="button" aria-label="Change logo" disabled={busy} onClick={() => logoInput.current?.click()} className={`${overlay} absolute inset-0 m-auto`}><Icon d={camera} size={18} /></button>
          <input ref={logoInput} type="file" hidden accept={PROFILE_IMAGE_TYPES.join()} onChange={(e) => (pick(e.target.files?.[0], AVATAR_PX, setLogo), (e.target.value = ""))} />
        </div>
      </div>

      <div className="space-y-4 px-4">
        <Field label="Name">
          <input
            required
            autoFocus={!c}
            maxLength={LIMITS.name}
            value={name}
            onChange={(e) => (setName(e.target.value), !slugTouched && setSlug(slugify(e.target.value).replace(/-member$/, "")))}
            placeholder="Acme Inc."
            className={control}
          />
        </Field>
        <Field label="Page URL" hint="3-30 letters, numbers, hyphens">
          <div className="flex h-10 items-center rounded-md border border-border pl-3 text-sm text-muted transition-colors focus-within:border-ring">
            <span>/company/</span>
            <input
              required
              minLength={3}
              maxLength={30}
              pattern="[a-zA-Z0-9]+(-[a-zA-Z0-9]+)*"
              value={slug}
              onChange={(e) => (setSlug(e.target.value), setSlugTouched(true))}
              autoCapitalize="none"
              spellCheck={false}
              className="h-full min-w-0 flex-1 bg-transparent px-1 text-foreground outline-none max-sm:text-base"
            />
          </div>
        </Field>
        <Field label="Tagline" hint="optional">
          <input name="tagline" maxLength={LIMITS.tagline} defaultValue={c?.tagline ?? ""} placeholder="What the company does, in one line" className={control} />
        </Field>
        <Field label="Website" hint="employees verify with an email on this domain">
          <input name="website" maxLength={LIMITS.website} defaultValue={c?.website ?? ""} placeholder="acme.com" inputMode="url" className={control} />
        </Field>
        <div className="grid gap-4 sm:grid-cols-3">
          <Field label="Industry"><Select name="industry" defaultValue={c?.industry ?? ""} className={select} options={options(INDUSTRIES)} /></Field>
          <Field label="Company size"><Select name="size" defaultValue={c?.size ?? ""} className={select} options={options(SIZES.map((s) => s))} /></Field>
          <Field label="Type"><Select name="type" defaultValue={c?.type ?? ""} className={select} options={options(TYPES)} /></Field>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Headquarters" hint="optional">
            <input name="hq" maxLength={LIMITS.hq} defaultValue={c?.hq ?? ""} placeholder="Pune, India" className={control} />
          </Field>
          <Field label="Founded" hint="optional">
            <input name="founded" type="number" min={1600} max={new Date().getFullYear()} defaultValue={c?.founded ?? ""} placeholder="2015" className={control} />
          </Field>
        </div>
        <Field label="Specialties" hint="comma separated">
          <input name="specialties" defaultValue={c?.specialties.join(", ") ?? ""} placeholder="Cloud, AI, Payments" className={control} />
        </Field>
        <Field label="About" hint="optional">
          <textarea name="about" rows={6} maxLength={LIMITS.about} defaultValue={c?.about ?? ""} className={`${control} h-auto resize-y py-2 leading-relaxed`} />
        </Field>
        {!c && <p className="text-xs text-muted">By creating this page you confirm you&apos;re allowed to act on behalf of this company. You&apos;ll be its owner.</p>}
        {error && <p role="alert" className="text-sm text-danger">{error}</p>}
        <div className="flex justify-end gap-2">
          <Link href={back} onClick={leave} className={`${btnGhost} ${btnLg}`}>Cancel</Link>
          <button aria-busy={busy} type="submit" className={`${btnPrimary} ${btnLg}`} disabled={busy}>{c ? "Save" : "Create page"}</button>
        </div>
      </div>
    </form>
  );
}

/** Edit page: who runs the page. Owners add admins by handle and remove them; anyone can step down. */
export function AdminList({ company, admins, viewerId }: { company: Company; admins: Admin[]; viewerId: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [handle, setHandle] = useState("");
  const owner = company.me.role === "owner";

  async function run(call: () => Promise<{ ok: true } | { error: string }>, done: string) {
    setBusy(true);
    const r = await call().catch(() => ({ error: "Couldn't update. Try again." }));
    setBusy(false);
    if ("error" in r) return toast(r.error, "error");
    toast(done);
    setHandle("");
    router.refresh();
  }

  return (
    <section className="space-y-3 border-t border-border px-4 py-6">
      <div>
        <h2 className="text-sm font-medium">Page admins</h2>
        <p className="text-xs text-muted">Admins edit the page and post as the company. Keep at least two, like LinkedIn recommends.</p>
      </div>
      <ul className="divide-y divide-border rounded-lg border border-border">
        {admins.map((a) => (
          <li key={a.id} className="flex items-center gap-3 px-3 py-2">
            <Avatar name={a.name} src={a.imageUrl ?? undefined} size={32} />
            <Link href={profileHref(a)} className="min-w-0 flex-1 truncate text-sm font-medium hover:underline">{a.name}</Link>
            <span className="shrink-0 text-xs capitalize text-muted">{a.role}</span>
            {(owner || a.id === viewerId) && (
              <button
                type="button"
                disabled={busy}
                className={btnGhost}
                onClick={async () =>
                  (await ask({ title: a.id === viewerId ? "Leave this page?" : `Remove ${a.name}?`, body: "They can be added again later.", confirm: "Remove", danger: true })) &&
                  run(() => removeAdmin(company.id, a.id), "Admin removed")
                }
              >
                {a.id === viewerId ? "Leave" : "Remove"}
              </button>
            )}
          </li>
        ))}
      </ul>
      {owner && (
        <form className="flex flex-col gap-2 sm:flex-row" onSubmit={(e) => (e.preventDefault(), run(() => addAdmin(company.id, handle), "Admin added"))}>
          <input value={handle} onChange={(e) => setHandle(e.target.value)} required placeholder="Profile handle, e.g. ada-lovelace" aria-label="Handle" className={control} />
          <button type="submit" disabled={busy} className={`${btnOutline} ${btnLg}`}>Add admin</button>
        </form>
      )}
    </section>
  );
}

/**
 * A company text field with page suggestions (LinkedIn's experience typeahead). Typing frees the link; picking a page
 * links it (its logo shows on the profile). Anything without a page stays plain text with a grey logo.
 */
export function CompanyPicker({ value, companyId, logoUrl, onChange, invalid }: {
  value: string; companyId?: string; logoUrl?: string | null; onChange: (company: string, companyId?: string, logoUrl?: string | null) => void; invalid?: boolean;
}) {
  const [hits, setHits] = useState<CompanyCard[]>([]);
  const [open, setOpen] = useState(false);
  const listId = useId();

  useEffect(() => {
    if (!open || value.trim().length < 2) return;
    const t = setTimeout(() => findCompanies(value).then(setHits, () => {}), 200);
    return () => clearTimeout(t);
  }, [value, open]);

  const shown = open && value.trim().length >= 2 ? hits : [];
  return (
    <div className="relative">
      <div className={`flex h-10 items-center gap-2 rounded-md border px-2 transition-colors focus-within:border-ring ${invalid ? "border-danger" : "border-border"}`}>
        <CompanyLogo name={value || "?"} src={companyId ? logoUrl : null} size={24} />
        <input
          value={value}
          onChange={(e) => (onChange(e.target.value), setOpen(true))}
          onFocus={() => setOpen(true)}
          onBlur={() => setTimeout(() => setOpen(false), 150)}
          maxLength={100}
          role="combobox"
          aria-controls={listId}
          aria-expanded={shown.length > 0}
          aria-autocomplete="list"
          placeholder="Search or type a company"
          className="h-full min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-muted max-sm:text-base"
        />
        {companyId && <span className="shrink-0 text-xs text-success">Linked</span>}
      </div>
      {shown.length > 0 && (
        <ul id={listId} role="listbox" className="absolute inset-x-0 top-11 z-20 max-h-64 overflow-auto rounded-md border border-border bg-background py-1 shadow-lg">
          {shown.map((h) => (
            <li key={h.id} role="option" aria-selected={h.id === companyId}>
              <button type="button" onMouseDown={(e) => e.preventDefault()} onClick={() => (onChange(h.name, h.id, h.logoUrl), setOpen(false))} className="flex w-full items-center gap-2.5 px-3 py-2 text-left text-sm transition-colors hover:bg-surface-hover">
                <CompanyLogo name={h.name} src={h.logoUrl} size={28} />
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-medium">{h.name}</span>
                  {h.industry && <span className="block truncate text-xs text-muted">{h.industry}</span>}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
