import { env } from "cloudflare:workers";
import { capture } from "./analytics";

/**
 * One chat completion on Bedrock's OpenAI-compatible endpoint (the long-term API key is the bearer token).
 * Returns the JSON object in the reply, or null when the call fails or the reply has no parseable object.
 * No response_format: this endpoint's JSON mode emits a stray "{", plain output is clean.
 * `task` names the call in PostHog's LLM analytics (cost, latency, failures per feature).
 */
export async function bedrockJson(task: "resume" | "questions" | "grading" | "changelog", system: string, user: string, maxTokens: number, temperature = 0): Promise<{ ok: false; reason: "busy" | "unparseable" } | { ok: true; value: unknown }> {
  const t0 = Date.now();
  const res = await fetch(`${env.BEDROCK_BASE_URL}/chat/completions`, {
    method: "POST",
    headers: { Authorization: `Bearer ${env.BEDROCK_API_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({ model: env.BEDROCK_MODEL, messages: [{ role: "system", content: system }, { role: "user", content: user }], max_tokens: maxTokens, temperature }),
    // A reasoning model writing a few thousand tokens takes a while; past this, treat it as busy
    signal: AbortSignal.timeout(120_000),
  }).catch((e) => (console.error("bedrock fetch", e), null));
  // One $ai_generation per call. Not tied to a person, and no $ai_input/$ai_output_choices: prompts hold resumes and transcripts
  const log = (props: Record<string, unknown>) => capture("bedrock", "$ai_generation", {
    $process_person_profile: false, $ai_trace_id: crypto.randomUUID(), $ai_span_name: task, $ai_provider: "bedrock",
    $ai_model: env.BEDROCK_MODEL, $ai_base_url: env.BEDROCK_BASE_URL, $ai_latency: (Date.now() - t0) / 1000, $ai_max_tokens: maxTokens, ...props,
  });
  if (!res?.ok) {
    console.error("bedrock", res?.status, await res?.text().catch(() => ""));
    log({ $ai_is_error: true, $ai_http_status: res?.status ?? 0 });
    return { ok: false, reason: "busy" };
  }
  const body = (await res.json().catch(() => ({}))) as { choices?: { message?: { content?: string } }[]; usage?: { prompt_tokens?: number; completion_tokens?: number } };
  // Reasoning comes in a separate field; the content is the JSON, maybe wrapped in a code fence
  const out = body.choices?.[0]?.message?.content ?? "";
  const tokens = { $ai_input_tokens: body.usage?.prompt_tokens, $ai_output_tokens: body.usage?.completion_tokens, $ai_http_status: res.status };
  try {
    const value: unknown = JSON.parse(out.slice(out.indexOf("{"), out.lastIndexOf("}") + 1));
    log(tokens);
    return { ok: true, value };
  } catch {
    console.error("bedrock: unparseable output", { chars: out.length }); // never log content: it can quote resumes and transcripts
    log({ ...tokens, $ai_is_error: true, $ai_error: "unparseable" });
    return { ok: false, reason: "unparseable" };
  }
}
