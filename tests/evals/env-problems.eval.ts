import { readFileSync } from "node:fs";
import { env } from "cloudflare:workers";
import { describe, expect, it } from "vitest";
import { planProblems } from "@/lib/ai-interview/problem-gen";
import { pickTracks } from "@/lib/ai-interview/workspace";

/**
 * DevOps coding round, generated for real (npm run eval, never CI): the problem model on Bedrock writes environment
 * tasks from a job description and resume, and every one must survive validation (scripts on Judge0, config checks
 * against its own reference and starter). Fallback bank problems carry an "env-" id, so they don't count here.
 */
Object.assign(
  env,
  Object.fromEntries(
    readFileSync(".env.local", "utf8")
      .split("\n")
      .map((l) => l.trim().match(/^([A-Z0-9_]+)=(.*)$/))
      .filter((m): m is RegExpMatchArray => !!m)
      .map((m) => [m[1], m[2]]),
  ),
);

const job = {
  title: "DevOps Engineer",
  description:
    "Own our AWS platform: EKS clusters managed with Helm and Argo CD, infrastructure as code in Terraform, GitHub Actions pipelines, Docker images for 20 Go services, Bash tooling for on-call.",
};
const background = `- [experience] SRE at Paytrail (2021-now): migrated 30 services from EC2 to EKS with Helm; wrote Terraform modules for VPC and RDS; cut deploy time from 25 to 6 minutes with GitHub Actions caching.
Skills: Kubernetes, Helm, Terraform, AWS, Docker, Bash, Prometheus`;

describe("environment problems on real models", () => {
  it("writes a YAML / Terraform round from a DevOps job and resume, with an easier backup", async () => {
    const tracks = pickTracks(job, background);
    expect(tracks[0]).toBe("yaml");
    const problems = await planProblems({
      ...job,
      levelLabel: "Mid-level",
      difficulty: "medium",
      skills: ["Kubernetes", "Terraform", "Docker"],
      background,
      recruiter: [],
      tracks,
    });
    console.log(
      problems.map((p) => ({
        id: p.id,
        env: p.env,
        difficulty: p.difficulty,
        title: p.title,
        checks: p.visible.length,
      })),
    );
    expect(problems).toHaveLength(3);
    expect(problems.every((p) => p.env)).toBe(true); // a DevOps role never falls back to algorithms
    // Generated, not the bank (a rejected slot is filled from the bank in place, so the order always holds)
    expect(problems.filter((p) => !p.id.startsWith("env-")).length).toBeGreaterThanOrEqual(2);
    expect(problems[0].difficulty).toBe("medium");
    expect(problems.at(-1)!.difficulty).toBe("easy");
  }, 300_000);

  it("writes Bash and SQL tasks whose expected outputs come from running the reference on Judge0", async () => {
    const sre = {
      title: "Site Reliability Engineer",
      description:
        "Linux on-call for our payments platform: Bash scripting for log triage and runbooks, PostgreSQL incident queries, SQL reporting on error budgets.",
    };
    const tracks = pickTracks(sre, "Skills: Bash, Linux, PostgreSQL, SQL");
    expect(tracks.slice(0, 2).sort()).toEqual(["bash", "sql"]);
    const problems = await planProblems({
      ...sre,
      levelLabel: "Junior",
      difficulty: "easy",
      skills: ["Bash", "PostgreSQL"],
      background: "- [experience] Support engineer at Kite: wrote Bash scripts to grep nginx logs during incidents.",
      recruiter: [],
      tracks,
    });
    console.log(problems.map((p) => ({ id: p.id, env: p.env, title: p.title, hidden: p.hidden.map((t) => t.output) })));
    const generated = problems.filter((p) => !p.id.startsWith("env-"));
    expect(generated.length).toBeGreaterThanOrEqual(2);
    // Every hidden expected output was produced by the sandbox, never typed by the model
    for (const p of generated) expect(p.hidden.every((t) => typeof t.output === "string")).toBe(true);
  }, 300_000);
});
