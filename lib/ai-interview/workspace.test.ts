import { describe, expect, it } from "vitest";
import { CASE_END, gradeBlocks, mobileRequest, pickTracks, publicProblem, type Problem } from "./workspace";

describe("mobileRequest", () => {
  it("blocks phones and tablets by client hint or user agent", () => {
    expect(mobileRequest("Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/130.0", "?1")).toBe(true);
    expect(mobileRequest("Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) Mobile/15E148", null)).toBe(true);
    expect(mobileRequest("Mozilla/5.0 (Linux; Android 14; SM-X710) Chrome/130.0 Safari/537.36", null)).toBe(true);
  });
  it("lets laptops and desktops through", () => {
    expect(mobileRequest("Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/130.0 Safari/537.36", "?0")).toBe(false);
    expect(mobileRequest("Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) Chrome/130.0", null)).toBe(false);
    expect(mobileRequest(null, null)).toBe(false);
  });
});

describe("pickTracks", () => {
  it("gives a DevOps role its environments, led by what the job asks for most, and no LeetCode", () => {
    const job = {
      title: "DevOps Engineer",
      description:
        "Run our Kubernetes clusters (EKS) with Helm and Argo CD. Infrastructure as code with Terraform. Docker images, Bash scripting on Linux.",
    };
    const tracks = pickTracks(job, "Skills: Kubernetes, Terraform, Docker");
    expect(tracks[0]).toBe("yaml");
    expect(tracks).toContain("terraform");
    expect(tracks).not.toContain("code");
    expect(tracks.length).toBeLessThanOrEqual(3);
  });

  it("weights the resume to order environments the job mentions equally", () => {
    const job = { title: "Platform Engineer", description: "Terraform and Kubernetes." };
    expect(pickTracks(job, "Wrote Terraform modules, Terraform Cloud, Terraform")[0]).toBe("terraform");
    expect(pickTracks(job, "Kubernetes operator, k8s, Helm charts")[0]).toBe("yaml");
  });

  it("keeps general code first for a developer role, with its data or infra stack as backups", () => {
    const job = {
      title: "Backend Engineer",
      description: "Go services on PostgreSQL, SQL reporting, deployed with Docker.",
    };
    expect(pickTracks(job, "")).toEqual(["code", "sql", "dockerfile"]);
    expect(pickTracks({ title: "Frontend Developer", description: "React and TypeScript." }, "")).toEqual(["code"]);
  });

  it("ignores environments only the resume mentions", () => {
    expect(pickTracks({ title: "Data Analyst", description: "SQL reporting in BigQuery." }, "Kubernetes")).toEqual([
      "sql",
    ]);
  });
});

describe("script grading", () => {
  const tests = [
    { name: "two lines", input: "x", output: "a 2\nb 1" },
    { name: "empty", input: "", output: "" },
    { name: "missing", input: "y", output: "z" },
  ];
  it("compares each case's whole output, ignoring trailing spaces and blank lines", () => {
    const stdout = `a 2  \nb 1\n\n\n${CASE_END}\n\n${CASE_END}\n`; // the third case never finished
    expect(gradeBlocks(tests, stdout, true).map((c) => c.passed)).toEqual([true, true, false]);
    expect(gradeBlocks(tests, stdout, false)[0]).toEqual({ name: "two lines", passed: true }); // hidden: no values
  });
});

describe("publicProblem", () => {
  it("sends an environment problem's starter but never its hidden checks or approach", () => {
    const p: Problem = {
      id: "g1",
      title: "Fix the Deployment",
      difficulty: "medium",
      statement: "s",
      input: "",
      output: "",
      constraints: "",
      env: "yaml",
      starter: "kind: Deployment",
      visible: [{ name: "has limits", input: "", output: "", check: { path: "a", op: "exists" } }],
      hidden: [{ name: "no latest", input: "", output: "", check: { op: "no_match", value: ":latest" } }],
      ladder: ["a", "b", "c"],
      approach: "secret",
    };
    const pub = publicProblem(p);
    expect(pub).toMatchObject({ env: "yaml", starter: "kind: Deployment" });
    expect(JSON.stringify(pub)).not.toMatch(/no latest|secret|ladder/);
  });
});
