import { env } from "cloudflare:workers";
import { Fail } from "./guard";
import { broadcast } from "./realtime";
import { autoHeadline, cleanResume, missingFields, type Resume } from "./resume-fields";

type Row = { data: string | null; name: string; location: string | null; headline: string | null };

/** The member's resume, or null before onboarding. Name, city and headline come from their profile so both stay in sync. */
export async function getResume(userId: string): Promise<Resume | null> {
  const r = await env.DB.prepare("SELECT r.data, u.name, u.location, u.headline FROM resumes r JOIN users u ON u.id = r.user_id WHERE r.user_id = ?")
    .bind(userId).first<Row>();
  return r && cleanResume({ ...JSON.parse(r.data ?? "{}"), name: r.name, city: r.location ?? "", headline: r.headline ?? "" });
}

/** Validate and store; also updates the profile's name, location and headline (and marks it member-edited so Clerk won't overwrite it). */
export async function saveResume(userId: string, input: unknown) {
  const r = cleanResume(input);
  const miss = missingFields(r);
  if (miss.length) throw new Fail("Some required details are missing. Check the highlighted fields.");
  const { name, city, headline, ...data } = { ...r, headline: autoHeadline(r) || null };
  const now = Date.now();
  const [, , row] = await env.DB.batch<{ handle: string; bio: string | null; image_url: string | null }>([
    env.DB.prepare("UPDATE users SET name = ?2, location = ?3, headline = ?4, custom = 1, updated_at = ?5 WHERE id = ?1").bind(userId, name, city, headline, now),
    env.DB.prepare("INSERT INTO resumes (user_id, data, updated_at) VALUES (?1, ?2, ?3) ON CONFLICT (user_id) DO UPDATE SET data = ?2, updated_at = ?3")
      .bind(userId, JSON.stringify(data), now),
    env.DB.prepare("SELECT handle, bio, image_url FROM users WHERE id = ?").bind(userId),
  ]);
  const u = row.results[0];
  if (u) await broadcast({ t: "profile", id: userId, name, handle: u.handle, headline, bio: u.bio && u.bio.slice(0, 120), imageUrl: u.image_url });
  return r;
}

const PROMPT = `You extract structured data from a resume. Reply with ONLY one JSON object, no prose, no markdown, exactly this shape:
{
  "name": "", "headline": "short professional title", "city": "current city", "email": "", "phone": "with country code if present",
  "status": "student" | "fresher" | "working",
  "summary": "2-3 sentence profile summary from the resume, or empty",
  "experience": [{ "title": "", "company": "", "location": "", "start": "YYYY-MM", "end": "YYYY-MM or empty", "current": false, "description": "one achievement per line" }],
  "education": [{ "school": "", "degree": "", "field": "", "start": "YYYY-MM", "end": "YYYY-MM", "grade": "CGPA or percentage" }],
  "projects": [{ "name": "", "link": "", "description": "" }],
  "skills": ["individual skills, tools and languages"],
  "preferredLocations": ["only if the resume states preferred locations"]
}
Rules: never invent facts; use "" or [] when something isn't in the resume. Internships count as experience.
"current" is true when the end date is Present/Current. "status" is "working" if they currently hold a job,
"student" if still studying, otherwise "fresher". Use a year-only date as "YYYY-01".`;

/**
 * PDF → text (unpdf, pure JS so it runs on Workers) → Bedrock (OpenAI-compatible chat completions) → cleaned Resume.
 * Throws Fail with a message the onboarding screen shows before falling back to the manual form.
 */
export async function extractResume(pdf: ArrayBuffer): Promise<Resume> {
  const { extractText, getDocumentProxy } = await import("unpdf");
  let text: string;
  try {
    const { text: t } = await extractText(await getDocumentProxy(new Uint8Array(pdf)), { mergePages: true });
    text = t.replace(/[ \t]+/g, " ").replace(/\n{3,}/g, "\n\n").trim();
  } catch {
    throw new Fail("We couldn't open that PDF. Try another file, or fill in your details manually.");
  }
  if (text.length < 80) throw new Fail("That PDF has no readable text (it may be a scanned image). Fill in your details manually.");

  // Bedrock's OpenAI-compatible endpoint (a Bedrock long-term API key works as the bearer token)
  const res = await fetch(`${env.BEDROCK_BASE_URL}/chat/completions`, {
    method: "POST",
    headers: { Authorization: `Bearer ${env.BEDROCK_API_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: env.BEDROCK_MODEL,
      // ponytail: first 20k chars (~5 pages) only; plenty for resumes.
      // No response_format: this endpoint's JSON mode emits a stray "{", plain output is clean.
      messages: [{ role: "system", content: PROMPT }, { role: "user", content: `Resume:
"""
${text.slice(0, 20_000)}
"""` }],
      max_tokens: 6000,
      temperature: 0,
    }),
  }).catch(() => null);
  if (!res?.ok) {
    console.error("bedrock", res?.status, await res?.text().catch(() => ""));
    throw new Fail("Our resume reader is busy right now. Fill in your details manually, or try again in a minute.");
  }
  const body = (await res.json()) as { choices?: { message?: { content?: string } }[] };
  // Reasoning comes in a separate field; the content is the JSON, maybe wrapped in a code fence
  const out = body.choices?.[0]?.message?.content ?? "";
  try {
    return cleanResume(JSON.parse(out.slice(out.indexOf("{"), out.lastIndexOf("}") + 1)));
  } catch {
    console.error("bedrock: unparseable output", out.slice(0, 500));
    throw new Fail("We couldn't read that resume. Fill in your details manually.");
  }
}
