import { env } from "cloudflare:workers";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { capture } from "./analytics";
import { bedrockJson } from "./bedrock";

vi.mock("./analytics", () => ({ capture: vi.fn() }));

const reply = (content: string, status = 200) =>
  vi
    .spyOn(globalThis, "fetch")
    .mockResolvedValue(
      Response.json(
        { choices: [{ message: { content } }], usage: { prompt_tokens: 12, completion_tokens: 34 } },
        { status },
      ),
    );

beforeEach(() => {
  Object.assign(env, { BEDROCK_BASE_URL: "https://bedrock.test/v1", BEDROCK_API_KEY: "key", BEDROCK_MODEL: "model-x" });
  vi.spyOn(console, "error").mockImplementation(() => {});
});

describe("bedrockJson", () => {
  it("sends the prompt to the chat endpoint with the API key", async () => {
    const fetch = reply('{"ok":1}');
    await bedrockJson("resume", "sys", "usr", 500, 0.2);

    const [url, init] = fetch.mock.calls[0];
    expect(url).toBe("https://bedrock.test/v1/chat/completions");
    expect(new Headers(init?.headers).get("authorization")).toBe("Bearer key");
    expect(JSON.parse(String(init?.body))).toEqual({
      model: "model-x",
      messages: [
        { role: "system", content: "sys" },
        { role: "user", content: "usr" },
      ],
      max_tokens: 500,
      temperature: 0.2,
    });
    expect(init?.signal).toBeInstanceOf(AbortSignal);
  });

  it.each([
    ["plain JSON", '{"a":1}'],
    ["a fenced block", 'Here:\n```json\n{"a":1}\n```'],
  ])("extracts the object from %s", async (_, content) => {
    reply(content);
    expect(await bedrockJson("resume", "s", "u", 10)).toEqual({ ok: true, value: { a: 1 } });
  });

  it("reports busy on an error status or a network failure", async () => {
    reply("", 503);
    expect(await bedrockJson("grading", "s", "u", 10)).toEqual({ ok: false, reason: "busy" });
    vi.spyOn(globalThis, "fetch").mockRejectedValue(new TypeError("offline"));
    expect(await bedrockJson("grading", "s", "u", 10)).toEqual({ ok: false, reason: "busy" });
  });

  it("reports unparseable output", async () => {
    reply("Sorry, I can't help with that.");
    expect(await bedrockJson("questions", "s", "u", 10)).toEqual({ ok: false, reason: "unparseable" });
  });

  it("logs cost and latency for analytics, never the prompt or the reply", async () => {
    reply('{"secret":"resume text"}');
    await bedrockJson("resume", "SYSTEM PROMPT", "Ada's resume", 10);

    expect(capture).toHaveBeenCalledWith(
      "bedrock",
      "$ai_generation",
      expect.objectContaining({ $ai_span_name: "resume", $ai_input_tokens: 12, $ai_output_tokens: 34 }),
    );
    const logged = JSON.stringify(vi.mocked(capture).mock.calls);
    expect(logged).not.toContain("Ada's resume");
    expect(logged).not.toContain("SYSTEM PROMPT");
    expect(logged).not.toContain("resume text");
  });
});
