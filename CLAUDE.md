# prototype-hub-template — rules for whoever clones this

This is the **published shelf** of prototypes: only finished versions, shared with a client.
It is deployed to Vercel on every push to `main`, behind Basic Auth. Drafts and working files
live somewhere else — never copy anything here except the final HTML of a prototype version.

This file is the hub's own rules. It is written as instructions for Claude Code, but it is
ordinary documentation and the rules hold whoever is doing the work. **The owner** below means
the person whose hub it is — the designer who decides what gets published and who sees it.

Read this file before publishing anything. Four of the decisions below cannot be undone once
the first version is live.

---

## The comments host is not in this repo

The review layer on every prototype — pins on an element, threads, replies, statuses, resolve —
is **share-proto**, a separate tool with its own release cycle, its own tests and its own upgrade
path. It is deliberately not vendored here: a copy taken today is frozen at today, and the drift
only shows up later as a lost comment or a role leak.

Clone it fresh, next to this repo:

```bash
git clone https://github.com/DShkiaruk/share-proto
```

Then give Claude Code **the repository link** — `https://github.com/DShkiaruk/share-proto` — and
let it work from that repo's own README and `SKILL.md`. That is what the tool asks for, and it is
the only instruction about *how to install it* you need from us.

**What follows below is everything its README does not tell you**: the choices this hub made on
top of the tool, why, and which of them you cannot take back. That is the part worth reading
twice.

---

## The four decisions you cannot take back

### 1. The comments live on a Cloudflare Worker, not on Vercel Blob

share-proto has two editions. The Vercel one keeps comments in a private Vercel Blob store; the
Cloudflare one keeps them in a Durable Object. **Use the Cloudflare Worker edition.**

Why, and it is not a preference:

- Vercel's free plan includes **2,000 write-class Blob operations a month across the whole
  account** — not per project. A comment costs about two, a comment with a picture one more.
  That is roughly four prototype reviews a month for *everything* you host on that account.
- Past the quota the store is **suspended**: comments stop loading and the room cannot even be
  exported until the quota is lifted. A review dies mid-review, with the client watching.
- Cloudflare's free plan gives 100,000 requests and 100,000 written rows **a day**, which a
  design review will not approach.

The hub's own pages stay on Vercel; only the comments live on Cloudflare.

If you ever want to go the other way, `scripts/move-room.mjs` in the share-proto clone moves a
room across with its authors, numbers, statuses, pictures and learned map intact — but the
*address* baked into every published file does not move with it. See decision 2.

### 2. The worker name and the workers.dev subdomain are permanent

The first `wrangler deploy` asks you to pick a `workers.dev` subdomain. **That choice is permanent
for the Cloudflare account** — it cannot be renamed afterwards. Together with the worker's name it
forms the host address:

```
https://<worker-name>.<your-subdomain>.workers.dev
```

That address is written into `templates/_template.html`, so **every version published from the
template carries it forever** — and a published version is never edited (Immutability, below).
Moving the comments elsewhere later would mean republishing every live screen.

So: pick the subdomain and the worker name deliberately, before the first publish. Both should be
neutral and long-lived — not a client name, not a project name that will be renamed, not `test`.
The name goes in `worker/wrangler.jsonc` inside the share-proto clone; wrangler requires lowercase
letters, digits and dashes.

In this repository the address lives in exactly one place: the `HOST` line at the end of
`templates/_template.html`. It ships as `https://change-me-comments.change-me.workers.dev`, and
`scripts/check.js` fails any prototype that still carries `change-me` — so a screen cannot be
published against the placeholder by accident, and nobody finds out from a modal that never
appears.

Do not point the snippet somewhere else without saying out loud what it costs.

### 3. The room is the screen id, taken from the path

One room per screen, so feedback carries from one version to the next and each screen's comments
stay apart from every other screen's. The prototype works the room out from its own URL —
`/example-screen/v1.html` and `/example-screen/latest.html` are both room `example-screen`.
Nothing on the worker needs to know the list of screens.

This is the whole snippet, as it stands at the end of `templates/_template.html`. Keep all of it.

```html
<!-- Comments layer (share-proto, embed mode). The room is the SCREEN id, taken from the
     first path segment — /example-screen/v1.html and /example-screen/latest.html are both
     room "example-screen" — so feedback carries from one version to the next and the tool's
     older-version badge can do its job. Two guards: never inside a frame, because the
     hub's hover preview loads prototypes in an iframe and the overlay would mount in the
     preview card and call the comments host on every hover; and never when the first
     segment is not a valid room name (a file:// draft, the hub index itself).
     The host address is permanent: every version published from here carries it, and a
     published version is never edited. -->
<script>
(function () {
  if (window.top !== window.self) return;
  var id = (location.pathname.split('/').filter(Boolean)[0] || '').toLowerCase();
  if (!/^[a-z0-9][a-z0-9-]{0,62}$/.test(id)) return;
  var HOST = 'https://change-me-comments.change-me.workers.dev';
  // Warm the overlay's stylesheet. The overlay puts its own <link> for overlay.css
  // inside its shadow root, where a stylesheet blocks nothing — so until that
  // cross-origin request lands, its pins and toolbar paint at browser defaults:
  // large white circles, for about a second. Starting the request here, in parallel
  // with the script instead of after it runs, lets that link resolve from cache.
  // preload rather than a stylesheet on purpose: a stylesheet in <head> would hold
  // this page's first paint on a third-party request, and it would style nothing in
  // this document anyway — the rules only apply inside the shadow root. If the file
  // is renamed or gone, the browser warns in the console and the page is unaffected.
  try {
    var css = document.createElement('link');
    css.rel = 'preload';
    css.as = 'style';
    css.href = HOST + '/overlay.css';
    document.head.appendChild(css);
  } catch (e) { /* the overlay still loads its own copy */ }
  var s = document.createElement('script');
  s.src = HOST + '/overlay.js';
  s.setAttribute('data-room', id);
  document.head.appendChild(s);
})();
</script>
```

Consequences to accept before you publish: screen ids are kebab-case and **stable**, because
renaming a screen orphans its comments; and the first path segment of a published file must be
the screen id, which is why versions live at `public/<screen-id>/vN.html` and nowhere else.

### 4. One password for everyone — `CLIENT_PASSWORD` stays unset

The tool decides the role by which password matched, and checks the designer password first.
**With no `CLIENT_PASSWORD` set, the restricted client role cannot be reached at all.** Everyone
who signs in is a designer: every comment is visible to everyone, and a thread the designer
starts is one the client can see.

Set `CLIENT_PASSWORD` and that quietly stops being true: the review splits in two, and a thread
the designer opened is no longer one the client can answer — which is most of what a design
review is. Names still attribute comments, so you lose nothing by leaving it unset.

Leave it unset. If you ever set it, understand that you are choosing a two-role review and that
threads already started by the designer change behaviour for the client from that moment.

The worker's other secrets are `DESIGNER_PASSWORD` (the one password everyone reviewing uses),
`SESSION_SECRET` (signs the session tokens — any long random string) and `ALLOWED_ORIGINS`
(below). They live on Cloudflare, not in any repo, and survive every deploy.

---

## Standing rules

### Immutability
**Published versions are never edited.** A change after pushing is a new file `vN+1.html` plus a
new entry in `manifest.json`. Exception: fixing a typo or a broken interaction on the same day,
before the client has seen it, if the owner asks.

This is what makes decisions 2 and 3 irreversible: the comments host address and the room name
are written into the file, and the file never changes again.

It also decides what happens when the comment layer arrives after some screens are already out.
Those screens keep no comment layer, for good. That is the rule working, not a gap in it — never
add the tag to an already-published file to "fix" it. Approved means closed: real feedback on a
finished screen starts a new version, and that version carries the snippet on its own.

### The iframe guard
`if (window.top !== window.self) return;` is the first line of the snippet and it stays there.
The index mounts prototypes in an iframe for its hover preview. Without the guard the overlay
loads inside the preview card and calls the comments host **on every hover** — a flood of
requests, pins drawn over a thumbnail, and comments anchored to the wrong thing.

### `ALLOWED_ORIGINS`, exactly as the browser sends it
The worker secret `ALLOWED_ORIGINS` is matched against the browser's `Origin` header, character
for character. That means **scheme + host, no trailing slash, no path**:

```
https://your-hub.example.com          correct
https://your-hub.example.com/         wrong — trailing slash, never matches
your-hub.example.com                  wrong — no scheme
https://your-hub.example.com/index    wrong — a path is not an origin
```

Get it wrong and the symptom is not an error you will recognise: the page loads, the overlay
loads, and every comment request is blocked by the browser's CORS check. If the hub's domain ever
changes, update this first. Several origins go in comma-separated, with no spaces.

### Known FOUC on the comment pins
On a cold cache the overlay's pins and toolbar paint at browser defaults — large white circles —
for up to about a second before `overlay.css` lands. The overlay loads its own stylesheet inside
its shadow root, where a stylesheet blocks nothing, so this is the tool's behaviour and not a
mistake in the page.

**Upstream status: not fixed.** The `rel="preload"` block in the snippet above is the whole
mitigation and it lives here, in this template — it starts the request in parallel with the script
rather than after it, so the shadow-root link can resolve from cache. It shortens the flash; it
does not remove it on a first, uncached visit. When you pull a newer share-proto, check whether
upstream has changed how the overlay loads its stylesheet before you drop the preload.

### Access
The whole site is behind Basic Auth in `middleware.js` (Vercel Routing Middleware, runs before any
file is served). Credentials come from the Vercel Environment Variables `HUB_USER` (optional,
defaults to `review`) and `HUB_PASSWORD` (required — without it the site returns 503).

**Never remove, disable or bypass `middleware.js`** — no excluding paths from its matcher, no
hardcoded credentials, no "temporary" open deploys. Nothing in `public/` is safe to expose
without it.

---

## Structure

```
manifest.json              the two collections — screens + archive, and research
templates/_template.html   starting point for every new prototype; holds the HOST address
scripts/check.js           consistency check (tokens, radius 0, emoji, top comment, fonts,
                           JS syntax, external URLs, placeholder comments host)
scripts/build.js           check -> refresh <screen>/latest.html -> generate public/index.html
                           (also holds the index's own CSS and JS: switch, search/filter/sort,
                           hover preview)
middleware.js              Basic Auth over the whole site
vercel.json                Vercel build settings + noindex header
public/
  index.html               GENERATED — never edit by hand
  robots.txt               Disallow all
  <screen-id>/vN.html      published versions (immutable once pushed)
  <screen-id>/latest.html  GENERATED copy of the newest version
  archive/<screen-id>/...  prototypes made before the template (not style-checked)
  research/<file>.pdf      documents, linked as they are (static, not style-checked)
```

The comments host lives in its own clone of share-proto, outside this repo.

The hub holds **two collections**, kept apart everywhere — in `manifest.json`, in `public/` and on
the index page, where a top-level switch opens one or the other:

- **Prototypes** — `screens` + `archive`, HTML built on the template, versioned, style-checked.
- **Research** — `research`, documents in `public/research/`. One entry per document, no versions,
  no `latest.html`; the link opens the file itself, with no viewer around it.

## Working rules

1. **New prototype = start from `templates/_template.html`.** Keep it self-contained: one file,
   inline CSS/JS, only Google Fonts as an external resource (the comments tag builds its URL in
   JS, so it is not one). Fill the top comment (FONTS, TOKENS USED, RESPONSIVE, markers) and the
   Change notes panel.
2. **Only token colours.** Add colours via the `:root` variables in the template, and keep
   `scripts/check.js`'s `ALLOWED` list in step with them. If a role is missing, stop and ask the
   owner — do not invent a hex. Exceptions (brand logo tiles only) need the comment
   `/* check:allow-color */` and/or `/* check:allow-radius */` on that CSS line.
3. **Published versions are immutable** — see above.
4. **Screen ids** are kebab-case and stable, and they are the room names. Renaming one orphans its
   comments.
5. **Statuses** are the `statuses` list in `manifest.json`. The index splits screens by status:
   `Approved` goes to the **Finished** section (status + approval date + all version links),
   everything else to **Current**. Optional `approved` (YYYY-MM-DD) on a screen entry is the date
   shown there; without it the latest version date is used.
6. **Archive files are never edited or restyled.** They are kept as they were sent, and they are
   not style-checked.
7. **`public/research/` belongs to the hub's owner. Never create, overwrite, move or delete
   anything in it** — not a placeholder, not a stub, not a "temporary" file, and never a wildcard
   delete such as `rm public/research/*.pdf`. Only the owner puts files there. If a file listed in
   `manifest.json` is missing, let the build fail and report exactly which file is missing; do not
   stand one in for it. Keep the `file` value exactly as the file is called on disk — spaces,
   dashes and capitals included — and let the build encode it for the link.
   To see the Research table render before the files are in place, either point `file` at a copy
   made **outside** `public/research/`, or run the build with
   `HUB_SKIP_RESEARCH_FILES=1 node scripts/build.js`, which skips only the file-exists check and
   warns in the output. That flag is for a local look; never commit after a skipped build.
   (The one exception in this template: `EXAMPLE-research.pdf`, which ships as a placeholder so
   the build runs out of the box. Delete it.)
8. **Research entries** are `{ "id", "title", "kind", "date", "file", "note" }`. `kind` is one of
   the top-level `kinds` list — a kind outside it fails the build. `note` is the one-line
   description shown under the title, and it is what the search reads along with the title.
9. **Never put screenshots, client documents, CLAUDE.md files or drafts in `public/`** — everything
   in `public/` is reachable by anyone with the link and the site password. The one exception is
   `public/research/`: documents the owner has decided to share, each registered in
   `manifest.json`.

## Workflows

### Publish a new version of a screen
1. Copy the final file to `public/<screen-id>/vN.html`. If it was not built on the template, say
   so and offer to port it onto the template first — do not port silently.
2. Add the version to `manifest.json` (version, file, date YYYY-MM-DD, one-sentence note of what
   changed). New screen means a new entry with title, status, and `spec` — a link to wherever the
   written spec for that screen lives, or `""` if there is none. There is no
   per-screen Figma link: `manifest.json` holds one top-level `figma` link, shown once on the
   index. A version published before the template stays in `archive/` and is listed with `href`
   (path from `public/`) instead of `file`. The newest version always needs a real `file` in
   `public/<screen-id>/`, since `latest.html` is copied from it.
3. Run `node scripts/build.js`. If the check fails, show the problems and fix only with the
   owner's OK.
4. `git add -A`, `git commit -m "<screen-id> vN: <short note>"`, `git push`.

### Add a research document
1. The owner puts the file in `public/research/` — never copy, rename or create it there (rule 7).
   Take its name exactly as it is on disk.
2. Add it to `manifest.json` under `research` with id, title, kind, date and a one-line note. Ask
   for the kind and the date if they are not obvious; don't guess.
3. Build, commit (`research: add <id>`), push. `<site>/#research` opens the index with the
   Research collection already selected.

### Change a status or links
Edit `manifest.json` only, build, commit (`status: <screen-id> -> <status>`), push.

## Before saying "done"
- `node scripts/build.js` passes.
- Open `public/index.html` locally if the index changed.
- `git status` is clean after the push.
