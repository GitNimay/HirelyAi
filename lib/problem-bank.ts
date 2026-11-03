/**
 * Fallback coding problems (with hidden tests), used when per-candidate generation (lib/problem-gen.ts) fails.
 * SERVER ONLY: never import this from a client component or from anything a client component imports
 * (lib/harness.ts, lib/workspace.ts, lib/evaluator.ts); the hidden tests would ship in the page's JavaScript.
 */
import type { Difficulty, Problem } from "./workspace";

const big = (n: number, f: (i: number) => number) => Array.from({ length: n }, (_, i) => f(i)).join(" ");

export const PROBLEMS: Problem[] = [
  {
    id: "pair-sum",
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

/** Fallback problems at a difficulty (nearest difficulty first): primary, then backups. */
export function fallbackProblems(difficulty: Difficulty, n = 2): Problem[] {
  const order: Difficulty[] =
    difficulty === "easy"
      ? ["easy", "medium", "hard"]
      : difficulty === "hard"
        ? ["hard", "medium", "easy"]
        : ["medium", "easy", "hard"];
  return order.flatMap((d) => PROBLEMS.filter((p) => p.difficulty === d)).slice(0, n);
}
