#!/usr/bin/env node
// Usage: node name-check.mjs <name> [more names...]
// Checks an invented product name against real products: npm, PyPI, GitHub, the App Store and
// <name>.com/.app/.io/.ai. Sends only the name to those public services. Also do one web search
// for "<name> app" before using it: no script covers every product.
import { promises as dns } from "node:dns";
import { args } from "./_util.mjs";
import { slugName, verdict } from "../lib/names.mjs";

const get = async (url) => {
  try {
    const r = await fetch(url, { headers: { "user-agent": "name-check" }, signal: AbortSignal.timeout(10000) });
    const text = await r.text();
    let json = null;
    try { json = JSON.parse(text); } catch {} // the App Store answers JSON as text/javascript
    return { status: r.status, json };
  } catch {
    return { status: 0 };
  }
};
const status = (s, found) => (s === 0 || s === 403 || s === 429 ? null : found);

async function check(name) {
  const slug = slugName(name), low = name.toLowerCase();
  const hits = [];
  const npm = await get(`https://registry.npmjs.org/${slug}`);
  hits.push({ source: "npm", found: status(npm.status, npm.status === 200), weak: true, detail: `package "${slug}" exists` });
  const pypi = await get(`https://pypi.org/pypi/${slug}/json`);
  hits.push({ source: "PyPI", found: status(pypi.status, pypi.status === 200), weak: true, detail: `package "${slug}" exists` });
  const gh = await get(`https://api.github.com/search/repositories?q=${encodeURIComponent(name)}+in:name&sort=stars&per_page=20`);
  const ghHit = gh.json?.items?.find((r) => r.name.toLowerCase() === low && r.stargazers_count >= 50);
  hits.push({ source: "GitHub", found: status(gh.status, !!ghHit), detail: ghHit ? `${ghHit.full_name} (${ghHit.stargazers_count} stars)` : "" });
  // an app whose title has the name as a whole word ("SNIP — Type Collector", "Mathpix Snip")
  const word = (t) => t.toLowerCase().split(/[^a-z0-9]+/).includes(low.replace(/[^a-z0-9]/g, ""));
  for (const entity of ["software", "macSoftware"]) {
    const app = await get(`https://itunes.apple.com/search?term=${encodeURIComponent(name)}&entity=${entity}&limit=25`);
    const appHit = app.json?.results?.find((r) => word(r.trackName));
    hits.push({ source: entity === "software" ? "App Store" : "Mac App Store", found: status(app.status, !!appHit), detail: appHit ? `"${appHit.trackName}" by ${appHit.artistName}` : "" });
  }
  for (const tld of ["com", "app", "io", "ai"]) {
    const host = `${slug.replace(/-/g, "")}.${tld}`;
    const found = await dns.resolve(host).then(() => true, (e) => (e.code === "ENOTFOUND" || e.code === "ENODATA" ? false : null));
    hits.push({ source: host, found, weak: true, detail: "domain is registered (may be parked)" });
  }
  return verdict(name, hits);
}

const names = args()._;
if (!names.length) { console.error("usage: name-check.mjs <name> [more...]"); process.exit(1); }
let bad = 0;
for (const n of names) {
  const v = await check(n);
  if (!v.ok) bad++;
  console.log(`${v.ok ? "FREE " : "TAKEN"} ${n}${v.shape.length ? `  (${v.shape.join("; ")})` : ""}`);
  v.taken.forEach((t) => console.log(`  - ${t}`));
  if (v.notes.length) console.log(`  notes: ${v.notes.join("; ")}`);
  if (v.unchecked.length) console.log(`  not checked (service refused): ${v.unchecked.join(", ")}`);
}
console.log("Also search the web for \"<name> app\" before using a name.");
process.exit(bad ? 2 : 0);
