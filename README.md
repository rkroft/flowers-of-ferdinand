# Two Beds, Ten Weeks

A living garden plan for two front beds in Seattle. Edit the content, run the
build, get a single self-contained web page you can open on a phone at the bed.

## Getting started

You need Node 18 or newer. Nothing else, there are no dependencies to install.

```bash
npm start
```

That builds the site and serves it at <http://localhost:4321>. Leave it running,
edit a content file, run `npm run build` again, refresh.

## Updating it

Everything you would want to change week to week lives in `content/`:

| File             | What it holds                                          |
| ---------------- | ------------------------------------------------------ |
| `garden.json`    | Title, intro, the meta strip, bed descriptions          |
| `plan.json`      | The dated phases and the tasks inside them              |
| `plants.json`    | The plant inventory table                               |
| `questions.json` | Open questions, answered in place                       |
| `journal.json`   | A dated log of what you observed and did                |

Then:

```bash
npm run check    # catches typos, bad bed names, duplicate ids
npm run build
```

`check` will tell you exactly which file and field is wrong before you waste
time wondering why the page looks odd.

### The most common edits

**Ticked something off the list.** Set `"done": true` on that task in
`plan.json`. It renders struck through, and the count in the build output goes up.

**Answered one of the open questions.** Replace `"answer": null` in
`questions.json` with the answer as a string. It renders in a green panel and
the "still open" count drops.

**Something happened in the garden.** Append an entry to `journal.json`:

```json
{ "date": "2026-09-07", "title": "Poppy seed shaken", "note": "Scattered along the back edge of bed 2. Kept a film canister of seed as backup." }
```

**New season.** Bump `season` and `updated` in `garden.json`, set every task's
`done` back to `false`, and rewrite the phases for the year ahead. The journal
carries over.

## Working on it with Claude Code

Open this folder in Claude Code and say what changed in the garden. `CLAUDE.md`
tells it where content lives, what the schemas are, which values are legal, and
what house style to write in, so it can make the edit and rebuild without being
walked through the structure each time.

Useful things to ask for:

- "Mark the poppy seed and deadheading tasks done and log what I did."
- "The spike plant smells like licorice. It is agastache. Update everything."
- "Add a November phase task for dividing the gladiolus corms."
- "Draft next spring's phases based on what we left standing."

## Publishing

The build writes two files:

- **`dist/index.html`** is a complete standalone page. Open it directly, or drop
  it on any static host. Everything is inlined except the Google Fonts link.
- **`dist/artifact.html`** is the same page without the `<!doctype>`, `<head>`
  and `<body>` wrapper, which is the shape the Claude Artifact tool expects.
  Publish that file to keep updating the same live URL.

## How it fits together

```
content/*.json  ──▶  src/build.mjs  ──▶  dist/index.html
                          ▲                dist/artifact.html
                          │
              src/styles.css, src/app.js
```

`build.mjs` inlines the CSS and JS at build time, so the output is one file with
no local dependencies. There is no framework and no bundler on purpose: the
whole thing is about 300 lines of plain Node, and it will still run in five years.
