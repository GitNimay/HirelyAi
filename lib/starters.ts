/**
 * HackerRank-style starter code, generated per problem and language from the problem's input signature: the
 * multi-case stdin is already parsed into typed variables, so the candidate only writes solve(). Pure; the
 * signature is public (it describes the input format, never the tests).
 */
import type { Language } from "./workspace";

/** One line (or block) of a test case's input. Rows become one parallel array per field. */
export type Read =
  | { ints: string[] } // one line of space-separated integers, e.g. "n target"
  | { array: string } // one line: an integer array
  | { str: string } // one whole line (may be empty)
  | { rows: string; fields: [name: string, type: "int" | "str"][] }; // `rows` lines (count = an earlier int), one entry per line
export type Signature = { reads: Read[]; args: string[]; returns: string };

type Kind = "int" | "ints" | "str" | "strs";
function kinds(sig: Signature) {
  const k = new Map<string, Kind>();
  for (const r of sig.reads) {
    if ("ints" in r) r.ints.forEach((n) => k.set(n, "int"));
    else if ("array" in r) k.set(r.array, "ints");
    else if ("str" in r) k.set(r.str, "str");
    else r.fields.forEach(([n, t]) => k.set(n, t === "int" ? "ints" : "strs"));
  }
  return k;
}

const indent = (s: string, n: number) =>
  s
    .split("\n")
    .map((l) => " ".repeat(n) + l)
    .join("\n");

function python(sig: Signature) {
  const reads = sig.reads.map((r) => {
    if ("ints" in r)
      return r.ints.length === 1 ? `${r.ints[0]} = int(lines[i]); i += 1` : `${r.ints.join(", ")} = map(int, lines[i].split()); i += 1`;
    if ("array" in r) return `${r.array} = list(map(int, lines[i].split())); i += 1`;
    if ("str" in r) return `${r.str} = lines[i] if i < len(lines) else ""; i += 1`;
    const names = r.fields.map(([n]) => n);
    const push = r.fields.map(([n, t], j) => `${n}.append(${t === "int" ? `int(p[${j}])` : `p[${j}]`})`).join("; ");
    return `${names.join(", ")} = ${names.map(() => "[]").join(", ")}\nfor _ in range(${r.rows}):\n    p = lines[i].split(); ${push}; i += 1`;
  });
  return `import sys


def solve(${sig.args.join(", ")}):
    # ${sig.returns}
    return ""


def main():
    lines = sys.stdin.read().split("\\n")
    i = 0
    t = int(lines[i]); i += 1
    out = []
    for _ in range(t):
${indent(reads.join("\n"), 8)}
        out.append(str(solve(${sig.args.join(", ")})))
    print("\\n".join(out))


main()
`;
}

function js(sig: Signature, ts: boolean) {
  const k = kinds(sig);
  const type = (n: string) => (ts ? `: ${{ int: "number", ints: "number[]", str: "string", strs: "string[]" }[k.get(n)!]}` : "");
  const reads = sig.reads.map((r) => {
    if ("ints" in r)
      return r.ints.length === 1
        ? `const ${r.ints[0]} = Number(lines[i++]);`
        : `const [${r.ints.join(", ")}] = lines[i++].trim().split(/\\s+/).map(Number);`;
    if ("array" in r) return `const ${r.array} = lines[i++].trim().split(/\\s+/).map(Number);`;
    if ("str" in r) return `const ${r.str} = lines[i++] || "";`;
    const decl = r.fields.map(([n, t]) => `const ${n}${ts ? `: ${t === "int" ? "number" : "string"}[]` : ""} = [];`).join("\n");
    const push = r.fields.map(([n, t], j) => `${n}.push(${t === "int" ? `Number(p[${j}])` : `p[${j}]`});`).join(" ");
    return `${decl}\nfor (let r = 0; r < ${r.rows}; r++) {\n  const p = lines[i++].trim().split(/\\s+/);\n  ${push}\n}`;
  });
  return `${ts ? "declare const require: any;\n" : ""}const lines${ts ? ": string[]" : ""} = require("fs").readFileSync(0, "utf8").split("\\n");
let i = 0;

function solve(${sig.args.map((a) => `${a}${type(a)}`).join(", ")})${ts ? ": string" : ""} {
  // ${sig.returns}
  return "";
}

const t = Number(lines[i++]);
const out${ts ? ": string[]" : ""} = [];
for (let c = 0; c < t; c++) {
${indent(reads.join("\n"), 2)}
  out.push(String(solve(${sig.args.join(", ")})));
}
console.log(out.join("\\n"));
`;
}

function java(sig: Signature) {
  const k = kinds(sig);
  const T = { int: "int", ints: "int[]", str: "String", strs: "String[]" };
  const reads = sig.reads.map((r, x) => {
    if ("ints" in r)
      return `StringTokenizer st${x} = new StringTokenizer(br.readLine());\n${r.ints.map((n) => `int ${n} = Integer.parseInt(st${x}.nextToken());`).join("\n")}`;
    if ("array" in r) return `int[] ${r.array} = Arrays.stream(br.readLine().trim().split("\\\\s+")).mapToInt(Integer::parseInt).toArray();`;
    if ("str" in r) return `String ${r.str} = br.readLine();\nif (${r.str} == null) ${r.str} = "";`;
    const decl = r.fields.map(([n, t]) => `${t === "int" ? "int" : "String"}[] ${n} = new ${t === "int" ? "int" : "String"}[${r.rows}];`).join("\n");
    const set = r.fields.map(([n, t], j) => `${n}[r] = ${t === "int" ? `Integer.parseInt(p[${j}])` : `p[${j}]`};`).join(" ");
    return `${decl}\nfor (int r = 0; r < ${r.rows}; r++) {\n    String[] p = br.readLine().trim().split("\\\\s+");\n    ${set}\n}`;
  });
  return `import java.io.*;
import java.util.*;

public class Main {
    static String solve(${sig.args.map((a) => `${T[k.get(a)!]} ${a}`).join(", ")}) {
        // ${sig.returns}
        return "";
    }

    public static void main(String[] argv) throws IOException {
        BufferedReader br = new BufferedReader(new InputStreamReader(System.in));
        int t = Integer.parseInt(br.readLine().trim());
        StringBuilder out = new StringBuilder();
        for (int c = 0; c < t; c++) {
${indent(reads.join("\n"), 12)}
            out.append(solve(${sig.args.join(", ")})).append("\\n");
        }
        System.out.print(out);
    }
}
`;
}

function cpp(sig: Signature) {
  const k = kinds(sig);
  const T = { int: "long long", ints: "const vector<long long>&", str: "const string&", strs: "const vector<string>&" };
  const reads = sig.reads.map((r) => {
    if ("ints" in r)
      return `getline(cin, line);\nlong long ${r.ints.join(", ")};\n{ istringstream ss(line); ss >> ${r.ints.join(" >> ")}; }`;
    if ("array" in r)
      return `getline(cin, line);\nvector<long long> ${r.array};\n{ istringstream ss(line); long long x; while (ss >> x) ${r.array}.push_back(x); }`;
    if ("str" in r) return `string ${r.str};\nif (!getline(cin, ${r.str})) ${r.str} = "";\nif (!${r.str}.empty() && ${r.str}.back() == '\\r') ${r.str}.pop_back();`;
    const decl = r.fields.map(([n, t]) => `vector<${t === "int" ? "long long" : "string"}> ${n}(${r.rows});`).join("\n");
    return `${decl}\nfor (long long r = 0; r < ${r.rows}; r++) {\n    getline(cin, line);\n    istringstream ss(line);\n    ss >> ${r.fields.map(([n]) => `${n}[r]`).join(" >> ")};\n}`;
  });
  return `#include <bits/stdc++.h>
using namespace std;

string solve(${sig.args.map((a) => `${T[k.get(a)!]} ${a}`).join(", ")}) {
    // ${sig.returns}
    return "";
}

int main() {
    ios::sync_with_stdio(false);
    string line;
    getline(cin, line);
    int t = stoi(line);
    for (int c = 0; c < t; c++) {
${indent(reads.join("\n"), 8)}
        cout << solve(${sig.args.join(", ")}) << "\\n";
    }
}
`;
}

function go(sig: Signature) {
  const k = kinds(sig);
  const T = { int: "int", ints: "[]int", str: "string", strs: "[]string" };
  const reads = sig.reads.map((r, x) => {
    if ("ints" in r) return `f${x} := strings.Fields(next())\n${r.ints.map((n, j) => `${n} := atoi(f${x}[${j}])`).join("\n")}`;
    if ("array" in r) return `f${x} := strings.Fields(next())\n${r.array} := make([]int, len(f${x}))\nfor j, v := range f${x} {\n\t${r.array}[j] = atoi(v)\n}`;
    if ("str" in r) return `${r.str} := strings.TrimRight(next(), "\\r")`;
    const decl = r.fields.map(([n, t]) => `${n} := make([]${t === "int" ? "int" : "string"}, ${r.rows})`).join("\n");
    const set = r.fields.map(([n, t], j) => `${n}[r] = ${t === "int" ? `atoi(p[${j}])` : `p[${j}]`}`).join("\n\t");
    return `${decl}\nfor r := 0; r < ${r.rows}; r++ {\n\tp := strings.Fields(next())\n\t${set}\n}`;
  });
  // Go rejects unused variables: read-but-unused inputs (like n) are explicitly discarded
  const unused = [...k.keys()].filter((n) => !sig.args.includes(n));
  const body = [...reads, ...unused.map((n) => `_ = ${n}`)].join("\n").replaceAll("    ", "\t");
  return `package main

import (
	"bufio"
	"fmt"
	"os"
	"strconv"
	"strings"
)

func solve(${sig.args.map((a) => `${a} ${T[k.get(a)!]}`).join(", ")}) string {
	// ${sig.returns}
	return ""
}

func main() {
	sc := bufio.NewScanner(os.Stdin)
	sc.Buffer(make([]byte, 1<<20), 1<<26)
	next := func() string {
		if sc.Scan() {
			return sc.Text()
		}
		return ""
	}
	atoi := func(s string) int { n, _ := strconv.Atoi(strings.TrimSpace(s)); return n }
	_ = atoi
	t := atoi(next())
	out := []string{}
	for c := 0; c < t; c++ {
${body
  .split("\n")
  .map((l) => `\t\t${l}`)
  .join("\n")}
		out = append(out, solve(${sig.args.join(", ")}))
	}
	fmt.Println(strings.Join(out, "\\n"))
}
`;
}

export function starters(sig: Signature): Record<Language, string> {
  return { python: python(sig), javascript: js(sig, false), typescript: js(sig, true), java: java(sig), cpp: cpp(sig), go: go(sig) };
}
