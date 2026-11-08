/**
 * Fallback coding problems (with hidden tests), used when per-candidate generation (lib/problem-gen.ts) fails.
 * SERVER ONLY: never import this from a client component or from anything a client component imports
 * (lib/harness.ts, lib/workspace.ts, lib/evaluator.ts); the hidden tests would ship in the page's JavaScript.
 */
import type { Check } from "./checks";
import type { Difficulty, Problem, Test, Track } from "./workspace";

const big = (n: number, f: (i: number) => number) => Array.from({ length: n }, (_, i) => f(i)).join(" ");

export const PROBLEMS: Problem[] = [
  {
    id: "pair-sum",
    approach: "Hash map of value to index while scanning once: O(n) time, O(n) space.",
    title: "Pair with target sum",
    difficulty: "easy",
    statement:
      "Given an array of integers and a target, return the 0-based indices i < j of the two numbers that add up to the target. Exactly one pair exists.",
    input: "Line 1: n and target. Line 2: n integers.",
    output: "The two indices separated by a space.",
    constraints: "2 ≤ n ≤ 10^5, values and target fit in 32-bit signed integers.",
    signature: {
      reads: [{ ints: ["n", "target"] }, { array: "nums" }],
      args: ["nums", "target"],
      returns: 'Return the two indices as "i j" (i < j)',
    },
    visible: [
      { name: "basic", input: "4 9\n2 7 11 15", output: "0 1" },
      { name: "unsorted", input: "3 6\n3 2 4", output: "1 2" },
    ],
    hidden: [
      { name: "duplicates", input: "2 6\n3 3", output: "0 1" },
      { name: "negatives", input: "5 -8\n-1 -3 -5 4 7", output: "1 2" },
      { name: "large n", input: `100000 199997\n${big(100000, (i) => i)}`, output: "99998 99999" },
    ],
    ladder: [
      "What do you need to know about the numbers you've already seen when you look at a new one?",
      "Now assume the array is sorted and you must use O(1) extra memory.",
      "What if the array is 10 billion numbers spread across many machines?",
    ],
  },
  {
    id: "balanced-brackets",
    approach: "Stack of openers, pop and match on each closer: O(n) time, O(n) space.",
    title: "Balanced brackets",
    difficulty: "easy",
    statement: "Given a string of brackets ()[]{}, decide whether every bracket is closed in the correct order.",
    input: "One line: the string (may be empty).",
    output: "YES or NO.",
    constraints: "0 ≤ length ≤ 10^5.",
    signature: { reads: [{ str: "s" }], args: ["s"], returns: 'Return "YES" or "NO"' },
    visible: [
      { name: "simple", input: "()[]{}", output: "YES" },
      { name: "crossed", input: "([)]", output: "NO" },
    ],
    hidden: [
      { name: "empty", input: "", output: "YES" },
      { name: "only openers", input: "(((", output: "NO" },
      { name: "deep nesting", input: `${"(".repeat(50000)}${")".repeat(50000)}`, output: "YES" },
      { name: "closer first", input: "]", output: "NO" },
    ],
    ladder: [
      "When you see a closing bracket, which opening bracket must it match?",
      "Now there are also wildcard '*' characters that can be any single bracket or nothing.",
      "How would you validate a 50 GB file that doesn't fit in memory?",
    ],
  },
  {
    id: "merge-intervals",
    approach: "Sort by start, then sweep merging overlaps: O(n log n) time, O(n) space.",
    title: "Merge meeting times",
    difficulty: "medium",
    statement:
      "Given meeting intervals [start, end), merge all overlapping or touching intervals and print them sorted by start.",
    input: "Line 1: n. Next n lines: start end.",
    output: "Merged intervals as start-end pairs separated by spaces, e.g. 1-6 8-10.",
    constraints: "1 ≤ n ≤ 10^5, 0 ≤ start < end ≤ 10^9.",
    signature: {
      reads: [
        { ints: ["n"] },
        {
          rows: "n",
          fields: [
            ["starts", "int"],
            ["ends", "int"],
          ],
        },
      ],
      args: ["starts", "ends"],
      returns: 'Return the merged intervals as "s-e s-e ..." sorted by start',
    },
    visible: [
      { name: "overlap", input: "4\n1 3\n2 6\n8 10\n15 18", output: "1-6 8-10 15-18" },
      { name: "touching", input: "2\n1 4\n4 5", output: "1-5" },
    ],
    hidden: [
      { name: "single", input: "1\n5 7", output: "5-7" },
      { name: "unsorted nested", input: "3\n2 3\n1 10\n4 5", output: "1-10" },
      { name: "disjoint", input: "3\n7 8\n1 2\n4 5", output: "1-2 4-5 7-8" },
    ],
    ladder: [
      "Would it help to process the intervals in a particular order?",
      "Intervals now arrive one at a time as a stream; keep the merged set up to date.",
      "A calendar service stores this for 100M users. How do you query free slots fast?",
    ],
  },
  {
    id: "longest-unique",
    approach: "Sliding window with a last-seen map: O(n) time, O(k) space for k distinct characters.",
    title: "Longest substring without repeats",
    difficulty: "medium",
    statement: "Given a string, return the length of the longest substring with no repeated characters.",
    input: "One line: the string (printable ASCII, may be empty).",
    output: "The length.",
    constraints: "0 ≤ length ≤ 10^5.",
    signature: {
      reads: [{ str: "s" }],
      args: ["s"],
      returns: "Return the length of the longest substring without repeated characters",
    },
    visible: [
      { name: "basic", input: "abcabcbb", output: "3" },
      { name: "all same", input: "bbbbb", output: "1" },
    ],
    hidden: [
      { name: "empty", input: "", output: "0" },
      { name: "middle", input: "pwwkew", output: "3" },
      { name: "spaces", input: "a b c a", output: "3" },
      { name: "long", input: "abcdefghijklmnopqrstuvwxyz".repeat(3000), output: "26" },
    ],
    ladder: [
      "Can you keep a window of characters and move both ends instead of restarting?",
      "Now allow at most k repeated characters inside the substring.",
      "How would this change for a stream of characters you can only read once?",
    ],
  },
  {
    id: "rate-limiter",
    approach: "Per-key deque of recent timestamps, evicting those outside the window: O(1) amortized per request.",
    title: "Sliding-window rate limiter",
    difficulty: "hard",
    statement:
      "Requests arrive with a user id and a timestamp in seconds (non-decreasing). Each user may make at most L requests in any window of W seconds (a request at time t counts against [t-W+1, t]). For each request print ALLOW or DENY. Denied requests don't count.",
    input: "Line 1: L W q. Next q lines: user timestamp.",
    output: "One token per request, ALLOW or DENY, separated by spaces.",
    constraints: "1 ≤ q ≤ 10^5, 1 ≤ L ≤ 10^4, 1 ≤ W ≤ 10^6.",
    signature: {
      reads: [
        { ints: ["limit", "window", "q"] },
        {
          rows: "q",
          fields: [
            ["users", "str"],
            ["times", "int"],
          ],
        },
      ],
      args: ["limit", "window", "users", "times"],
      returns: 'Return "ALLOW" or "DENY" for each request, separated by spaces',
    },
    visible: [{ name: "basic", input: "2 10 4\na 1\na 2\na 3\na 11", output: "ALLOW ALLOW DENY ALLOW" }],
    hidden: [
      { name: "two users", input: "1 5 4\na 1\nb 1\na 2\nb 6", output: "ALLOW ALLOW DENY ALLOW" },
      { name: "window edge", input: "1 3 3\nx 1\nx 3\nx 4", output: "ALLOW DENY ALLOW" },
      { name: "denied not counted", input: "1 2 3\nu 1\nu 2\nu 3", output: "ALLOW DENY ALLOW" },
    ],
    ladder: [
      "What do you need to remember per user to answer each request?",
      "Memory is tight: approximate it with fixed counters instead of keeping every timestamp.",
      "Now the limiter runs on 50 servers behind a load balancer. How do they agree?",
    ],
  },
];

/** A config-environment requirement: shown to the candidate as `name`, graded by `check`. */
const req = (name: string, check: Check): Test => ({ name, input: "", output: "", check });

/**
 * DevOps and data problems, one per environment (see ENVS in workspace.ts). Config environments carry structural
 * checks; script environments carry real stdin / expected output. Reference solutions live in problem-bank.test.ts.
 */
export const ENV_PROBLEMS: Problem[] = [
  {
    id: "env-yaml-1",
    env: "yaml",
    approach:
      "Make the selector match the pod labels, align the probe port with containerPort, add limits, pin the image.",
    title: "Fix a broken Deployment",
    difficulty: "medium",
    statement:
      "This Kubernetes Deployment for the `web` app never becomes ready. Fix it: the selector must match the pod template labels (the app label is `web`), the readiness probe must hit the container's port (8080), the container needs CPU and memory requests and limits, and the image must be pinned to a specific version instead of `latest`.",
    input: "A Kubernetes Deployment manifest (YAML).",
    output: "The corrected manifest.",
    constraints: "Keep the Deployment name, replicas (2 or more), and the container port 8080.",
    starter: `apiVersion: apps/v1
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
        app: webapp
    spec:
      containers:
        - name: web
          image: nginx:latest
          ports:
            - containerPort: 8080
          readinessProbe:
            httpGet:
              path: /healthz
              port: 80
`,
    visible: [
      req("Selector matches app: web", { path: "spec.selector.matchLabels.app", op: "eq", value: "web" }),
      req("Pod template label app is web", { path: "spec.template.metadata.labels.app", op: "eq", value: "web" }),
      req("Readiness probe port is 8080", {
        path: "spec.template.spec.containers[*].readinessProbe.httpGet.port",
        op: "eq",
        value: 8080,
      }),
      req("Memory limit is set", { path: "spec.template.spec.containers[*].resources.limits.memory", op: "exists" }),
      req("Image is pinned (not latest, not untagged)", {
        path: "spec.template.spec.containers[*].image",
        op: "no_match",
        value: ":latest$|^[^:]+$",
      }),
    ],
    hidden: [
      req("CPU limit is set", { path: "spec.template.spec.containers[*].resources.limits.cpu", op: "exists" }),
      req("Memory request is set", {
        path: "spec.template.spec.containers[*].resources.requests.memory",
        op: "exists",
      }),
      req("Container port is still 8080", {
        path: "spec.template.spec.containers[*].ports[0].containerPort",
        op: "eq",
        value: 8080,
      }),
      req("Still 2 or more replicas", { path: "spec.replicas", op: "gte", value: 2 }),
    ],
    ladder: [
      "A Deployment only manages pods whose labels match its selector. Compare the two label blocks.",
      "Add a liveness probe too, and explain how it should differ from the readiness probe.",
      "Pods get OOM-killed under load. How do you choose requests vs limits, and what would you add to scale this automatically?",
    ],
  },
  {
    id: "env-yaml-2",
    env: "yaml",
    approach:
      "A push/pull_request trigger on main and a single test job: checkout, setup-node 20 with cache, npm ci, npm test.",
    title: "Write a CI workflow",
    difficulty: "easy",
    statement:
      "Write a GitHub Actions workflow that runs the tests of a Node project. It runs on pushes to `main` and on pull requests targeting `main`. One job named `test` runs on `ubuntu-latest` and: checks out the code with `actions/checkout@v4`, sets up Node 20 with `actions/setup-node@v4` (caching npm), runs `npm ci`, then runs `npm test`.",
    input: "A partial GitHub Actions workflow (YAML).",
    output: "The complete workflow.",
    constraints: "Use the job name `test` and the action versions given.",
    starter: `name: CI
on:
  push:
jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - run: npm test
`,
    visible: [
      req("Runs on pushes to main", { path: "on.push.branches[*]", op: "includes", value: "main" }),
      req("Runs on pull requests to main", { path: "on.pull_request.branches[*]", op: "includes", value: "main" }),
      req("Job test runs on ubuntu-latest", { path: "jobs.test.runs-on", op: "eq", value: "ubuntu-latest" }),
      req("Checks out the code", { path: "jobs.test.steps[uses=actions/checkout@v4].uses", op: "exists" }),
      req("Sets up Node 20", {
        path: "jobs.test.steps[uses=actions/setup-node@v4].with.node-version",
        op: "eq",
        value: 20,
      }),
      req("Runs npm ci", { path: "jobs.test.steps[*].run", op: "includes", value: "npm ci" }),
      req("Runs npm test", { path: "jobs.test.steps[*].run", op: "includes", value: "npm test" }),
    ],
    hidden: [
      req("Caches npm dependencies", {
        path: "jobs.test.steps[uses=actions/setup-node@v4].with.cache",
        op: "eq",
        value: "npm",
      }),
      req("Checkout is the first step", { path: "jobs.test.steps[0].uses", op: "eq", value: "actions/checkout@v4" }),
      req("Does not use pull_request_target", { op: "no_match", value: "pull_request_target" }),
    ],
    ladder: [
      "Steps run top to bottom in one runner. What has to exist before `npm ci` can work?",
      "Also run the tests on Node 18, 20 and 22. How do you do that without copying the job?",
      "The test job takes 12 minutes. What would you do to bring it down, and how do you stop stale runs piling up on a PR?",
    ],
  },
  {
    id: "env-dockerfile-1",
    env: "dockerfile",
    approach:
      "Build stage: copy manifests, install, copy source, build. Runtime stage: production deps only, non-root user.",
    title: "Multi-stage Node image",
    difficulty: "medium",
    statement:
      "This single-stage Dockerfile builds a Node app (`npm run build` produces `dist/`, started with `node dist/server.js`). Turn it into a multi-stage build: a build stage and a slim runtime stage, both on a pinned Node 20 tag (for example `node:20-alpine`, never `latest`). Install dependencies before copying the rest of the source so the layer caches, keep only production dependencies in the final image, and run as a non-root user.",
    input: "A Dockerfile.",
    output: "The improved Dockerfile.",
    constraints: "The app listens on port 3000. Do not switch the final image to root.",
    starter: `FROM node:latest
WORKDIR /app
COPY . .
RUN npm install
RUN npm run build
EXPOSE 3000
CMD ["node", "dist/server.js"]
`,
    visible: [
      req("At least two stages", { op: "count_gte", value: "^FROM\\s", n: 2 }),
      req("Both stages use a pinned node:<version> tag", { op: "count_gte", value: "^FROM\\s+node:\\d", n: 2 }),
      req("Runs as a non-root user", { op: "match", value: "^USER\\s+(?!root\\b)\\S+" }),
      req("Dependency manifests are copied before the install", {
        op: "match",
        value: "^COPY\\s[^\\n]*package[^\\n]*\\n(?:[^\\n]*\\n)*?RUN\\s[^\\n]*npm\\s+(ci|install)",
      }),
      req("Source is copied after the install", {
        op: "match",
        value: "npm\\s+(ci|install)[^\\n]*\\n(?:[^\\n]*\\n)*?COPY\\s+(?!--)\\S",
      }),
    ],
    hidden: [
      req("Final stage copies the build output with COPY --from", { op: "match", value: "^COPY\\s+--from=" }),
      req("Production dependencies only", { op: "match", value: "--omit=dev|--only=prod|--production|npm\\s+prune" }),
      req("Never switches to root", { op: "no_match", value: "^USER\\s+(root|0)\\s*$" }),
      req("Still starts dist/server.js", { op: "match", value: "^CMD\\s.*dist/server\\.js" }),
    ],
    ladder: [
      "Which layers change on every commit, and which only when dependencies change? Order the instructions accordingly.",
      "Also add a HEALTHCHECK and make the image reproducible for CI: what would you change?",
      "The image is still 400 MB and builds take minutes in CI. Where would you look, and what would you cache?",
    ],
  },
  {
    id: "env-terraform-1",
    env: "terraform",
    approach:
      "Add aws_s3_bucket_versioning (Enabled) and aws_s3_bucket_public_access_block (four flags true), both referencing the bucket.",
    title: "Secure an S3 bucket",
    difficulty: "medium",
    statement:
      "The `aws_s3_bucket.assets` resource below is a bare bucket. Add the resources that turn on versioning (`aws_s3_bucket_versioning`, status Enabled) and block all public access (`aws_s3_bucket_public_access_block` with all four flags set to true). Both must reference the bucket.",
    input: "A Terraform file (HCL).",
    output: "The complete file.",
    constraints: "AWS provider v5 style: separate resources, not inline arguments on the bucket. Keep the bucket name.",
    starter: `resource "aws_s3_bucket" "assets" {
  bucket = "acme-assets-prod"
}
`,
    visible: [
      req("Has an aws_s3_bucket_versioning resource", { op: "match", value: 'resource\\s+"aws_s3_bucket_versioning"' }),
      req("Versioning status is Enabled", {
        op: "match",
        value: 'versioning_configuration\\s*\\{[^}]*status\\s*=\\s*"Enabled"',
      }),
      req("Has an aws_s3_bucket_public_access_block resource", {
        op: "match",
        value: 'resource\\s+"aws_s3_bucket_public_access_block"',
      }),
      req("All four public-access flags are true", {
        op: "count_gte",
        value: "(block_public_acls|block_public_policy|ignore_public_acls|restrict_public_buckets)\\s*=\\s*true",
        n: 4,
      }),
    ],
    hidden: [
      req("Both new resources reference aws_s3_bucket.assets", {
        op: "count_gte",
        value: "bucket\\s*=\\s*aws_s3_bucket\\.assets\\b",
        n: 2,
      }),
      req("No flag is set to false", { op: "no_match", value: "=\\s*false\\b" }),
      req("Bucket name is unchanged", { op: "match", value: 'bucket\\s*=\\s*"acme-assets-prod"' }),
    ],
    ladder: [
      "In provider v5 these settings are separate resources. How does each one point at the bucket?",
      "Also encrypt the bucket by default with a KMS key. Which resource is that?",
      "You have 40 such buckets across 3 accounts. How do you stop people creating unsafe ones?",
    ],
  },
  {
    id: "env-bash-1",
    env: "bash",
    approach: "awk counts 5xx per path in one pass, then sort by count desc and path asc: O(n log k).",
    title: "5xx errors per path",
    difficulty: "easy",
    statement:
      "Read a web access log from standard input. Each line is `IP METHOD PATH STATUS`. Print, for every path that had at least one 5xx response (status 500-599), the path and the number of such responses, as `path count`. Sort by count descending, then by path ascending (byte order). Print nothing if there are no 5xx responses.",
    input: "Lines of `IP METHOD PATH STATUS` on stdin (possibly none).",
    output: "One `path count` line per path.",
    constraints: "Fields are single-space separated; paths contain no spaces.",
    starter: `#!/usr/bin/env bash
# Read the access log from stdin and print "path count" for 5xx responses.
cat
`,
    visible: [
      {
        name: "mixed statuses",
        input:
          "10.0.0.1 GET /api/users 500\n10.0.0.2 GET /api/users 200\n10.0.0.3 POST /api/orders 503\n10.0.0.1 GET /api/users 502\n10.0.0.4 GET /health 200\n10.0.0.5 POST /api/orders 500\n10.0.0.6 POST /api/orders 504",
        output: "/api/orders 3\n/api/users 2",
      },
      {
        name: "tie and 4xx",
        input: "1.1.1.1 GET /b 500\n1.1.1.2 GET /a 502\n1.1.1.3 GET /c 404\n1.1.1.4 GET /a 200",
        output: "/a 1\n/b 1",
      },
    ],
    hidden: [
      { name: "empty input", input: "", output: "" },
      { name: "no 5xx", input: "9.9.9.9 GET /x 200\n9.9.9.9 GET /y 404\n9.9.9.9 GET /z 301", output: "" },
      {
        name: "ties ordered by path",
        input:
          "1.2.3.4 GET /z 500\n1.2.3.4 GET /a 500\n1.2.3.4 GET /z 500\n1.2.3.4 GET /a 503\n1.2.3.4 GET /m 500\n1.2.3.4 GET /m 500\n1.2.3.4 GET /m 599",
        output: "/m 3\n/a 2\n/z 2",
      },
      {
        name: "status boundaries",
        input: "5.5.5.5 GET /x 500\n5.5.5.5 GET /x 599\n5.5.5.5 GET /y 499\n5.5.5.5 GET /y 600\n5.5.5.5 GET /q?a=1 504",
        output: "/x 2\n/q?a=1 1",
      },
    ],
    ladder: [
      "Think of it as three steps: filter the lines, count per path, sort. Which tools do each?",
      "Also print the most frequent client IP for each path.",
      "The log is 200 GB across many rotated files. How would you run this efficiently, and what changes if it streams in live?",
    ],
  },
  {
    id: "env-sql-1",
    env: "sql",
    approach: "GROUP BY customer with HAVING COUNT(*) >= 2, ORDER BY the sum then the customer: one scan, O(n log n).",
    title: "Top repeat customers",
    difficulty: "medium",
    statement:
      "The `orders` table has `id`, `customer`, and `amount` (whole dollars, refunds are negative). Write one query that returns, for each customer with at least 2 orders, the customer and their total amount. Select exactly two columns in that order: `customer`, then the total. Sort by total descending, then by customer ascending.",
    input: "Table orders(id INTEGER, customer TEXT, amount INTEGER), created before your query runs.",
    output: "Rows `customer|total`, one per qualifying customer, no header.",
    constraints: "SQLite. A single SELECT statement ending with a semicolon.",
    starter: `-- Table: orders(id INTEGER, customer TEXT, amount INTEGER)
SELECT customer, amount FROM orders;
`,
    visible: [
      {
        name: "ties and singles",
        input:
          "CREATE TABLE orders (id INTEGER PRIMARY KEY, customer TEXT NOT NULL, amount INTEGER NOT NULL);\nINSERT INTO orders (customer, amount) VALUES ('alice',50),('alice',70),('bob',200),('carol',30),('carol',40),('carol',50),('dave',10),('dave',10);",
        output: "alice|120\ncarol|120\ndave|20",
      },
      {
        name: "ordering by total",
        input:
          "CREATE TABLE orders (id INTEGER PRIMARY KEY, customer TEXT NOT NULL, amount INTEGER NOT NULL);\nINSERT INTO orders (customer, amount) VALUES ('x',5),('y',7),('x',5),('y',8),('y',9);",
        output: "y|24\nx|10",
      },
    ],
    hidden: [
      {
        name: "empty table",
        input: "CREATE TABLE orders (id INTEGER PRIMARY KEY, customer TEXT NOT NULL, amount INTEGER NOT NULL);",
        output: "",
      },
      {
        name: "only single orders",
        input:
          "CREATE TABLE orders (id INTEGER PRIMARY KEY, customer TEXT NOT NULL, amount INTEGER NOT NULL);\nINSERT INTO orders (customer, amount) VALUES ('a',1),('b',2),('c',3);",
        output: "",
      },
      {
        name: "refunds count as orders",
        input:
          "CREATE TABLE orders (id INTEGER PRIMARY KEY, customer TEXT NOT NULL, amount INTEGER NOT NULL);\nINSERT INTO orders (customer, amount) VALUES ('sam',100),('sam',-20),('tia',90),('tia',-10);",
        output: "sam|80\ntia|80",
      },
      {
        name: "exactly two orders, tie by customer",
        input:
          "CREATE TABLE orders (id INTEGER PRIMARY KEY, customer TEXT NOT NULL, amount INTEGER NOT NULL);\nINSERT INTO orders (customer, amount) VALUES ('zed',15),('al',20),('zed',15),('al',10),('mo',99);",
        output: "al|30\nzed|30",
      },
    ],
    ladder: [
      "You need to filter on an aggregate. Which clause filters groups rather than rows?",
      "Also show each customer's number of orders and their average order value, rounded to 2 decimals.",
      "The table has 500M rows. What indexes or pre-aggregation would you use, and how would this change for a dashboard that runs it every minute?",
    ],
  },
  {
    id: "env-json-1",
    env: "json",
    approach: "One Allow statement with s3:GetObject on arn:aws:s3:::acme-data/reports/*, nothing broader.",
    title: "Least-privilege IAM policy",
    difficulty: "easy",
    statement:
      "This IAM policy gives a reporting service full access to everything in S3. Rewrite it so the service can only read objects (`s3:GetObject`) under the `reports/` prefix of the bucket `acme-data`. No listing, no writes, no wildcard actions, no wildcard-only resource.",
    input: "An IAM policy document (JSON).",
    output: "The least-privilege policy.",
    constraints: "Keep Version 2012-10-17 and a Statement list.",
    starter: `{
  "Version": "2012-10-17",
  "Statement": [
    { "Effect": "Allow", "Action": "s3:*", "Resource": "*" }
  ]
}
`,
    visible: [
      req("Statements allow access", { path: "Statement[*].Effect", op: "eq", value: "Allow" }),
      req("No wildcard actions", { path: "Statement[*].Action", op: "no_match", value: "\\*" }),
      req("Grants s3:GetObject", { op: "match", value: '"s3:GetObject"' }),
      req("Resource is limited to acme-data/reports/", {
        path: "Statement[*].Resource",
        op: "match",
        value: "arn:aws:s3:::acme-data/reports/",
      }),
    ],
    hidden: [
      req("Version is 2012-10-17", { path: "Version", op: "eq", value: "2012-10-17" }),
      req("No write or delete actions", { op: "no_match", value: "s3:(Put|Delete|Replicate|Restore)" }),
      req("No resource that is just a wildcard", {
        path: "Statement[*].Resource",
        op: "no_match",
        value: '^\\*$|"\\*"',
      }),
    ],
    ladder: [
      "Which part of the ARN limits the policy to one bucket and one prefix?",
      "Now also allow listing the bucket, but only the `reports/` prefix. Which condition key does that?",
      "Ten services need similar scoped access. How do you manage it without ten hand-edited policies, and how do you catch an over-broad one in review?",
    ],
  },
];

const ALL = [...PROBLEMS, ...ENV_PROBLEMS];
const trackOf = (p: Problem): Track => p.env ?? "code";
const RANK: Record<Difficulty, number> = { easy: 0, medium: 1, hard: 2 };

/**
 * Fallback problems: n of them, never duplicates. Tracks are visited in order (the first track's best match first),
 * nearest difficulty first. With n >= 3 the last one is easier than the first when the bank has one (same track
 * preferred, then the other tracks, then general code), so the round can step down if the candidate struggles.
 */
export function fallbackProblems(difficulty: Difficulty, n = 2, tracks: Track[] = ["code"]): Problem[] {
  const ts: Track[] = tracks.length ? tracks : ["code"];
  const order: Difficulty[] =
    difficulty === "easy"
      ? ["easy", "medium", "hard"]
      : difficulty === "hard"
        ? ["hard", "medium", "easy"]
        : ["medium", "easy", "hard"];
  const near = (t: Track) => order.flatMap((d) => ALL.filter((p) => trackOf(p) === t && p.difficulty === d));
  const out: Problem[] = [];
  const take = (ps: Problem[]) => {
    const p = ps.find((x) => !out.includes(x));
    if (p) out.push(p);
    return !!p;
  };
  const fill = (count: number) => {
    for (let i = 0; out.length < count && i < count + ts.length; i++)
      [near(ts[i % ts.length]), ts.flatMap(near), near("code")].some(take);
  };
  fill(n >= 3 ? n - 1 : n);
  if (n >= 3 && out.length) {
    const first = RANK[out[0].difficulty];
    const lower = (t: Track) =>
      ALL.filter((p) => trackOf(p) === t && RANK[p.difficulty] < first).sort(
        (a, b) => RANK[b.difficulty] - RANK[a.difficulty],
      );
    [trackOf(out[0]), ...ts, "code" as Track].some((t) => take(lower(t)));
  }
  fill(n);
  return out;
}
