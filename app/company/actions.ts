"use server";

import { clerkClient } from "@clerk/nextjs/server";
import { env } from "cloudflare:workers";
import { roleOf, searchCompanies } from "@/lib/companies";
import { cleanCompany, onDomain, type CleanCompany, type CompanyInput } from "@/lib/company-fields";
import { track } from "@/lib/analytics";
import { failed, Fail, ownImage, viewer, writer } from "@/lib/guard";
import { cleanHandle } from "@/lib/profile-fields";

// Every action re-checks auth (viewer/writer): server actions are public POST endpoints.

/** `logoKey` / `coverKey` are images just uploaded via /api/uploads?for=company. */
export type PageInput = CompanyInput & { logoKey?: string; coverKey?: string; removeCover?: boolean };

const fields = (input: unknown) => {
  const c = cleanCompany((input ?? {}) as Partial<CompanyInput>);
  if (typeof c === "string") throw new Fail(c);
  return c;
};

/** Turn a unique-index violation into something the form can show. */
function taken(e: unknown, c: CleanCompany): never {
  const s = String(e);
  if (s.includes("companies.slug")) throw new Fail("That page URL is taken");
  if (s.includes("companies.domain")) throw new Fail(`A page for ${c.domain} already exists. Ask its admins to add you.`);
  throw e;
}

/** Any member can create a page; they become its owner. */
export async function createCompany(input: PageInput) {
  try {
    const me = await writer();
    const c = fields(input);
    const logo = input?.logoKey ? await ownImage(me, input.logoKey, "companies") : null;
    const cover = input?.coverKey ? await ownImage(me, input.coverKey, "companies") : null;
    const id = crypto.randomUUID();
    const now = Date.now();
    await env.DB.batch([
      env.DB.prepare(
        `INSERT INTO companies (id, slug, name, tagline, about, website, domain, industry, size, type, hq, founded, specialties, logo_key, cover_key, created_by, created_at, updated_at)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, ?15, ?16, ?17, ?17)`,
      ).bind(id, c.slug, c.name, c.tagline, c.about, c.website, c.domain, c.industry, c.size, c.type, c.hq, c.founded, JSON.stringify(c.specialties), logo, cover, me, now),
      env.DB.prepare("INSERT INTO company_admins (company_id, user_id, role, created_at) VALUES (?, ?, 'owner', ?)").bind(id, me, now),
      env.DB.prepare("INSERT INTO company_follows (user_id, company_id, created_at) VALUES (?, ?, ?)").bind(me, id, now),
    ]).catch((e) => taken(e, c));
    await track(me, "company created", { company_id: id, has_logo: !!logo, has_domain: !!c.domain });
    return { slug: c.slug };
  } catch (e) {
    return failed(e);
  }
}

/** Admins edit the page. Changing the website's domain drops everyone's work-email verification for the old one. */
export async function updateCompany(companyId: string, input: PageInput) {
  try {
    const me = await writer();
    const id = String(companyId);
    if (!(await roleOf(me, id))) throw new Fail("Only page admins can edit this page");
    const c = fields(input);
    const old = await env.DB.prepare("SELECT domain, logo_key, cover_key FROM companies WHERE id = ?").bind(id)
      .first<{ domain: string | null; logo_key: string | null; cover_key: string | null }>();
    if (!old) throw new Fail("Page not found");
    const logo = input?.logoKey ? await ownImage(me, input.logoKey, "companies") : old.logo_key;
    const cover = input?.removeCover ? null : input?.coverKey ? await ownImage(me, input.coverKey, "companies") : old.cover_key;
    await env.DB.batch([
      env.DB.prepare(
        `UPDATE companies SET slug = ?2, name = ?3, tagline = ?4, about = ?5, website = ?6, domain = ?7, industry = ?8, size = ?9, type = ?10, hq = ?11,
           founded = ?12, specialties = ?13, logo_key = ?14, cover_key = ?15, updated_at = ?16 WHERE id = ?1`,
      ).bind(id, c.slug, c.name, c.tagline, c.about, c.website, c.domain, c.industry, c.size, c.type, c.hq, c.founded, JSON.stringify(c.specialties), logo, cover, Date.now()),
      ...(c.domain !== old.domain ? [env.DB.prepare("DELETE FROM company_verifications WHERE company_id = ?").bind(id)] : []),
    ]).catch((e) => taken(e, c));

    // Replaced images are referenced nowhere else (companies/ folder), so free them
    const stale = [old.logo_key !== logo && old.logo_key, old.cover_key !== cover && old.cover_key].filter((k): k is string => !!k && k.startsWith("companies/"));
    if (stale.length) await env.MEDIA.delete(stale);
    return { slug: c.slug };
  } catch (e) {
    return failed(e);
  }
}

export async function toggleCompanyFollow(companyId: string) {
  const me = await writer();
  const id = String(companyId);
  const del = await env.DB.prepare("DELETE FROM company_follows WHERE user_id = ? AND company_id = ?").bind(me, id).run();
  if (!del.meta.changes) await env.DB.prepare("INSERT INTO company_follows (user_id, company_id, created_at) SELECT ?, id, ? FROM companies WHERE id = ?").bind(me, Date.now(), id).run();
  return { following: !del.meta.changes };
}

/** Typeahead for experience and search. */
export async function findCompanies(query: string) {
  await viewer();
  return searchCompanies(String(query ?? ""), 8);
}

/**
 * "I work here": the member must already have the work email verified on their account (Settings → Account sends the code),
 * so we only read Clerk, never trust the client. Verified members can post the company's jobs.
 */
export async function verifyWorkEmail(companyId: string) {
  try {
    const me = await writer();
    const id = String(companyId);
    const domain = await env.DB.prepare("SELECT domain FROM companies WHERE id = ?").bind(id).first<string | null>("domain");
    if (!domain) throw new Fail("This page has no company website yet, so work emails can't be checked.");
    const user = await (await clerkClient()).users.getUser(me);
    const email = user.emailAddresses.find((e) => e.verification?.status === "verified" && onDomain(e.emailAddress, domain))?.emailAddress;
    if (!email) throw new Fail(`Add and verify your @${domain} email in Settings → Account, then try again.`);
    await env.DB.prepare("INSERT OR REPLACE INTO company_verifications (company_id, user_id, email, verified_at) VALUES (?, ?, ?, ?)")
      .bind(id, me, email, Date.now()).run();
    await track(me, "company work email verified", { company_id: id });
    return { email };
  } catch (e) {
    return failed(e);
  }
}

/** Owners add admins by profile handle. */
export async function addAdmin(companyId: string, handle: string) {
  try {
    const me = await writer();
    const id = String(companyId);
    if ((await roleOf(me, id)) !== "owner") throw new Fail("Only page owners can add admins");
    const ins = await env.DB.prepare(
      "INSERT OR IGNORE INTO company_admins (company_id, user_id, role, created_at) SELECT ?1, id, 'admin', ?3 FROM users WHERE handle = ?2",
    ).bind(id, cleanHandle(String(handle ?? "")), Date.now()).run();
    if (!ins.meta.changes) throw new Fail("No member with that handle, or they're already an admin");
    return { ok: true as const };
  } catch (e) {
    return failed(e);
  }
}

/** Owners remove admins; anyone can step down. A page always keeps at least one owner. */
export async function removeAdmin(companyId: string, userId: string) {
  try {
    const me = await writer();
    const id = String(companyId);
    const target = String(userId);
    if (target !== me && (await roleOf(me, id)) !== "owner") throw new Fail("Only page owners can remove admins");
    const del = await env.DB.prepare(
      `DELETE FROM company_admins WHERE company_id = ?1 AND user_id = ?2
         AND (role = 'admin' OR EXISTS (SELECT 1 FROM company_admins o WHERE o.company_id = ?1 AND o.role = 'owner' AND o.user_id <> ?2))`,
    ).bind(id, target).run();
    if (!del.meta.changes) throw new Fail("A page needs at least one owner");
    return { ok: true as const };
  } catch (e) {
    return failed(e);
  }
}
