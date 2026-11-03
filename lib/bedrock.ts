import { env } from "cloudflare:workers";
import { capture } from "./analytics";

/**
 * One chat completion on Bedrock's OpenAI-compatible endpoint (the long-term API key is the bearer token).
 * Returns the JSON object in the reply, or null when the call fails or the reply has no parseable object.
 * No response_format: this endpoint's JSON mode emits a stray "{", plain output is clean.
 * `task` names the call in PostHog's LLM analytics (cost, latency, failures per feature).
 */
export async function bedrockJson(
  task: "resume" | "questions" | "grading" | "changelog" | "plan" | "summary" | "vision" | "evaluation" | "problem",
  system: string,
  user: string | unknown[], // text, or OpenAI content parts (text + image_url) for vision models
  maxTokens: number,
  temperature = 0,
  model: string = env.BEDROCK_MODEL, // cheaper models for small jobs (lib/ai-interview/session.ts FAST)
  extract: (text: string) => unknown = jsonObject, // how to read the reply; throws when it can't
): Promise<{ ok: false; reason: "busy" | "unparseable" } | { ok: true; value: unknown }> {
  const t0 = Date.now();
  const res = await fetch(`${env.BEDROCK_BASE_URL}/chat/completions`, {
    method: "POST",
    headers: { Authorization: `Bearer ${env.BEDROCK_API_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model,
      messages: [
        { role: "system", content: system },
        { role: "user", content: user },
      ],
      max_tokens: maxTokens,
      temperature,
    }),
    // A reasoning model writing a few thousand tokens takes a while; past this, treat it as busy
    signal: AbortSignal.timeout(120_000),
  }).catch((e) => (console.error("bedrock fetch", e), null));
  // One $ai_generation per call. Not tied to a person, and no $ai_input/$ai_output_choices: prompts hold resumes and transcripts
  const log = (props: Record<string, unknown>) =>
    capture("bedrock", "$ai_generation", {
      $process_person_profile: false,
      $ai_trace_id: crypto.randomUUID(),
      $ai_span_name: task,
      $ai_provider: "bedrock",
      $ai_model: model,
      $ai_base_url: env.BEDROCK_BASE_URL,
      $ai_latency: (Date.now() - t0) / 1000,
      $ai_max_tokens: maxTokens,
      ...props,
    });
  if (!res?.ok) {
    console.error("bedrock", res?.status, await res?.text().catch(() => ""));
    log({ $ai_is_error: true, $ai_http_status: res?.status ?? 0 });
    return { ok: false, reason: "busy" };
  }
  const body = (await res.json().catch(() => ({}))) as {
    choices?: { message?: { content?: string } }[];
    usage?: { prompt_tokens?: number; completion_tokens?: number };
  };
  // Reasoning comes in a separate field; the content is the JSON, maybe wrapped in a code fence
  const out = body.choices?.[0]?.message?.content ?? "";
  const tokens = {
    $ai_input_tokens: body.usage?.prompt_tokens,
    $ai_output_tokens: body.usage?.completion_tokens,
    $ai_http_status: res.status,
  };
  try {
    const value = extract(out);
    log(tokens);
    return { ok: true, value };
  } catch {
    console.error("bedrock: unparseable output", { chars: out.length }); // never log content: it can quote resumes and transcripts
    log({ ...tokens, $ai_is_error: true, $ai_error: "unparseable" });
    return { ok: false, reason: "unparseable" };
  }
}

/**
 * The JSON object in a model reply (first "{" to last "}"). Models often put raw newlines or tabs inside string
 * values, which JSON forbids: those are escaped and the parse retried before giving up.
 */
export function jsonObject(text: string): unknown {
  const raw = text.slice(text.indexOf("{"), text.lastIndexOf("}") + 1);
  try {
    return JSON.parse(raw);
  } catch {
    let out = "";
    let inString = false;
    let escaped = false;
    for (const ch of raw) {
      if (inString && !escaped && (ch === "\n" || ch === "\r" || ch === "\t"))
        out += ch === "\n" ? "\\n" : ch === "\t" ? "\\t" : "";
      else out += ch;
      if (escaped) escaped = false;
      else if (ch === "\\") escaped = inString;
      else if (ch === '"') inString = !inString;
    }
    return JSON.parse(out);
  }
}
