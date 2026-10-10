// Deploy workflow: prints the SQL that queues this release for the /changelog writer (lib/changelog.ts, cron).
// Input: TAG (v1.2.3) and pr.json ({ title, body } of the merged PR). INSERT OR IGNORE: a re-run deploy adds nothing.
import { readFileSync } from "node:fs";

const pr = JSON.parse(readFileSync("pr.json", "utf8") || "{}");
const version = process.env.TAG.replace(/^v/, "");
if (!/^\d+\.\d+\.\d+$/.test(version)) throw new Error(`bad tag ${process.env.TAG}`);
const source = `Title: ${pr.title ?? ""}\n\n${pr.body ?? ""}`.slice(0, 3000);
const q = (s) => `'${s.replaceAll("'", "''")}'`;
console.log(`INSERT OR IGNORE INTO releases (version, released_at, source) VALUES (${q(version)}, ${q(new Date().toISOString())}, ${q(source)});`);
