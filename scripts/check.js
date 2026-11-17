// Consistency check for the published prototypes (no dependencies).
// No arguments: checks every prototype in public/ except index.html, latest.html and public/archive/.
// With file paths: checks only those files, wherever they are — e.g. a draft in your working
// folder, before it is published.
// Run: node scripts/check.js [file...]   (exit code 1 = problems found)
"use strict";
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const PUBLIC = path.join(__dirname, "..", "public");

// Token hex values allowed in prototypes. This list IS the design system as far as the check
// is concerned: a hex that is not here fails the build. Replace the whole list with your
// project's tokens, and keep templates/_template.html's :root block in step with it.
// (Placeholder set: a neutral dark palette, matching the template that ships with this repo.)
const ALLOWED = new Set([
  "#141414", "#18181b", "#000000", "#27272a", "#3f3f46",           // surfaces, borders
  "#fafafa", "#a1a1aa", "#71717a", "#e4e4e7",                      // text
  "#f4f4f5", "#52525b",                                            // icons
  "#ef4444", "#450a0a", "#dc2626", "#f87171", "#991b1b",           // destructive
  "#4ade80", "#052e16",                                            // success
  "#eab308", "#422006",                                            // warning
  "#3b82f6", "#172554",                                            // info
  "#22d3ee",                                                       // wayfinding (cyan 400)
  "#bfff00", "#ceff00"                                             // accent / accent-80
]);
const NEON = new Set(["#bfff00", "#ceff00"]); // the accent pair: only in the --neon token definition
const REQUIRED_COMMENT = ["FONTS", "TOKENS USED", "RESPONSIVE"];

// The comments host ships as a placeholder. A prototype published while it is still in place
// looks fine and silently has no review layer — nobody finds out until the modal never appears,
// and by then the version is published and immutable. So it fails the check instead.
const PLACEHOLDER_HOST = "change-me";
// The one file exempt from it: the example screen that ships with this template, which exists
// so the build runs out of the box. Delete the example and this line together.
const PLACEHOLDER_EXEMPT = new Set(["example-screen/v1.html"]);
const EMOJI = /[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}\u{1F1E6}-\u{1F1FF}]/u;

function listPrototypes(dir) {
  let out = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (path.relative(PUBLIC, full) === "archive") continue;
      out = out.concat(listPrototypes(full));
    } else if (entry.name.endsWith(".html") && entry.name !== "latest.html" && full !== path.join(PUBLIC, "index.html")) {
      out.push(full);
    }
  }
  return out;
}

// Label a file by its path inside public/, or by its path from the current folder when it lives elsewhere.
function label(file) {
  const fromPublic = path.relative(PUBLIC, file);
  return fromPublic.startsWith("..") ? path.relative(process.cwd(), file) : fromPublic;
}

function checkFile(file) {
  const rel = label(file);
  const src = fs.readFileSync(file, "utf8");
  const problems = [];

  // 1. Top comment block
  const firstComment = (src.match(/<!--([\s\S]*?)-->/) || [, ""])[1];
  for (const key of REQUIRED_COMMENT) {
    if (!firstComment.includes(key)) problems.push(`top comment is missing "${key}"`);
  }

  // 2. CSS: colours, radius, neon placement
  const styles = [...src.matchAll(/<style[^>]*>([\s\S]*?)<\/style>/g)].map(m => m[1]).join("\n");
  styles.split("\n").forEach((line, i) => {
    const n = i + 1;
    if (!line.includes("check:allow-color")) {
      for (const hex of line.match(/#[0-9a-fA-F]{6}\b|#[0-9a-fA-F]{3}\b/g) || []) {
        const h = hex.toLowerCase();
        if (!ALLOWED.has(h)) problems.push(`style line ${n}: colour ${hex} is not a token`);
        if (NEON.has(h) && !/--neon/.test(line)) problems.push(`style line ${n}: neon hex used outside the --neon token definition`);
      }
    }
    if (!line.includes("check:allow-radius")) {
      for (const m of line.matchAll(/border-radius\s*:\s*([^;}]+)/g)) {
        if (!/^\s*0(px)?\s*(!important)?\s*$/.test(m[1])) problems.push(`style line ${n}: border-radius ${m[1].trim()} (must be 0)`);
      }
    }
  });
  if (/style="[^"]*border-radius\s*:\s*(?!0)/.test(src)) problems.push("inline style with non-zero border-radius");

  // 3. Emoji
  if (EMOJI.test(src)) problems.push("contains emoji (use inline SVG icons or mono country codes)");

  // 4. Fonts
  if (!/JetBrains Mono/.test(src) || !/Inter/.test(src)) problems.push("fonts must be Inter + JetBrains Mono");
  if (/Geist/.test(src)) problems.push("Geist font is not allowed");

  // 5. JS syntax (inline scripts only)
  [...src.matchAll(/<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/g)].forEach((m, i) => {
    try { new vm.Script(m[1], { filename: `${rel}#script${i + 1}` }); }
    catch (e) { problems.push(`script ${i + 1}: ${e.message}`); }
  });

  // 6. The comments host is still the placeholder
  if (!PLACEHOLDER_EXEMPT.has(rel.split(path.sep).join("/")) && src.toLowerCase().includes(PLACEHOLDER_HOST)) {
    problems.push(
      `the comments host is still the placeholder — replace '${PLACEHOLDER_HOST}' in the HOST line ` +
      `of this file's last <script> block with your own worker address ` +
      `(https://<worker-name>.<your-subdomain>.workers.dev). It is permanent in every version ` +
      `published after it; see CLAUDE.md, decision 2.`);
  }

  // 7. External resources (only Google Fonts allowed)
  for (const m of src.matchAll(/(?:src|href)="(https?:\/\/[^"]+)"/g)) {
    if (!/^https:\/\/fonts\.(googleapis|gstatic)\.com/.test(m[1])) problems.push(`external resource not allowed: ${m[1]}`);
  }

  return { rel, problems };
}

function run(targets) {
  const files = targets && targets.length
    ? targets.map(t => path.resolve(t))
    : listPrototypes(PUBLIC);
  let failed = 0;
  for (const f of files) {
    if (!fs.existsSync(f) || !fs.statSync(f).isFile()) {
      failed++;
      console.log(`\n✗ ${label(f)}`);
      console.log("   - file not found");
      continue;
    }
    const { rel, problems } = checkFile(f);
    if (problems.length) {
      failed++;
      console.log(`\n✗ ${rel}`);
      problems.forEach(p => console.log(`   - ${p}`));
    } else {
      console.log(`✓ ${rel}`);
    }
  }
  console.log(`\n${files.length - failed}/${files.length} prototypes passed.`);
  return failed === 0;
}

module.exports = { run };
if (require.main === module) process.exit(run(process.argv.slice(2)) ? 0 : 1);
