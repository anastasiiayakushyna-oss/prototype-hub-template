# prototype-hub-template

A template for a **private prototype hub**: a one-page index of interactive HTML prototypes you
share with a client, every screen versioned, every version carrying a review layer the client can
leave comments on.

It is the generic form of a hub that has been in real use. Everything project-specific has been
replaced with a placeholder; what is left is the structure and the decisions behind it.

Press **Use this template** on GitHub, or clone this repository.

## What it is

- **One HTML file per prototype version**, self-contained, built from `templates/_template.html`.
- **An index page** generated from `manifest.json`: two collections (Prototypes and Research)
  behind a switch, with search, a status/kind filter, sort, and a hover preview that mounts the
  prototype in an iframe.
- **Comments on every prototype** — pins on an element, threads, replies, statuses — served by
  [share-proto](https://github.com/DShkiaruk/share-proto) running as a Cloudflare Worker on your
  own account. See *Credit*, below: that tool is not part of this repository and you install it
  yourself.
- **The whole site behind Basic Auth**, enforced by `middleware.js` before any file is served.
- **A consistency check** (`scripts/check.js`) that fails the build on an off-token colour, a
  non-zero radius, an emoji, a wrong font, a syntax error, an unexpected external resource, or a
  comments host still set to the placeholder.

Everything here is plain Node with no dependencies: the build and the check are two files you can
read in one sitting.

## Who it is for

A designer, or a small design team, who hands interactive references to a client and wants one
stable, password-protected place for them, with version history and comments, and no SaaS in the
middle. It assumes you are comfortable running `node` and `npx wrangler` from a terminal, and
that you have a Vercel account and a Cloudflare account. Both free plans are enough.

## Credit

The comment layer — pins, threads, replies, roles, statuses, the whole review experience — is
**[share-proto](https://github.com/DShkiaruk/share-proto)** by Dmytro Shkliaruk, MIT licensed. It
is not vendored here and no part of it is reproduced in this repository; you clone and deploy it
yourself in step 3.

What this repository adds is the hub around it — the index, the prototype template, the check, the
Basic Auth layer — and, in `CLAUDE.md`, the configuration decisions that are not share-proto's to
document: which of its two editions to deploy and why, which choices become permanent the moment
you publish, and the handful of settings that fail silently when they are wrong.

## Setup, in order

1. **Make your own copy.** Use this template on GitHub, or clone it, and make your copy private —
   everything a hub serves is work you have not published yet.

2. **Make it yours.** In `manifest.json` set `title`, `brand` and `owner`; delete the two example
   entries. In `scripts/check.js` replace the `ALLOWED` token list with your project's colour
   tokens, and keep `templates/_template.html`'s `:root` block in step with it — the check is
   only as useful as that list is accurate.

3. **Set up the comments host.** Clone the tool — it has its own release cycle and its own
   upgrade path, which is why it is not copied into this repository:

   ```bash
   git clone https://github.com/DShkiaruk/share-proto
   ```

   Follow that repository's own README and `SKILL.md`; if you work with Claude Code, hand it the
   link `https://github.com/DShkiaruk/share-proto` and let it install from there. Deploy the
   **Cloudflare Worker** edition, not the Vercel Blob one — `CLAUDE.md`, decision 1, explains what
   that choice costs you if you get it the other way round. Give the worker its permanent name,
   pick your `workers.dev` subdomain, and set `DESIGNER_PASSWORD` and `SESSION_SECRET`. Leave
   `CLIENT_PASSWORD` unset — `CLAUDE.md`, decision 4.

   **Then swap one string.** In `templates/_template.html`, the last `<script>` block has a line:

   ```js
   var HOST = 'https://change-me-comments.change-me.workers.dev';
   ```

   Replace it with the address Cloudflare printed on the first deploy. That is the only place the
   address lives, and `scripts/check.js` fails any prototype that still contains `change-me`, so
   the build will stop you before a placeholder reaches a client.

   **It is permanent in every version published after it.** The address is copied into each new
   `vN.html` as that file is created, and published versions are never edited — so changing your
   mind later means republishing every live screen.

4. **Deploy the hub to Vercel** and set `HUB_PASSWORD` (and optionally `HUB_USER`) in its
   Environment Variables. Then set `ALLOWED_ORIGINS` on the worker to the hub's origin, exactly as
   the browser sends it — scheme + host, no trailing slash, no path.

**Steps 3 and 4 must both be finished before you publish the first prototype.** The worker's
address is baked into every file published from the template, and published versions are never
edited — so a screen published before the worker exists carries a dead address for good, and a
screen published before `ALLOWED_ORIGINS` is set gets its comment requests blocked by the browser
with nothing in the page to tell you why.

5. **Delete the examples.** Remove `public/example-screen/`, `public/research/EXAMPLE-research.pdf`
   and their two entries in `manifest.json` once you publish something real. The example screen is
   exempt from the `change-me` check by name in `scripts/check.js`; delete that line with it.

## Everyday use

```bash
node scripts/build.js      # check -> refresh latest.html -> generate public/index.html
node scripts/check.js      # the check on its own
```

Then open `public/index.html`. Vercel runs the same build command on every push, so what you see
locally is what deploys.

## Reading order

- **`README.md`** — this file: what the hub is and how to stand it up.
- **`CLAUDE.md`** — the rules for working in it, and four decisions that cannot be undone once the
  first version is published. It is written as instructions for Claude Code, which is what built
  the hub this came from, but it reads as ordinary documentation and is worth reading whether or
  not you use Claude Code. Read it before you publish anything.

## Licence

MIT — see `LICENSE`. share-proto is separately MIT licensed by its author.
