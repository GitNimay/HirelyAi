import assert from "node:assert/strict";
import { cleanCompany, domainOf, linkExperience, memberRows, onDomain } from "./company-fields.ts";
import { cleanResume, emptyExperience } from "./resume-fields.ts";

assert.equal(domainOf("https://www.Acme.com/careers"), "acme.com");
assert.equal(domainOf("https://gmail.com/"), null); // free mail never proves anything
assert.equal(domainOf(null), null);

assert.ok(onDomain("Ada@ACME.com", "acme.com"));
assert.ok(onDomain("ada@eng.acme.com", "acme.com"));
assert.ok(!onDomain("ada@notacme.com", "acme.com"));
assert.ok(!onDomain("ada@acme.com.evil.io", "acme.com"));
assert.ok(!onDomain("ada@gmail.com", "gmail.com"));
assert.ok(!onDomain("ada@acme.com", null));

const c = cleanCompany({ name: "  Acme   Corp ", slug: "Acme", website: "acme.com", industry: "Internet", size: "huge", founded: "1999", specialties: "AI, ai, Cloud ," }, 2026);
assert.ok(typeof c === "object");
assert.equal(c.name, "Acme Corp");
assert.equal(c.slug, "acme");
assert.equal(c.domain, "acme.com");
assert.equal(c.industry, "Internet");
assert.equal(c.size, null); // not in the allowlist
assert.deepEqual(c.specialties, ["AI", "Cloud"]);
assert.equal(typeof cleanCompany({ name: "Acme", slug: "a" }), "string");
assert.equal(typeof cleanCompany({ name: "Acme", slug: "acme", website: "javascript:alert(1)" }), "string");
assert.equal(typeof cleanCompany({ name: "Acme", slug: "acme", founded: "3000" }, 2026), "string");

// Linking: a known id wins (and takes the page's name), else a unique exact name, else free text
const x = (company: string, companyId?: string, current = false) => ({ ...emptyExperience(), title: "Eng", company, companyId, current });
const pages = [{ id: "a", name: "Acme" }, { id: "b", name: "Beta" }, { id: "b2", name: "Beta" }];
const linked = linkExperience([x("acme"), x("Old name", "a"), x("Beta"), x("Gamma"), x("Gamma", "gone")], pages);
assert.deepEqual(linked.map((e) => [e.company, e.companyId]), [["Acme", "a"], ["Acme", "a"], ["Beta", undefined], ["Gamma", undefined], ["Gamma", undefined]]);

assert.deepEqual(memberRows([x("Acme", "a"), x("Acme", "a", true), x("Gamma")]), [{ companyId: "a", title: "Eng", current: true }]);

// cleanResume keeps the link, and never adds an empty one
assert.equal(cleanResume({ experience: [x("Acme", "a")] }).experience[0].companyId, "a");
assert.ok(!("companyId" in cleanResume({ experience: [x("Acme")] }).experience[0]));
console.log("company-fields: ok");
