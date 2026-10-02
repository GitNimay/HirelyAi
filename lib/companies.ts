import { env } from "cloudflare:workers";

export type Role = "owner" | "admin";

/** A page as one viewer sees it: whether they run it, follow it, or verified they work there. */
export type Company = {
  id: string;
  slug: string;
  name: string;
  tagline: string | null;
  about: string | null;
  website: string | null;
  domain: string | null;
  industry: string | null;
  size: string | null;
  type: string | null;
  hq: string | null;
  founded: number | null;
  specialties: string[];
  logoUrl: string | null;
  coverUrl: string | null;
  followers: number;
  createdAt: number;
  /** An admin proved a work email on the domain: the page is really run by the company. */
  verified: boolean;
  counts: { people: number; jobs: number };
  me: { role: Role | null; following: boolean; verified: boolean };
};

/** Small card for search results, typeaheads and experience logos. */
export type CompanyCard = { id: string; slug: string; name: string; tagline: string | null; industry: string | null; logoUrl: string | null; followers: number };

type Row = {
  id: string; slug: string; name: string; tagline: string | null; about: string | null; website: string | null; domain: string | null;
  industry: string | null; size: string | null; type: string | null; hq: string | null; founded: number | null; specialties: string | null;
  logo_key: string | null; cover_key: string | null; follower_count: number; created_at: number;
  verified: number; people: number; jobs: number; role: Role | null; following: number; me_verified: number;
};

const url = (key: string | null) => (key ? `/api/media/${key}` : null);

const CARD = "c.id, c.slug, c.name, c.tagline, c.industry, c.logo_key, c.follower_count";
type CardRow = { id: string; slug: string; name: string; tagline: string | null; industry: string | null; logo_key: string | null; follower_count: number };
const toCard = (r: CardRow): CompanyCard => ({ id: r.id, slug: r.slug, name: r.name, tagline: r.tagline, industry: r.industry, logoUrl: url(r.logo_key), followers: r.follower_count });

/** `ref` is a slug or an id. ?1 = viewer. People count only members who show their experience (resume_public). */
export async function getCompany(viewerId: string, ref: string): Promise<Company | null> {
  const r = await env.DB.prepare(
    `SELECT c.*,
       EXISTS (SELECT 1 FROM company_verifications v JOIN company_admins a ON a.company_id = v.company_id AND a.user_id = v.user_id WHERE v.company_id = c.id) AS verified,
       (SELECT COUNT(*) FROM company_members m JOIN users u ON u.id = m.user_id WHERE m.company_id = c.id AND (u.resume_public = 1 OR u.id = ?1)) AS people,
       (SELECT COUNT(*) FROM jobs WHERE company_id = c.id AND closed_at IS NULL) AS jobs,
       (SELECT role FROM company_admins WHERE company_id = c.id AND user_id = ?1) AS role,
       EXISTS (SELECT 1 FROM company_follows WHERE company_id = c.id AND user_id = ?1) AS following,
       EXISTS (SELECT 1 FROM company_verifications WHERE company_id = c.id AND user_id = ?1) AS me_verified
     FROM companies c WHERE c.slug = ?2 OR c.id = ?2 LIMIT 1`,
  ).bind(viewerId, ref).first<Row>();
  if (!r) return null;
  return {
    id: r.id, slug: r.slug, name: r.name, tagline: r.tagline, about: r.about, website: r.website, domain: r.domain,
    industry: r.industry, size: r.size, type: r.type, hq: r.hq, founded: r.founded, specialties: r.specialties ? JSON.parse(r.specialties) : [],
    logoUrl: url(r.logo_key), coverUrl: url(r.cover_key), followers: r.follower_count, createdAt: r.created_at, verified: !!r.verified,
    counts: { people: r.people, jobs: r.jobs },
    me: { role: r.role, following: !!r.following, verified: !!r.me_verified },
  };
}

const escape = (s: string) => s.trim().slice(0, 64).replace(/[!%_]/g, "!$&");

/**
 * Pages whose name matches, prefix matches first, then the most followed. Empty query: the most followed pages.
 * ponytail: LIKE scan over companies; an FTS5 table when there are tens of thousands of pages.
 */
export async function searchCompanies(query: string, limit = 20): Promise<CompanyCard[]> {
  const q = escape(query);
  const { results } = await env.DB.prepare(
    `SELECT ${CARD} FROM companies c WHERE ?1 = '' OR c.name LIKE '%' || ?1 || '%' ESCAPE '!'
     ORDER BY c.name LIKE ?1 || '%' ESCAPE '!' DESC, c.follower_count DESC, c.name LIMIT ?2`,
  ).bind(q, limit).all<CardRow>();
  return results.map(toCard);
}

/** Pages the viewer runs, then pages they verified they work at (where they can post jobs). */
export async function myCompanies(viewerId: string) {
  const { results } = await env.DB.prepare(
    `SELECT ${CARD}, a.role, v.user_id IS NOT NULL AS verified FROM companies c
     LEFT JOIN company_admins a ON a.company_id = c.id AND a.user_id = ?1
     LEFT JOIN company_verifications v ON v.company_id = c.id AND v.user_id = ?1
     WHERE a.user_id IS NOT NULL OR v.user_id IS NOT NULL ORDER BY a.role IS NULL, c.name LIMIT 100`,
  ).bind(viewerId).all<CardRow & { role: Role | null; verified: number }>();
  return results.map((r) => ({ ...toCard(r), role: r.role, verified: !!r.verified }));
}

/** Logos and links for the companies in someone's experience. */
export async function companiesByIds(ids: string[]): Promise<Record<string, CompanyCard>> {
  if (!ids.length) return {};
  const { results } = await env.DB.prepare(`SELECT ${CARD} FROM companies c WHERE c.id IN (SELECT value FROM json_each(?))`).bind(JSON.stringify(ids)).all<CardRow>();
  return Object.fromEntries(results.map((r) => [r.id, toCard(r)]));
}

export type Member = { id: string; handle: string | null; name: string; imageUrl: string | null; headline: string | null; title: string; current: boolean };

/** The People tab: members who list the company in their experience and show it on their profile. Current employees first. */
export async function listPeople(viewerId: string, companyId: string): Promise<Member[]> {
  const { results } = await env.DB.prepare(
    `SELECT u.id, u.handle, u.name, u.image_url, u.headline, m.title, m.current FROM company_members m JOIN users u ON u.id = m.user_id
     WHERE m.company_id = ?2 AND (u.resume_public = 1 OR u.id = ?1) ORDER BY m.current DESC, u.name LIMIT 200`,
  ).bind(viewerId, companyId).all<{ id: string; handle: string | null; name: string; image_url: string | null; headline: string | null; title: string; current: number }>();
  return results.map((r) => ({ id: r.id, handle: r.handle, name: r.name, imageUrl: r.image_url, headline: r.headline, title: r.title, current: !!r.current }));
}

export type Admin = { id: string; handle: string | null; name: string; imageUrl: string | null; role: Role };

export async function listAdmins(companyId: string): Promise<Admin[]> {
  const { results } = await env.DB.prepare(
    `SELECT u.id, u.handle, u.name, u.image_url, a.role FROM company_admins a JOIN users u ON u.id = a.user_id
     WHERE a.company_id = ? ORDER BY a.role = 'owner' DESC, a.created_at`,
  ).bind(companyId).all<{ id: string; handle: string | null; name: string; image_url: string | null; role: Role }>();
  return results.map((r) => ({ id: r.id, handle: r.handle, name: r.name, imageUrl: r.image_url, role: r.role }));
}

export const roleOf = (userId: string, companyId: string) =>
  env.DB.prepare("SELECT role FROM company_admins WHERE company_id = ? AND user_id = ?").bind(companyId, userId).first<Role>("role");

/** Only members who verified a work email on the company's domain post its jobs. */
export const canPostJobs = async (userId: string, companyId: string) =>
  !!(await env.DB.prepare("SELECT 1 FROM company_verifications WHERE company_id = ? AND user_id = ?").bind(companyId, userId).first());
