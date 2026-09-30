import { env } from "cloudflare:workers";

/**
 * One chat completion on Bedrock's OpenAI-compatible endpoint (the long-term API key is the bearer token).
 * Returns the JSON object in the reply, or null when the call fails or the reply has no parseable object.
 * No response_format: this endpoint's JSON mode emits a stray "{", plain output is clean.
 */
export async function bedrockJson(system: string, user: string, maxTokens: number): Promise<{ ok: false; reason: "busy" | "unparseable" } | { ok: true; value: unknown }> {
  const res = await fetch(`${env.BEDROCK_BASE_URL}/chat/completions`, {
    method: "POST",
    headers: { Authorization: `Bearer ${env.BEDROCK_API_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({ model: env.BEDROCK_MODEL, messages: [{ role: "system", content: system }, { role: "user", content: user }], max_tokens: maxTokens, temperature: 0 }),
    // A reasoning model writing a few thousand tokens takes a while; past this, treat it as busy
    signal: AbortSignal.timeout(120_000),
  }).catch((e) => (console.error("bedrock fetch", e), null));
  if (!res?.ok) {
    console.error("bedrock", res?.status, await res?.text().catch(() => ""));
    return { ok: false, reason: "busy" };
  }
  const body = (await res.json().catch(() => ({}))) as { choices?: { message?: { content?: string } }[] };
  // Reasoning comes in a separate field; the content is the JSON, maybe wrapped in a code fence
  const out = body.choices?.[0]?.message?.content ?? "";
  try {
    return { ok: true, value: JSON.parse(out.slice(out.indexOf("{"), out.lastIndexOf("}") + 1)) };
  } catch {
    console.error("bedrock: unparseable output", out.slice(0, 500));
    return { ok: false, reason: "unparseable" };
  }
}
