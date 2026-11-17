// Build the hub: run checks, refresh latest.html per screen, generate public/index.html.
// Run: node scripts/build.js   (Vercel runs the same command on every push)
//
// The manifest holds two independent collections: "screens" (+ "archive"), which are the
// prototypes, and "research", which is a flat list of documents in public/research/. They
// never mix: a research entry has no versions and no latest.html, a screen has no kind.
"use strict";
const fs = require("fs");
const path = require("path");
const { run: runChecks } = require("./check");

const ROOT = path.join(__dirname, "..");
const PUBLIC = path.join(ROOT, "public");
const manifest = JSON.parse(fs.readFileSync(path.join(ROOT, "manifest.json"), "utf8"));

const esc = s => String(s == null ? "" : s).replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
const versionPath = (s, v) => v.href || `${s.id}/${v.file}`;
const fail = msg => { console.error(`\n✗ ${msg}`); process.exit(1); };

// 1. Consistency checks
console.log("Checking prototypes…");
if (!runChecks()) fail("Consistency check failed. Fix the files above, then build again.");

// 2. Validate manifest + refresh latest.html
const STATUSES = new Set(manifest.statuses);
for (const s of manifest.screens) {
  if (!STATUSES.has(s.status)) fail(`${s.id}: unknown status "${s.status}"`);
  if (!s.versions || !s.versions.length) fail(`${s.id}: no versions listed`);
  for (const v of s.versions) {
    // A version may point at a file published elsewhere via "href" — e.g. a pre-template
    // version kept in archive/, which is never restyled and never style-checked.
    if (!fs.existsSync(path.join(PUBLIC, versionPath(s, v)))) fail(`${s.id}: file public/${versionPath(s, v)} not found`);
  }
  const latest = s.versions[s.versions.length - 1];
  if (!latest.file) fail(`${s.id}: the latest version needs its own file in public/${s.id}/`);
  fs.copyFileSync(path.join(PUBLIC, s.id, latest.file), path.join(PUBLIC, s.id, "latest.html"));
}
for (const a of manifest.archive) {
  if (!fs.existsSync(path.join(PUBLIC, "archive", a.id, a.file))) fail(`archive ${a.id}: file public/archive/${a.id}/${a.file} not found`);
}

// Research: static documents in public/research/, linked as they are. Not style-checked
// (check.js only reads .html), but the file has to be there, like any published version.
//
// public/research/ belongs to the hub's owner: the build only ever READS it. A missing file is
// reported and fails the build — nothing is ever written there to make the build pass.
// HUB_SKIP_RESEARCH_FILES=1 skips the check for a local look at the table; it is not for
// anything that gets committed.
const SKIP_RESEARCH_FILES = process.env.HUB_SKIP_RESEARCH_FILES === "1";
const KINDS = manifest.kinds || [];
const KINDSET = new Set(KINDS);
const research = manifest.research || [];
const missingResearch = [];
for (const r of research) {
  if (!KINDSET.has(r.kind)) fail(`research ${r.id}: unknown kind "${r.kind}" (allowed: ${KINDS.join(", ")})`);
  // The name is compared raw, exactly as it is on disk; only the link is encoded.
  if (!fs.existsSync(path.join(PUBLIC, "research", r.file))) missingResearch.push(`public/research/${r.file}`);
}
if (missingResearch.length) {
  if (SKIP_RESEARCH_FILES) {
    console.log(`\n! HUB_SKIP_RESEARCH_FILES=1 — these files were not checked:\n   - ${missingResearch.join("\n   - ")}\n  Their links will 404. Do not commit this build.`);
  } else {
    fail(`research files not found:\n   - ${missingResearch.join("\n   - ")}\n  Put them in public/research/ yourself — the build never creates them.`);
  }
}

// 3. Index page
// Approved and Blocked are the two ends of the run and are the states worth seeing from
// across the page. In progress is the neutral chip; Not started, which nothing is yet, is
// plain text.
const STATUS_BADGE = { "Approved": "ok", "Blocked": "stop", "In progress": "" };
const statusCell = s => s in STATUS_BADGE
  ? `<span class="badge${STATUS_BADGE[s] ? " " + STATUS_BADGE[s] : ""}">${esc(s)}</span>`
  : `<span class="state">${esc(s)}</span>`;
// A kind takes its hue from its place in the manifest's kinds list.
const kindClass = kind => "k" + (Math.max(0, KINDS.indexOf(kind)) % 4 + 1);
// A description is clamped to two lines in the table; the whole sentence stays in the title.
const noteCell = note => note ? `<div class="note" title="${esc(note)}">${esc(note)}</div>` : "";

// One grid for all three prototype tables, so Status, the date, the latest version and the
// earlier ones sit at the same x from Current through Archive. Every section shows Status —
// the hub has to read the same as the Notion specs index — and the date is one column in
// one place, whatever a section calls it in its header. Archive keeps no versions of its
// own, so its last two cells are empty; an empty cell holds the line better than a shifted
// column does.
const COLS = `<colgroup><col class="c-screen"><col class="c-status"><col class="c-date"><col class="c-latest"><col class="c-versions"></colgroup>`;
// Research runs on its own grid: kind instead of status, one link instead of a version list.
const RCOLS = `<colgroup><col class="c-screen"><col class="c-kind"><col class="c-date"><col class="c-link"></colgroup>`;

// A screen is finished once its status is Approved; everything else is still in work.
const isFinished = s => s.status === "Approved";
const current = manifest.screens.filter(s => !isFinished(s));
const finished = manifest.screens.filter(isFinished);

// Every filterable row carries what the control row reads: the text to search, the value to
// filter on and the date and name to sort by. The browser never re-reads the manifest.
const rowData = (name, note, filterValue, date) =>
  `data-row data-name="${esc(name.toLowerCase())}" data-text="${esc((name + " " + (note || "")).toLowerCase())}" data-filter="${esc(filterValue)}" data-date="${esc(date || "")}"`;

const currentRows = current.map(s => {
  const latest = s.versions[s.versions.length - 1];
  const older = s.versions.slice(0, -1).reverse()
    .map(v => `<a href="${esc(versionPath(s, v))}">${esc(v.version)}</a>`).join(" ");
  return `<tr ${rowData(s.title, latest.note, s.status, latest.date)}>
    <td><a class="title" data-preview href="${esc(s.id)}/latest.html">${esc(s.title)}</a>${noteCell(latest.note)}</td>
    <td>${statusCell(s.status)}</td>
    <td class="num">${esc(latest.date)}</td>
    <td class="num"><a href="${esc(versionPath(s, latest))}">${esc(latest.version)}</a></td>
    <td class="num">${older || '<span class="muted">—</span>'}</td>
  </tr>`;
}).join("\n");

// Finished rows show the approval date from manifest "approved", falling back to the latest
// version date. The versions split the same way as in Current — newest in its own column,
// the rest beside it — so the two sections line up.
const finishedRows = finished.map(s => {
  const latest = s.versions[s.versions.length - 1];
  const older = s.versions.slice(0, -1).reverse()
    .map(v => `<a href="${esc(versionPath(s, v))}">${esc(v.version)}</a>`).join(" ");
  return `<tr ${rowData(s.title, latest.note, s.status, s.approved || latest.date)}>
    <td><a class="title" data-preview href="${esc(s.id)}/latest.html">${esc(s.title)}</a>${noteCell(latest.note)}</td>
    <td>${statusCell(s.status)}</td>
    <td class="num">${esc(s.approved || latest.date)}</td>
    <td class="num"><a href="${esc(versionPath(s, latest))}">${esc(latest.version)}</a></td>
    <td class="num">${older || '<span class="muted">—</span>'}</td>
  </tr>`;
}).join("\n");

const archiveRows = manifest.archive.map(a => `<tr ${rowData(a.title, a.note, a.status, a.date)}>
    <td><a class="title" data-preview href="archive/${esc(a.id)}/${esc(a.file)}">${esc(a.title)}</a>${noteCell(a.note)}</td>
    <td>${statusCell(a.status)}</td>
    <td class="num">${esc(a.date)}</td>
    <td></td>
    <td></td>
  </tr>`).join("\n");

// The file keeps the name it was given — spaces, em dashes and all — so the link is
// percent-encoded here rather than the file being renamed.
const researchHref = file => `research/${esc(encodeURIComponent(file))}`;

const researchRows = research.map(r => `<tr ${rowData(r.title, r.note, r.kind, r.date)}>
    <td><a class="title" href="${researchHref(r.file)}">${esc(r.title)}</a>${noteCell(r.note)}</td>
    <td><span class="badge ${kindClass(r.kind)}">${esc(r.kind)}</span></td>
    <td class="num">${r.date ? esc(r.date) : '<span class="muted">—</span>'}</td>
    <td class="num"><a href="${researchHref(r.file)}">PDF</a></td>
  </tr>`).join("\n");

const option = v => `<option value="${esc(v)}">${esc(v)}</option>`;
const SORTS = `<option value="date-desc">Date — newest</option><option value="date-asc">Date — oldest</option><option value="name-asc">Name — A to Z</option><option value="name-desc">Name — Z to A</option>`;

// Masthead: who made the page. Both come from manifest.json so nothing about the studio
// is hard-coded in the generator.
const brand = manifest.brand || manifest.title;
const owner = manifest.owner || { name: "", role: "" };
const built = new Date().toISOString().slice(0, 10);
const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<meta name="robots" content="noindex, nofollow">
<title>${esc(manifest.title)}</title>
<!-- Generated by scripts/build.js from manifest.json. Do not edit by hand. -->
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Instrument+Sans:wght@400;500;600&family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet">
<style>
/* ─────────────────────────────────────────────────────────────────────────
   This page is the studio's, not the client's. The prototypes it links to keep their
   own design system; nothing here reaches inside them.
   One ink, one paper, at opacities — the studio ramp flipped to paper-on-ink.
   Every neutral is derived from --el-fg-rgb. Never hard-code a grey.
   ───────────────────────────────────────────────────────────────────────── */
:root{color-scheme:dark;
  --el-ink-hex:#1D1E22;                        /* the page */
  --el-paper-hex:#F9F7F3;
  --el-fg-rgb:249 247 243;
  --el-fg:rgb(var(--el-fg-rgb));
  --el-fg-05:rgb(var(--el-fg-rgb) / .05);      /* card fill */
  --el-fg-10:rgb(var(--el-fg-rgb) / .10);      /* borders, tiles */
  --el-fg-25:rgb(var(--el-fg-rgb) / .25);
  --el-fg-40:rgb(var(--el-fg-rgb) / .40);      /* marks only, never text */
  --el-fg-60:rgb(var(--el-fg-rgb) / .60);      /* marks only, never text */
  --el-fg-80:rgb(var(--el-fg-rgb) / .80);
  --el-body:rgb(var(--el-fg-rgb) / .72);       /* all body text */
  --el-muted:rgb(var(--el-fg-rgb) / .64);      /* labels, meta */
  --el-line:rgb(var(--el-fg-rgb) / .10);
  --el-line-card:rgb(var(--el-fg-rgb) / .22);
  --el-fill:rgb(var(--el-fg-rgb) / .05);       /* header row, controls */
  --el-fill-body:rgb(var(--el-fg-rgb) / .02);  /* a table body sits close to the page */
  --el-fill-hover:rgb(var(--el-fg-rgb) / .04);
  --el-chip-fill:rgb(var(--el-fg-rgb) / .10);
  --el-chip-ink:rgb(var(--el-fg-rgb) / .85);
  /* Accent: one in view at a time. It marks the open collection, nothing else. */
  --el-accent:#F59958;
  /* Status: Approved is a tint, like a kind chip — a resting state does not need to shout.
     Blocked stays solid, because it is the one thing that should. In progress is the
     neutral chip, Not started plain text. The green is pushed off the kinds' teal so the
     two never read as the same chip. */
  --ok-rgb:158 215 160;
  --el-blocked:#E05A47;
  /* Kinds. Each is a tint of its own hue with type in the same hue — quieter than a status,
     which is solid, so a kind reads as a label and never as a state. Four hues, assigned by
     the order of the kinds list; a fifth kind would start the ramp again. */
  --k1-rgb:174 203 234;   /* blue */
  --k2-rgb:150 212 205;   /* teal */
  --k3-rgb:196 181 232;   /* violet */
  --k4-rgb:227 174 198;   /* rose */
  /* Type: Instrument Sans for the display face, Inter for everything else. */
  --display:"Instrument Sans",system-ui,sans-serif;
  --sans:"Inter",system-ui,sans-serif;
  /* Radius: 10px on cards, tables and inputs, 6px on chips and pills.
     Tabs are square — they carry a rule, not a surface. */
  --r-box:10px;--r-pill:6px;
  box-sizing:border-box;
  padding-top:env(safe-area-inset-top,0px);padding-bottom:env(safe-area-inset-bottom,0px);}

*,*::before,*::after{box-sizing:inherit;}
body{margin:0;background:var(--el-ink-hex);color:var(--el-body);font:400 16px/24px var(--sans);}
main{max-width:1120px;margin:0 auto;padding:40px 24px 64px;}
/* Masthead: wordmark left, who made the page right, sitting on the same baseline.
   The wordmark is inline-block, so its bottom edge IS its baseline. */
.masthead{display:flex;justify-content:space-between;align-items:baseline;gap:24px;
  flex-wrap:wrap;margin:0 0 32px;}
.wordmark{display:inline-block;font:600 20px/26px var(--display);letter-spacing:-.01em;color:var(--el-fg);}
/* A text wordmark by default. Swap this element in the masthead below for your own
   inline <svg class="wordmark"> if you have one — the baseline alignment holds either way. */
.sig{text-align:right;font-size:13px;line-height:20px;}
.sig-name{color:var(--el-body);}
.sig-role{color:var(--el-muted);}
@media (max-width:640px){
  .masthead{gap:16px;}
  .sig{text-align:left;width:100%;}
}
h1{font:500 32px/40px var(--display);letter-spacing:-.01em;color:var(--el-fg);margin:0;}
.lede{color:var(--el-body);margin:12px 0 0;max-width:640px;}
.lede a{color:var(--el-fg);text-decoration:underline;text-underline-offset:3px;}
.lede a:hover{color:var(--el-body);}
/* No monospace anywhere on this page: uppercase-mono is the prototypes' own signature and
   the hub must not share it. Section labels and column heads keep the uppercase tracking,
   in Inter. */
h2{font:600 13px/20px var(--sans);letter-spacing:.06em;text-transform:uppercase;color:var(--el-muted);margin:48px 0 12px;}
/* The body sits a step above the page; only the header row takes the 5% fill, so it
   separates without a filled bar of its own colour. */
.wrap{overflow-x:auto;border:1px solid var(--el-line-card);background:var(--el-fill-body);border-radius:var(--r-box);}
thead tr{background:var(--el-fill);}
table{width:100%;border-collapse:collapse;min-width:720px;table-layout:fixed;}
col.c-screen{width:auto;}
col.c-status{width:132px;}
col.c-date{width:136px;}
col.c-latest{width:72px;}
/* Wide enough for the longest run of earlier versions on one line — policy-config's six.
   Status and Latest are held to what their content actually needs, so the width comes
   off the slack in those two rather than out of the screen titles. */
col.c-versions{width:232px;}
col.c-kind{width:180px;}
col.c-link{width:120px;}
th{text-align:left;font:600 12px/16px var(--sans);letter-spacing:.06em;text-transform:uppercase;
  color:var(--el-muted);padding:16px 24px;border-bottom:1px solid var(--el-line);}
td{padding:16px 24px;border-top:1px solid var(--el-line);vertical-align:top;}
tr:first-child td{border-top:0;}
/* After filtering or sorting the first row left in a table takes that rule's place. */
tr.first-visible td{border-top:0;}
a{color:var(--el-fg);text-underline-offset:3px;}
a:hover{color:var(--el-body);}
a.title{font-weight:500;text-decoration:none;}
a.title:hover{text-decoration:underline;}
/* A row description is a description, not a change log: two lines, the rest on hover. */
.note{color:var(--el-body);font-size:13px;line-height:20px;margin-top:4px;max-width:640px;
  display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden;}
/* Dates and version links: Inter, with figures on a fixed width so columns still line up. */
.num{font-size:13px;line-height:20px;font-variant-numeric:tabular-nums;}
.num a{margin-right:12px;}
.num .muted{white-space:nowrap;}   /* a date never breaks across two lines */
.muted{color:var(--el-muted);}
/* A pill belongs to what needs attention. A resting state — Approved, Not started — is
   plain text, so eight finished rows do not shout; In progress is the neutral chip and
   Blocked is the one coloured thing in a table. The chip box is 20px tall — the title's
   line — and top-aligned, so it sits on the title's line, not between title and note. */
.badge{display:inline-block;vertical-align:top;font:500 12px/16px var(--sans);padding:2px 8px;
  border-radius:var(--r-pill);white-space:nowrap;background:var(--el-chip-fill);color:var(--el-chip-ink);}
.badge.ok{background:rgb(var(--ok-rgb) / .14);color:rgb(var(--ok-rgb));}
.badge.stop{background:var(--el-blocked);color:var(--el-paper-hex);}
.state{color:var(--el-muted);font-size:13px;line-height:20px;}
/* Kind chips: a tint of the hue behind type in the same hue. */
.badge.k1{background:rgb(var(--k1-rgb) / .14);color:rgb(var(--k1-rgb));}
.badge.k2{background:rgb(var(--k2-rgb) / .14);color:rgb(var(--k2-rgb));}
.badge.k3{background:rgb(var(--k3-rgb) / .14);color:rgb(var(--k3-rgb));}
.badge.k4{background:rgb(var(--k4-rgb) / .14);color:rgb(var(--k4-rgb));}
.empty{padding:24px;color:var(--el-muted);font-size:13px;line-height:20px;}
footer{margin-top:48px;color:var(--el-muted);font-size:13px;}
/* The focus ring is the one place the accent is allowed to appear a second time:
   it is never in view at the same time as anything else wearing it. */
:focus-visible{outline:2px solid var(--el-accent);outline-offset:3px;}
/* The preview opens from anywhere in a prototype row, so the whole row answers the pointer.
   Only the title and the version links are clickable; the row itself is not. */
tbody tr[data-row]:hover{background:var(--el-fill-hover);}

/* Top-level switch between the two collections. Quiet tabs: a switch does not carry the
   page's argument, so the accent is a 2px rule under the open label, never a fill. The
   tabs sit on one shared hairline and the active rule covers it. */
.switch{display:flex;gap:28px;margin:32px 0 0;max-width:100%;
  border-bottom:1px solid var(--el-line);}
.switch button{appearance:none;background:none;border:0;border-bottom:2px solid transparent;
  margin-bottom:-1px;border-radius:0;color:var(--el-body);font:400 15px/20px var(--sans);
  padding:0 0 12px;cursor:pointer;white-space:nowrap;}
.switch button:hover{color:var(--el-fg);}
.switch button[aria-selected="true"]{color:var(--el-fg);font-weight:500;border-bottom-color:var(--el-accent);}
.panel[hidden]{display:none;}
.sect[hidden]{display:none;}

/* One control row per collection, above its tables. Fields sit on the table surface so
   the row reads as the head of the tables under it; no new colour, no new border weight. */
.controls{display:flex;flex-wrap:wrap;gap:12px;align-items:center;margin:32px 0 0;}
.controls input,.controls .dd-btn{appearance:none;background:var(--el-fill);border:1px solid var(--el-line-card);
  border-radius:var(--r-box);color:var(--el-fg);font:400 14px/20px var(--sans);
  padding:12px 16px;min-width:0;height:44px;}
.controls input{flex:1 1 280px;}
.controls input::placeholder{color:var(--el-muted);}
.controls input:hover{border-color:var(--el-fg-25);}

/* The filter and sort menus. A native select draws its popup with the OS chrome, which on
   this page came out light-on-light and barely readable, so the control is a button and a
   listbox of our own. The original <select> stays in the DOM as the value and still fires
   change, so the filtering code never learns the difference. */
.dd{position:relative;flex:0 0 auto;}
.dd-btn{display:inline-flex;align-items:center;justify-content:space-between;gap:8px;
  cursor:pointer;color:var(--el-body);white-space:nowrap;}
.dd-btn:hover{border-color:var(--el-fg-25);color:var(--el-fg);}
.dd-btn[aria-expanded="true"]{color:var(--el-fg);border-color:var(--el-fg-25);}
.dd-caret{width:16px;height:16px;flex:0 0 auto;color:var(--el-muted);}
/* Opaque: the page must not read through an open menu. The ink is the base, the 5% fill
   is composited over it, so the panel still comes from the ramp. */
.dd-list{position:absolute;z-index:30;top:calc(100% + 4px);left:0;min-width:100%;margin:0;padding:4px;
  list-style:none;background-color:var(--el-ink-hex);background-image:linear-gradient(var(--el-fill),var(--el-fill));
  border:1px solid var(--el-line-card);border-radius:var(--r-box);max-height:280px;overflow:auto;}
.dd-list[hidden]{display:none;}
.dd-opt{padding:8px 12px;border-radius:var(--r-pill);color:var(--el-body);cursor:pointer;
  font:400 14px/20px var(--sans);white-space:nowrap;}
.dd-opt:hover{background:var(--el-fill-hover);color:var(--el-fg);}
.dd-opt:focus{background:var(--el-fill-hover);color:var(--el-fg);outline:none;box-shadow:inset 0 0 0 1px var(--el-accent);}
.dd-opt[aria-selected="true"]{background:var(--el-chip-fill);color:var(--el-fg);}
.dd-src{position:absolute;width:1px;height:1px;padding:0;margin:0;border:0;opacity:0;pointer-events:none;}
@media (max-width:640px){.dd{flex:1 1 calc(50% - 6px);}.dd-btn{width:100%;}}
/* Below 640 the row stacks: the field takes the width, the two menus split it. */
@media (max-width:640px){
  .controls input{flex:1 1 100%;}
}
/* No matches anywhere in a collection: one line inside a table of its own, at the type
   scale of a row description. */
.empty-table td{color:var(--el-muted);font-size:13px;line-height:20px;}

/* Hover preview: one card at a time, pointer-transparent, the real file at 0.3 scale.
   Never shown under 1024px or without a hovering pointer — see the script.
   It fades in over its last few pixels of travel; --pv-y flips that travel when the card
   sits above the link instead of below it. Opening is slower and eased out, closing is
   quicker and plain; the frame inside fades in on its own once the file has loaded, so the
   card is never shown around an empty frame: it is mounted only once the file has
   loaded, so there is no blank square before the preview. */
#preview{position:fixed;top:0;left:0;z-index:20;width:384px;height:240px;border:1px solid var(--el-line-card);
  border-radius:var(--r-box);background:var(--el-fill);overflow:hidden;pointer-events:none;display:none;
  opacity:0;transform:translateY(var(--pv-y,8px));transition:opacity .16s ease,transform .16s ease;}
#preview.is-open{opacity:1;transform:translateY(0);
  transition:opacity .22s cubic-bezier(.16,1,.3,1),transform .22s cubic-bezier(.16,1,.3,1);}
/* The frame holds a prototype; that page keeps its own look. Only the frame is ours. */
#preview iframe{width:1280px;height:800px;border:0;transform:scale(.3);transform-origin:0 0;
  pointer-events:none;background:#141414;opacity:0;transition:opacity .22s ease;}
#preview iframe.is-loaded{opacity:1;}
@media (prefers-reduced-motion:reduce){
  #preview,#preview.is-open,#preview iframe{transition:none;}
  #preview,#preview.is-open{transform:none;}
  #preview iframe{opacity:1;}
}
@media (max-width:1023px){#preview{display:none !important;}}
</style>
</head>
<body>
<main>
  <div class="masthead">
    <div class="wordmark">${esc(brand)}</div>
    <div class="sig"><div class="sig-name">${esc(owner.name)}</div><div class="sig-role">${esc(owner.role)}</div></div>
  </div>
  <h1>${esc(manifest.title)}</h1>
  <p class="lede">Interactive references for Figma. Each screen opens its latest version; older versions stay at their own links. All data is placeholder.</p>
  ${manifest.figma ? `<p class="lede"><a href="${esc(manifest.figma)}" target="_blank" rel="noopener">Figma — working file</a> <span class="muted">(opens at the shared frame)</span></p>` : ""}

  <div class="switch" role="tablist" aria-label="Collection">
    <button type="button" role="tab" id="tab-prototypes" aria-controls="panel-prototypes" aria-selected="true">Prototypes</button>
    <button type="button" role="tab" id="tab-research" aria-controls="panel-research" aria-selected="false">Research</button>
  </div>

  <section class="panel" id="panel-prototypes" role="tabpanel" aria-labelledby="tab-prototypes">
    <div class="controls" data-controls="prototypes">
      <input type="search" id="q-prototypes" placeholder="Search screens" aria-label="Search screens by title and description">
      <select id="f-prototypes" aria-label="Filter by status"><option value="">All statuses</option>${manifest.statuses.map(option).join("")}</select>
      <select id="s-prototypes" aria-label="Sort screens">${SORTS}</select>
    </div>

    <section class="sect" data-sect>
      <h2>Current</h2>
      <div class="wrap"><table>${COLS}
        <thead><tr><th>Screen</th><th>Status</th><th>Date</th><th>Latest</th><th>Earlier</th></tr></thead>
        <tbody>${currentRows || ""}</tbody>
      </table>${current.length ? "" : '<div class="empty">Nothing in work right now.</div>'}</div>
    </section>

    <section class="sect" data-sect>
      <h2>Finished</h2>
      <p class="lede">Approved with the client. Each screen stays at its links; a later change starts a new version back in Current.</p>
      <div class="wrap" style="margin-top:12px"><table>${COLS}
        <thead><tr><th>Screen</th><th>Status</th><th>Approved</th><th>Latest</th><th>Earlier</th></tr></thead>
        <tbody>${finishedRows || ""}</tbody>
      </table>${finished.length ? "" : '<div class="empty">Nothing finished yet.</div>'}</div>
    </section>

    <section class="sect" data-sect>
      <h2>Archive</h2>
      <p class="lede">Made before the shared template. Styling may differ from the current system; Figma is the source of truth.</p>
      <div class="wrap" style="margin-top:12px"><table>${COLS}
        <thead><tr><th>Screen</th><th>Status</th><th>Date</th><th></th><th></th></tr></thead>
        <tbody>${archiveRows}</tbody>
      </table>${manifest.archive.length ? "" : '<div class="empty">Nothing archived yet.</div>'}</div>
    </section>

    <div class="wrap" data-noresults hidden style="margin-top:32px"><table class="empty-table" style="min-width:0">
      <tbody><tr><td>No screen matches this search.</td></tr></tbody>
    </table></div>
  </section>

  <section class="panel" id="panel-research" role="tabpanel" aria-labelledby="tab-research" hidden>
    <div class="controls" data-controls="research">
      <input type="search" id="q-research" placeholder="Search documents" aria-label="Search documents by title and description">
      <select id="f-research" aria-label="Filter by kind"><option value="">All kinds</option>${KINDS.map(option).join("")}</select>
      <select id="s-research" aria-label="Sort documents">${SORTS}</select>
    </div>

    <section class="sect" data-sect>
      <h2>Research</h2>
      <p class="lede">Documents behind the prototypes. Each link opens the file itself.</p>
      <div class="wrap" style="margin-top:12px"><table>${RCOLS}
        <thead><tr><th>Document</th><th>Kind</th><th>Date</th><th>File</th></tr></thead>
        <tbody>${researchRows}</tbody>
      </table>${research.length ? "" : '<div class="empty">Nothing here yet.</div>'}</div>
    </section>

    <div class="wrap" data-noresults hidden style="margin-top:32px"><table class="empty-table" style="min-width:0">
      <tbody><tr><td>No document matches this search.</td></tr></tbody>
    </table></div>
  </section>

  <footer>Updated ${built}</footer>
</main>
<div id="preview" aria-hidden="true"></div>
<script>
// Index behaviour, plain DOM, no library:
//   1. the collection switch,
//   2. one search / filter / sort row per collection, read off data- attributes on the rows,
//   3. a hover preview of a prototype's latest version, mounted on first hover only.
(function () {
  'use strict';

  // The preview card is held here because the switch and the filters both close it.
  var box = document.getElementById('preview');
  var openTimer = null, closeTimer = null, keepTimer = null, waitTimer = null;
  var anchor = null, mountedFor = null;
  var pointer = null;   // where the cursor was last seen over a row; null for keyboard focus
  var SCALE = 0.3, W = 1280, H = 800;
  var OUT = 160;    // fade out, matching the CSS
  var KEEP = 400;   // how long a loaded frame is kept for a return to the same row

  function unmount() {
    if (keepTimer) { clearTimeout(keepTimer); keepTimer = null; }
    if (waitTimer) { clearTimeout(waitTimer); waitTimer = null; }
    mountedFor = null;
    box.style.display = 'none';
    box.innerHTML = '';   // only one preview is ever mounted
  }
  function hidePreview() {
    if (openTimer) { clearTimeout(openTimer); openTimer = null; }
    if (waitTimer) { clearTimeout(waitTimer); waitTimer = null; }
    anchor = null;
    if (box.style.display === 'block') {
      box.classList.remove('is-open');
      if (closeTimer) { clearTimeout(closeTimer); }
      closeTimer = setTimeout(function () { closeTimer = null; box.style.display = 'none'; }, OUT + 20);
    }
    // The card goes, the frame stays for a moment: coming straight back to the same row
    // reuses it instead of loading the file again.
    if (mountedFor) {
      if (keepTimer) { clearTimeout(keepTimer); }
      keepTimer = setTimeout(function () { keepTimer = null; unmount(); }, KEEP);
    }
  }

  // 1. Collection switch. The open panel is also the URL hash, so a link can point at Research.
  var tabs = [].slice.call(document.querySelectorAll('.switch [role="tab"]'));
  function openPanel(name) {
    tabs.forEach(function (t) {
      var on = t.id === 'tab-' + name;
      t.setAttribute('aria-selected', on ? 'true' : 'false');
      document.getElementById(t.getAttribute('aria-controls')).hidden = !on;
    });
    hidePreview();
  }
  tabs.forEach(function (t) {
    t.addEventListener('click', function () {
      var name = t.id.slice(4);
      openPanel(name);
      history.replaceState(null, '', name === 'research' ? '#research' : location.pathname);
    });
  });

  // 2. Search, filter, sort. One control row drives every section of its own collection:
  // a row matching in any section stays, a section left with no rows is hidden with its
  // heading, and when nothing matches at all the collection shows one line instead.
  function wire(panelId, key) {
    var panel = document.getElementById(panelId);
    var q = document.getElementById('q-' + key);
    var f = document.getElementById('f-' + key);
    var s = document.getElementById('s-' + key);
    var sections = [].slice.call(panel.querySelectorAll('.sect'));
    var none = panel.querySelector('[data-noresults]');

    function compare(mode) {
      return function (a, b) {
        var an = a.getAttribute('data-name'), bn = b.getAttribute('data-name');
        var ad = a.getAttribute('data-date'), bd = b.getAttribute('data-date');
        if (mode === 'name-asc') return an < bn ? -1 : an > bn ? 1 : 0;
        if (mode === 'name-desc') return an < bn ? 1 : an > bn ? -1 : 0;
        // An entry with no date sorts last whichever way the dates run.
        if (!ad && !bd) return an < bn ? -1 : 1;
        if (!ad) return 1;
        if (!bd) return -1;
        if (mode === 'date-asc') return ad < bd ? -1 : ad > bd ? 1 : 0;
        return ad < bd ? 1 : ad > bd ? -1 : 0;
      };
    }

    function apply() {
      var text = q.value.trim().toLowerCase();
      var want = f.value;
      var cmp = compare(s.value);
      var shown = 0;

      sections.forEach(function (sect) {
        var body = sect.querySelector('tbody');
        if (!body) { return; }
        var rows = [].slice.call(body.querySelectorAll('tr[data-row]'));
        var left = 0;
        rows.forEach(function (row) {
          var ok = (!text || row.getAttribute('data-text').indexOf(text) !== -1) &&
                   (!want || row.getAttribute('data-filter') === want);
          row.hidden = !ok;
          if (ok) { left++; }
        });
        var ordered = rows.slice().sort(cmp);
        ordered.forEach(function (row) { body.appendChild(row); });
        // Whichever row ends up first in the table carries no top border.
        var seen = false;
        ordered.forEach(function (row) {
          var isFirst = !row.hidden && !seen;
          if (isFirst) { seen = true; }
          row.classList.toggle('first-visible', isFirst);
        });
        // A section with nothing of its own stays as it was, with its own empty line.
        sect.hidden = rows.length > 0 && left === 0;
        shown += left;
      });

      none.hidden = shown > 0;
      hidePreview();
    }

    q.addEventListener('input', apply);
    f.addEventListener('change', apply);
    s.addEventListener('change', apply);
    apply();
  }
  wire('panel-prototypes', 'prototypes');
  wire('panel-research', 'research');

  // 2b. Each select is dressed as a button and a listbox of the page's own tokens. The
  // select itself stays as the value and still fires change, so wire() is untouched.
  function dropdown(select) {
    var wrap = document.createElement('div');
    wrap.className = 'dd';
    var label = select.getAttribute('aria-label') || '';

    var btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'dd-btn';
    btn.setAttribute('aria-haspopup', 'listbox');
    btn.setAttribute('aria-expanded', 'false');
    if (label) { btn.setAttribute('aria-label', label); }
    var text = document.createElement('span');
    btn.appendChild(text);
    btn.insertAdjacentHTML('beforeend',
      '<svg class="dd-caret" viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="m6 9 6 6 6-6"/></svg>');

    var list = document.createElement('ul');
    list.className = 'dd-list';
    list.setAttribute('role', 'listbox');
    if (label) { list.setAttribute('aria-label', label); }
    list.hidden = true;

    var opts = [].slice.call(select.options).map(function (o, i) {
      var li = document.createElement('li');
      li.className = 'dd-opt';
      li.setAttribute('role', 'option');
      li.tabIndex = -1;
      li.textContent = o.textContent;
      li.addEventListener('click', function () { choose(i); });
      list.appendChild(li);
      return li;
    });

    select.parentNode.insertBefore(wrap, select);
    wrap.appendChild(btn);
    wrap.appendChild(list);
    wrap.appendChild(select);
    select.classList.add('dd-src');
    select.tabIndex = -1;
    select.setAttribute('aria-hidden', 'true');

    function sync() {
      text.textContent = select.options[select.selectedIndex].textContent;
      opts.forEach(function (li, i) {
        li.setAttribute('aria-selected', i === select.selectedIndex ? 'true' : 'false');
      });
    }
    function open() {
      list.hidden = false;
      btn.setAttribute('aria-expanded', 'true');
      opts[select.selectedIndex].focus();
    }
    function close(toButton) {
      list.hidden = true;
      btn.setAttribute('aria-expanded', 'false');
      if (toButton) { btn.focus(); }
    }
    function choose(i) {
      select.selectedIndex = i;
      sync();
      select.dispatchEvent(new Event('change'));
      close(true);
    }
    function move(from, step) {
      opts[(from + step + opts.length) % opts.length].focus();
    }

    btn.addEventListener('click', function () { if (list.hidden) { open(); } else { close(true); } });
    btn.addEventListener('keydown', function (e) {
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp' || e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        open();
      }
    });
    list.addEventListener('keydown', function (e) {
      var i = opts.indexOf(document.activeElement);
      if (e.key === 'ArrowDown') { e.preventDefault(); move(i, 1); }
      else if (e.key === 'ArrowUp') { e.preventDefault(); move(i, -1); }
      else if (e.key === 'Home') { e.preventDefault(); opts[0].focus(); }
      else if (e.key === 'End') { e.preventDefault(); opts[opts.length - 1].focus(); }
      else if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); if (i >= 0) { choose(i); } }
      else if (e.key === 'Escape') { e.preventDefault(); close(true); }
      else if (e.key === 'Tab') { close(false); }
    });
    document.addEventListener('mousedown', function (e) { if (!wrap.contains(e.target)) { close(false); } });

    sync();
  }
  [].slice.call(document.querySelectorAll('.controls select')).forEach(dropdown);

  // 3. Hover preview of the file a prototype row points at. Desktop pointers only:
  // no touch, nothing under 1024px, and the iframe is created on the first hover.
  function canPreview() {
    return window.matchMedia('(min-width:1024px)').matches &&
           window.matchMedia('(hover:hover) and (pointer:fine)').matches;
  }
  // Put the card by the pointer — down and to the right of it, so it opens where the eye
  // already is instead of at the far end of a wide row. It flips to the other side of the
  // pointer when it would run past an edge. Placed once, on open; it does not follow.
  // With no pointer (a keyboard focus) the link itself is the anchor.
  function place(link, pt) {
    var w = W * SCALE, h = H * SCALE, off = 16, edge = 16;
    var left, top, flipped = false;

    if (pt) {
      left = pt.x + off;
      if (left + w > window.innerWidth - edge) { left = pt.x - w - off; }
      top = pt.y + off;
      if (top + h > window.innerHeight - edge) { top = pt.y - h - off; flipped = true; }
    } else {
      var r = link.getBoundingClientRect();
      left = r.right + 12;
      if (left + w > window.innerWidth - edge) { left = r.left - w - 12; }
      top = r.top - 8;
      if (top + h > window.innerHeight - edge) { top = r.bottom - h + 8; flipped = true; }
    }

    if (left + w > window.innerWidth - edge) { left = window.innerWidth - w - edge; }
    if (left < edge) { left = edge; }
    if (top + h > window.innerHeight - edge) { top = window.innerHeight - h - edge; }
    if (top < edge) { top = edge; }

    box.style.setProperty('--pv-y', flipped ? '-8px' : '8px');
    box.style.left = Math.round(left) + 'px';
    box.style.top = Math.round(top) + 'px';
  }
  // The preview is a live page. It is not frozen — killing animations would leave
  // everything that fades or slides in through keyframes stuck at its start value, and the
  // card would show half a page. The page is let through to its settled state instead:
  // transitions off, then every animation jumped to its end. Same origin, so this works;
  // a cross-origin file simply keeps its own behaviour.
  function settle(frame) {
    try {
      var doc = frame.contentDocument;
      if (!doc) { return; }
      var style = doc.createElement('style');
      style.textContent = '*,*::before,*::after{transition:none !important;' +
        'scroll-behavior:auto !important;}';
      (doc.head || doc.documentElement).appendChild(style);

      var finishAll = function () {
        try {
          // Document.getAnimations() already covers the whole document; the element form
          // is the fallback and is the one that needs subtree.
          var list = doc.getAnimations ? doc.getAnimations({ subtree: true })
            : (doc.documentElement.getAnimations ? doc.documentElement.getAnimations({ subtree: true }) : []);
          list.forEach(function (a) {
            try { a.finish(); } catch (e) { /* an endless animation cannot be finished */ }
          });
        } catch (e) { /* nothing to settle */ }
      };
      finishAll();
      // Once more on the next frame, for anything that only starts after load.
      var win = frame.contentWindow || window;
      if (win.requestAnimationFrame) { win.requestAnimationFrame(finishAll); }
      else { setTimeout(finishAll, 16); }

      if (frame.contentWindow) { frame.contentWindow.scrollTo(0, 0); }
      if (doc.documentElement) { doc.documentElement.scrollTop = 0; }
      if (doc.body) { doc.body.scrollTop = 0; }
    } catch (e) { /* cross-origin: leave the card as it is */ }
  }
  function reveal(link) {
    if (waitTimer) { clearTimeout(waitTimer); waitTimer = null; }
    place(link, pointer);
    box.style.display = 'block';
    void box.offsetWidth;                    // so the fade has a state to start from
    box.classList.add('is-open');
  }
  function showPreview(link) {
    if (closeTimer) { clearTimeout(closeTimer); closeTimer = null; }
    if (keepTimer) { clearTimeout(keepTimer); keepTimer = null; }
    anchor = link;

    // Back on the row whose frame is still mounted: show it again, no reload, no flash.
    if (mountedFor === link && box.querySelector('iframe')) { reveal(link); return; }

    box.classList.remove('is-open');
    box.innerHTML = '';
    var frame = document.createElement('iframe');
    frame.setAttribute('tabindex', '-1');
    frame.setAttribute('scrolling', 'no');
    frame.setAttribute('aria-hidden', 'true');
    frame.addEventListener('load', function () {
      settle(frame);
      frame.classList.add('is-loaded');
      // The card opens with the page already in it: an empty panel first would read as a
      // blank square flashing under the cursor.
      if (anchor === link) { reveal(link); }
    });
    frame.src = link.getAttribute('href');   // set on hover, never on load
    box.appendChild(frame);
    mountedFor = link;
    // If the load event never comes, open the card anyway rather than never showing it.
    waitTimer = setTimeout(function () {
      waitTimer = null;
      if (anchor === link) { frame.classList.add('is-loaded'); reveal(link); }
    }, 1500);
  }
  function arm(link) {
    if (!canPreview() || anchor === link) { return; }
    // hidePreview restarts the holding window from this moment, so a frame kept for this
    // row survives the opening delay and the return costs no reload.
    hidePreview();
    openTimer = setTimeout(function () { openTimer = null; showPreview(link); }, 120);
  }

  // The title arms the preview, not the row: a row is wide and mostly empty, and crossing
  // one on the way down the page would mount a file nobody asked to see. The row still
  // lights up on hover — that is CSS, and it costs nothing.
  [].slice.call(document.querySelectorAll('a.title[data-preview]')).forEach(function (link) {
    link.addEventListener('mouseenter', function (e) {
      pointer = { x: e.clientX, y: e.clientY };
      arm(link);
    });
    // Keep the position current while the cursor crosses the title, so the card opens
    // where the pointer came to rest rather than where it entered.
    link.addEventListener('mousemove', function (e) {
      if (anchor === link || openTimer) { pointer = { x: e.clientX, y: e.clientY }; }
    });
    link.addEventListener('mouseleave', hidePreview);
    link.addEventListener('focus', function () { pointer = null; arm(link); });
    link.addEventListener('blur', hidePreview);
  });
  document.addEventListener('keydown', function (e) { if (e.key === 'Escape') { hidePreview(); } });
  window.addEventListener('scroll', hidePreview, true);
  window.addEventListener('resize', hidePreview);

  if (location.hash === '#research') { openPanel('research'); }
})();
</script>
</body>
</html>
`;
fs.writeFileSync(path.join(PUBLIC, "index.html"), html);
console.log(`\n✓ Built public/index.html (${current.length} current, ${finished.length} finished, ${manifest.archive.length} archived, ${research.length} research).`);
