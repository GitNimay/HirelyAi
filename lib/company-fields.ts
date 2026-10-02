/** Company page rules shared by the forms (UX) and the server (enforcement). Pure, so it also runs under `npm test`. */
import { normalizeWebsite, validHandle } from "./profile-fields.ts";
import type { Experience } from "./resume-fields.ts";

export const INDUSTRIES = [
  "Software & IT services", "Internet", "Financial services", "Banking", "Insurance", "Hospitals & health care", "Pharmaceuticals",
  "Education", "Retail", "E-commerce", "Manufacturing", "Automotive", "Telecommunications", "Media & entertainment", "Marketing & advertising",
  "Consulting", "Staffing & recruiting", "Real estate", "Construction", "Logistics & supply chain", "Energy", "Food & beverages",
  "Hospitality", "Government", "Non-profit", "Other",
];
export const SIZES = ["1-10", "11-50", "51-200", "201-500", "501-1,000", "1,001-5,000", "5,001-10,000", "10,001+"];
export const TYPES = ["Public company", "Privately held", "Self-employed", "Partnership", "Government agency", "Non-profit", "Educational"];

export const LIMITS = { name: 100, tagline: 120, about: 2000, website: 200, hq: 100, specialties: 20, specialty: 40 };

/** Webmail and ISP domains: anyone can get an address there, so they never prove employment. */
const FREE_MAIL = new Set([
  "gmail.com", "googlemail.com", "outlook.com", "hotmail.com", "live.com", "msn.com", "yahoo.com", "yahoo.co.in", "ymail.com", "icloud.com",
  "me.com", "mac.com", "aol.com", "proton.me", "protonmail.com", "zoho.com", "zohomail.in", "gmx.com", "mail.com", "yandex.com",
  "rediffmail.com", "hey.com", "fastmail.com", "tutanota.com",
]);

/** "https://www.Acme.com/careers" → "acme.com". null when there is no website, or it's a free-mail domain. */
export function domainOf(website: string | null): string | null {
  if (!website) return null;
  try {
    const host = new URL(website).hostname.toLowerCase().replace(/^www\./, "");
    return host.includes(".") && !FREE_MAIL.has(host) ? host : null;
  } catch {
    return null;
  }
}

/** A work email proves employment when it's on the company's domain or a subdomain of it (eng.acme.com). */
export function onDomain(email: string, domain: string | null) {
  const d = email.toLowerCase().split("@")[1] ?? "";
  return !!domain && !FREE_MAIL.has(d) && (d === domain || d.endsWith(`.${domain}`));
}

export type CompanyInput = {
  name: string; slug: string; tagline: string; about: string; website: string; industry: string; size: string; type: string;
  hq: string; founded: string; specialties: string;
};
export type CleanCompany = {
  name: string; slug: string; tagline: string | null; about: string | null; website: string | null; domain: string | null;
  industry: string | null; size: string | null; type: string | null; hq: string | null; founded: number | null; specialties: string[];
};

const str = (v: unknown, max: number) => (typeof v === "string" ? v.trim().replace(/[ \t]+/g, " ").slice(0, max) : "");
const pick = (list: string[], v: unknown) => (typeof v === "string" && list.includes(v) ? v : null);

/** Trim, clamp and allowlist a page form. Returns a message to show instead when something is wrong. */
export function cleanCompany(input: Partial<CompanyInput>, year = new Date().getFullYear()): CleanCompany | string {
  const name = str(input.name, LIMITS.name).replace(/\s+/g, " ");
  const slug = str(input.slug, 30).toLowerCase();
  const website = normalizeWebsite(str(input.website, LIMITS.website));
  const founded = Number(str(input.founded, 4)) || null;
  if (!name) return "Add the company name";
  if (!validHandle(slug)) return "Page URL must be 3-30 letters, numbers or hyphens";
  if (website === undefined) return "Enter a valid website, like acme.com";
  if (founded !== null && (founded < 1600 || founded > year)) return "Enter the year the company was founded";
  const seen = new Set<string>();
  const specialties = str(input.specialties, 2000).split(",").map((s) => s.trim().slice(0, LIMITS.specialty))
    .filter((s) => s && !seen.has(s.toLowerCase()) && seen.add(s.toLowerCase())).slice(0, LIMITS.specialties);
  return {
    name, slug, website, domain: domainOf(website), founded, specialties,
    tagline: str(input.tagline, LIMITS.tagline) || null,
    about: (typeof input.about === "string" ? input.about.trim().replace(/\n{3,}/g, "\n\n").slice(0, LIMITS.about) : "") || null,
    industry: pick(INDUSTRIES, input.industry), size: pick(SIZES, input.size), type: pick(TYPES, input.type),
    hq: str(input.hq, LIMITS.hq) || null,
  };
}

/**
 * Point each experience at a company page: keep a `companyId` that still exists (and show that page's name),
 * otherwise link by exact name when exactly one page has it. Unmatched entries stay free text.
 */
export function linkExperience(experience: Experience[], pages: { id: string; name: string }[]): Experience[] {
  const byId = new Map(pages.map((p) => [p.id, p]));
  const byName = new Map<string, { id: string; name: string } | null>();
  for (const p of pages) {
    const k = p.name.toLowerCase();
    byName.set(k, byName.has(k) ? null : p); // two pages with one name: ambiguous, don't guess
  }
  return experience.map(({ companyId, ...e }) => {
    const page = (companyId && byId.get(companyId)) || byName.get(e.company.toLowerCase());
    return page ? { ...e, company: page.name, companyId: page.id } : e;
  });
}

/** One row per company for the People tab: someone who worked there twice counts once, as current if either stint is. */
export function memberRows(experience: Experience[]) {
  const rows = new Map<string, { companyId: string; title: string; current: boolean }>();
  for (const e of experience) {
    if (!e.companyId) continue;
    const had = rows.get(e.companyId);
    if (!had || (e.current && !had.current)) rows.set(e.companyId, { companyId: e.companyId, title: e.title, current: e.current });
  }
  return [...rows.values()];
}
