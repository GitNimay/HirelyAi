import { describe, expect, it } from "vitest";
import { cleanCheck, gradeChecks } from "./checks";
import { ENV_PROBLEMS, PROBLEMS, fallbackProblems } from "./problem-bank";
import { ENVS } from "./workspace";

// Reference solutions for the config environments (kept out of problem-bank.ts: that file is a server-only answer key,
// and these never need to ship).
const REFERENCE: Record<string, string> = {
  "env-yaml-1": `apiVersion: apps/v1
kind: Deployment
metadata:
  name: web
spec:
  replicas: 2
  selector:
    matchLabels:
      app: web
  template:
    metadata:
      labels:
        app: web
    spec:
      containers:
        - name: web
          image: nginx:1.27.2
          ports:
            - containerPort: 8080
          resources:
            requests:
              cpu: 100m
              memory: 128Mi
            limits:
              cpu: 500m
              memory: 256Mi
          readinessProbe:
            httpGet:
              path: /healthz
              port: 8080
`,
  "env-yaml-2": `name: CI
on:
  push:
    branches: [main]
  pull_request:
    branches: [main]
jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 20
          cache: npm
      - run: npm ci
      - run: npm test
`,
  "env-dockerfile-1": `FROM node:20-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npm run build

FROM node:20-alpine
WORKDIR /app
ENV NODE_ENV=production
COPY package.json package-lock.json ./
RUN npm ci --omit=dev
COPY --from=build /app/dist ./dist
USER node
EXPOSE 3000
CMD ["node", "dist/server.js"]
`,
  "env-terraform-1": `resource "aws_s3_bucket" "assets" {
  bucket = "acme-assets-prod"
}

resource "aws_s3_bucket_versioning" "assets" {
  bucket = aws_s3_bucket.assets.id
  versioning_configuration {
    status = "Enabled"
  }
}

resource "aws_s3_bucket_public_access_block" "assets" {
  bucket                  = aws_s3_bucket.assets.id
  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}
`,
  "env-json-1": JSON.stringify(
    {
      Version: "2012-10-17",
      Statement: [{ Effect: "Allow", Action: ["s3:GetObject"], Resource: "arn:aws:s3:::acme-data/reports/*" }],
    },
    null,
    2,
  ),
};

const configProblems = ENV_PROBLEMS.filter((p) => p.env && ENVS[p.env].grade === "checks");

describe("environment problems", () => {
  it("has a unique id, a starter and a 3-step ladder for each", () => {
    const ids = ENV_PROBLEMS.map((p) => p.id);
    expect(new Set([...ids, ...PROBLEMS.map((p) => p.id)]).size).toBe(ids.length + PROBLEMS.length);
    for (const p of ENV_PROBLEMS) {
      expect(p.env && p.starter).toBeTruthy();
      expect(p.signature).toBeUndefined();
      expect(p.ladder).toHaveLength(3);
      expect(p.approach).toBeTruthy();
    }
  });

  it.each(configProblems.map((p) => [p.id, p] as const))(
    "%s: reference passes every check, starter does not",
    (id, p) => {
      for (const [suite, tests] of [
        ["visible", p.visible],
        ["hidden", p.hidden],
      ] as const) {
        const r = gradeChecks(p.env!, REFERENCE[id], tests, suite);
        expect(r.error).toBe("");
        expect(r.cases.filter((c) => !c.passed).map((c) => c.name)).toEqual([]);
        expect(r.status).toBe("Accepted");
      }
      const starter = [
        gradeChecks(p.env!, p.starter!, p.visible, "visible"),
        gradeChecks(p.env!, p.starter!, p.hidden, "hidden"),
      ];
      expect(starter.some((r) => r.passed < r.total)).toBe(true);
      expect(p.hidden.length).toBeGreaterThanOrEqual(2);
      expect(p.hidden.length).toBeLessThanOrEqual(4);
    },
  );

  it("every check survives cleanCheck unchanged", () => {
    for (const p of configProblems)
      for (const t of [...p.visible, ...p.hidden]) expect(cleanCheck(t.check, p.env!)).toEqual(t.check);
  });
});

describe("fallbackProblems", () => {
  const ids = (ps: { id: string }[]) => ps.map((p) => p.id);

  it("defaults to code problems", () => {
    const ps = fallbackProblems("medium", 2);
    expect(ps).toHaveLength(2);
    expect(ps.every((p) => !p.env)).toBe(true);
  });

  it("puts environment problems first for the given tracks", () => {
    const ps = fallbackProblems("medium", 2, ["yaml", "bash"]);
    expect(ps.map((p) => p.env)).toEqual(["yaml", "bash"]);
    expect(ps[0].id).toBe("env-yaml-1"); // the medium yaml problem
  });

  it("ends with an easier problem when n = 3", () => {
    const ps = fallbackProblems("medium", 3, ["yaml", "bash"]);
    expect(ps).toHaveLength(3);
    const rank = { easy: 0, medium: 1, hard: 2 };
    expect(rank[ps[2].difficulty]).toBeLessThan(rank[ps[0].difficulty]);
    expect(ps[2].env).toBe("yaml"); // same track preferred
  });

  it("never repeats a problem and falls back to code when a track runs out", () => {
    for (const n of [1, 2, 3, 5, 12]) {
      for (const tracks of [["code"], ["yaml"], ["sql", "json"], ["terraform", "dockerfile", "bash"]] as const) {
        const got = ids(fallbackProblems("hard", n, [...tracks]));
        expect(new Set(got).size).toBe(got.length);
        expect(got.length).toBeGreaterThanOrEqual(Math.min(n, PROBLEMS.length)); // a track never runs dry before the code problems do
      }
    }
    expect(fallbackProblems("easy", 3, ["sql"]).some((p) => !p.env)).toBe(true);
  });
});
