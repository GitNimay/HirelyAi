import { describe, expect, it } from "vitest";
import { cleanCheck, gradeChecks, parseConfig, resolve, runCheck, type Check } from "./checks";
import type { Test } from "./workspace";

const DEPLOY = `apiVersion: apps/v1
kind: Deployment
metadata:
  name: web
spec:
  replicas: 3
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
          image: nginx:1.27
          ports:
            - containerPort: 8080
          resources:
            limits:
              memory: 256Mi
        - name: sidecar
          image: envoy
---
apiVersion: v1
kind: Service
metadata:
  name: web
spec:
  ports:
    - port: 80
      targetPort: 8080
`;
const yaml = (raw: string) => (parseConfig("yaml", raw) as { doc: unknown }).doc;
const check = (c: Check, raw = DEPLOY) => runCheck(c, yaml(raw), raw);

describe("config checks", () => {
  it("resolves dotted paths, indexes, wildcards and filters across YAML documents", () => {
    const doc = yaml(DEPLOY);
    expect(resolve(doc, "[0].spec.replicas")).toEqual([3]);
    expect(resolve(doc, "[kind=Service].spec.ports[0].targetPort")).toEqual([8080]);
    expect(resolve(doc, "[0].spec.template.spec.containers[*].name")).toEqual(["web", "sidecar"]);
    expect(resolve(doc, "[kind=Ingress].spec")).toHaveLength(1); // a missing branch stays visible…
    expect(check({ path: "[kind=Ingress].spec", op: "absent" })).toBe(true); // …so absent/exists can see it
  });

  it("requires every match for exists / eq, some for match, none for no_match", () => {
    const limits = "spec.template.spec.containers[*].resources.limits.memory";
    expect(check({ path: limits, op: "exists" })).toBe(false); // the sidecar has none
    expect(check({ path: limits, op: "count_gte", value: 1 })).toBe(true);
    const images = "spec.template.spec.containers[*].image";
    expect(check({ path: images, op: "match", value: "^nginx:" })).toBe(true); // "a container runs nginx"
    expect(check({ path: images, op: "no_match", value: ":latest$|^[^:]+$" })).toBe(false); // envoy has no tag
    expect(check({ path: "spec.template.spec.containers[0].image", op: "no_match", value: ":latest$" })).toBe(true);
    expect(check({ path: "spec.selector.matchLabels.app", op: "eq", value: "web" })).toBe(true);
    expect(check({ path: "spec.replicas", op: "gte", value: 2 })).toBe(true);
    expect(check({ path: "spec.replicas", op: "lte", value: 2 })).toBe(false);
    expect(check({ path: "spec.template.spec.containers[*].name", op: "includes", value: "sidecar" })).toBe(true);
    expect(check({ path: "spec.template.spec.containers[*].name", op: "neq", value: "db" })).toBe(true);
  });

  it("reads GitHub Actions' `on` key as a string (YAML 1.2), not as true", () => {
    const wf = "on:\n  push:\n    branches: [main]\njobs:\n  test:\n    runs-on: ubuntu-latest\n";
    expect(check({ path: "on.push.branches[*]", op: "includes", value: "main" }, wf)).toBe(true);
  });

  it("checks raw text with regexes for formats without a parser", () => {
    const dockerfile = "FROM node:20 AS build\nRUN npm ci\nFROM node:20-slim\nUSER node\n";
    const run = (c: Check) => runCheck(c, null, dockerfile);
    expect(run({ op: "count_gte", value: "^FROM\\s", n: 2 })).toBe(true);
    expect(run({ op: "match", value: "^USER\\s+(?!root\\b)\\S+" })).toBe(true);
    expect(run({ op: "no_match", value: ":latest" })).toBe(true);
    expect(run({ op: "count_lte", value: "^RUN\\s", n: 0 })).toBe(false);
  });

  it("grades a whole suite, and an unparseable file fails every check with the parser's reason", () => {
    const tests: Test[] = [
      { name: "3 replicas", input: "", output: "", check: { path: "spec.replicas", op: "eq", value: 3 } },
      { name: "has limits", input: "", output: "", check: { path: "spec.x", op: "exists" } },
    ];
    expect(gradeChecks("yaml", DEPLOY, tests, "visible")).toMatchObject({
      passed: 1,
      total: 2,
      status: "Wrong Answer",
      cases: [
        { name: "3 replicas", passed: true },
        { name: "has limits", passed: false },
      ],
    });
    const broken = gradeChecks("yaml", "spec:\n  replicas: 3\n bad: [", tests, "hidden");
    expect(broken).toMatchObject({ passed: 0, status: "Invalid file", error: expect.stringContaining("Invalid YAML") });
    expect(gradeChecks("json", "{", tests, "visible").error).toContain("Invalid JSON");
  });

  it("only keeps model checks that can run", () => {
    expect(cleanCheck({ path: "spec.replicas", op: "gte", value: 2, extra: 1 }, "yaml")).toEqual({
      path: "spec.replicas",
      op: "gte",
      value: 2,
    });
    expect(cleanCheck({ op: "count_gte", value: "^FROM", n: 2 }, "dockerfile")).toEqual({
      op: "count_gte",
      value: "^FROM",
      n: 2,
    });
    expect(cleanCheck({ path: "a", op: "exists" }, "dockerfile")).toBeNull(); // no paths without a parser
    expect(cleanCheck({ op: "exists" }, "yaml")).toBeNull(); // value ops need a path
    expect(cleanCheck({ path: "a", op: "eq" }, "yaml")).toBeNull(); // eq needs a value
    expect(cleanCheck({ op: "match", value: "(" }, "terraform")).toBeNull(); // invalid regex
    expect(cleanCheck({ op: "count_gte", value: "^FROM" }, "dockerfile")).toBeNull(); // count on text needs n
    expect(cleanCheck({ path: "a", op: "nope", value: 1 }, "yaml")).toBeNull();
  });
});
