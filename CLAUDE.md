# Working on this project

A garden plan for two front beds in Seattle. It is a static site built from JSON
content by a small Node script. No dependencies, no framework, no build tooling
beyond Node itself.

## The one rule

**Content changes go in `content/*.json`. Never edit anything in `dist/`.**
`dist/` is generated and is gitignored. If a change cannot be expressed in the
content files, that is a signal the schema needs extending, not that the built
HTML should be hand-edited.

## Commands

```
npm run check    validate content/*.json (run this before build)
npm run build    render content into dist/index.html and dist/artifact.html
npm start        build, then serve on http://localhost:4321
```

Always run `npm run check && npm run build` after editing content. `check` exits
non-zero and names the file and field on any problem.

## Layout

```
content/          the only files that change week to week
  garden.json     title, standfirst, meta strip, the areas, the site plan geometry
  plan.json       phases, each holding dated tasks
  plants.json     the bed inventory, grouped by bed at render time
  questions.json  open diagnostic questions, answered in place
  journal.json    dated log entries, newest rendered first
  idguide.json    how to photograph a plant for identification
src/
  build.mjs       renders content into dist/
  styles.css      design tokens and all page styling
  app.js          the field checkboxes
scripts/
  check.mjs       content validation
  serve.mjs       local static server
dist/             generated, gitignored
  index.html      complete standalone page, host it anywhere
  artifact.html   same page without <!doctype>/<head>/<body>, for republishing
                  to the Claude Artifact URL
```

## Content schemas

**garden.json** holds the areas and the interactive site plan. Each area:

```json
{
  "id": "side",
  "name": "Side Bed",
  "mapLabel": "Side",
  "aspect": "West wall of the house",
  "exposure": "Afternoon sun, rain shadow",
  "sun": "part",
  "surveyed": true,
  "map": { "x": 24, "y": 172, "w": 42, "h": 82 },
  "description": "..."
}
```

`sun` must be `full`, `part`, `shade` or `unknown`, and it drives the fill on
the plan. It is an **ordered** quantity, so the plan renders it as one gold
ramp rather than four unrelated colours: more gold means more sun, and
`unknown` is drawn unfilled with a dashed outline. Do not add a fifth category
or give any level its own hue.

`map` is the rectangle on the plan, in the coordinate space of
`map.viewBox`. **North is at the top**, which is a 180 degree turn from
Rachel's original sketch, so check the compass before moving anything.
`npm run check` fails if two areas overlap, because that is nearly impossible
to spot in JSON.

`mapLabel` is the short label drawn inside the rectangle. Narrow beds need it
or the text runs outside the box; the build verifies nothing overflows only if
you look at the rendered page, so keep it short.

`surveyed` is false for areas that are on the map but have not been
photographed or walked yet. The area's panel then says so instead of
pretending it is empty.

Tapping an area on the plan opens its panel: what is planted there, and its
tasks ordered by urgency (`now`, then `seed`, then `check`, then `grow`, then
by calendar phase, with done tasks last). Panels are rendered into the HTML at
build time, not assembled in the browser, so the content exists even if the
script never runs.


**plan.json** is an array of phases:

```json
{
  "id": "this-week",
  "title": "Do this week",
  "window": "Aug 31 – Sep 6",
  "note": "optional intro paragraph, use \"\" for none",
  "tasks": [ ... ],
  "callout": { "title": "...", "body": "..." }
}
```

A task:

```json
{
  "id": "poppy-seed",
  "title": "Shake the poppy seed where you want it",
  "weight": "seed",
  "beds": ["bed2"],
  "flags": ["Closing window"],
  "done": false,
  "body": ["first paragraph", "second paragraph"]
}
```

`weight` sets the colour of the left stripe and must be one of:

| weight  | means                                        | stripe   |
| ------- | -------------------------------------------- | -------- |
| `now`   | time-sensitive, do it this week               | scarlet  |
| `seed`  | saving, sowing or scattering seed             | gold     |
| `grow`  | ordinary growing and maintenance work         | green    |
| `check` | go look at something and report back          | violet   |

`beds` entries must match an `id` in `garden.json`. Task `id`s must be unique
across the whole file, because the browser checkboxes key off them.

**plants.json** is the bed inventory. Each plant:

```json
{
  "id": "shirley-poppy",
  "name": "Shirley poppy",
  "variety": "Papaver rhoeas",
  "beds": ["bed2"],
  "type": "annual",
  "confidence": "confirmed",
  "status": "watch",
  "statusLabel": "Seed now",
  "handling": "What to do with it.",
  "idNote": ""
}
```

`status` must be `blooming`, `finished` or `watch`. `statusLabel` is free text
shown in the table, so it can say anything ("Going over", "Check thrips").

`confidence` must be `confirmed`, `likely` or `unknown`, and this is the field
that matters most. **Never promote a plant to `confirmed` on your own inference.**
Only a real-world observation does that: the user saw it, tested it, or an
expert identified it. A guess from a photo is `likely` at best. Anything not
`confirmed` requires a non-empty `idNote` saying specifically what would settle
it, and `npm run check` enforces that.

`type` is free text (`annual`, `perennial`, `tender perennial`, `corm`,
`perennial herb`). Use `"unknown"` rather than leaving it blank.

Plants listing more than one bed appear under each bed, which is correct for an
inventory. The "Still to identify" section is generated from every plant whose
confidence is not `confirmed`, so there is no separate list to keep in sync.

**idguide.json** holds the photography reference: an `intro`, a `shots` array
(each with `name`, `what`, `why`), a `tips` array of strings, and an `offCamera`
array of `{title, note}`. The shot list is deliberately numbered because it is a
sequence to repeat at every plant, so keep it ordered and keep it short.

**questions.json** `answer` is `null` while the question is open. Filling it in
with a string renders the answer inline and marks the question resolved. Do not
delete answered questions, the record of what was checked is useful.

**journal.json** dates are `YYYY-MM-DD`. Entries are sorted newest first at
build time, so append rather than prepend.

## Common jobs

- **Mark a task done**: set `"done": true` in `plan.json`. That is the durable
  record. The checkboxes in the browser are a local convenience only.
- **Add a task**: add it to the right phase's `tasks` array with a new unique id.
- **Log an observation**: append to `journal.json`.
- **Answer a question**: replace the `null` in `questions.json` with the answer,
  and update anything downstream it settles (a plant's `handling`, a task body).
- **Identify a plant**: set `confidence` to `confirmed`, fill in the real name
  and `variety`, clear the `idNote`, and update `type`, `status` and `handling`
  to match what it actually is. Check whether any task in `plan.json` was
  written around the uncertainty and rewrite it. Log the identification in
  `journal.json` with what settled it.
- **Roll into a new season**: bump `season` and `updated` in `garden.json`,
  reset the `done` flags, rewrite the phases.

## Conventions

- **No em dashes in prose.** Rachel's preference. Use commas, colons or a rewrite.
  En dashes in date ranges ("Aug 31 – Sep 6") are fine.
- Write plant advice in plain language with the reason attached. "Cut the spike
  because the seed capsules are stealing energy from the corm" beats "cut spike".
- Keep task bodies to one or two short paragraphs.
- Assume Seattle, USDA zone 8b in-city, first frost around mid-November but
  highly variable. Never write a hard November date, write "watch the forecast".

## Design

All colour lives in CSS custom properties at the top of `styles.css`, defined
three times: bare `:root` for light, `@media (prefers-color-scheme: dark)`
guarded with `:root:not([data-theme="light"])`, and `:root[data-theme="dark"]`.
If you add a colour, add it in all three places. Never declare a colour only
inside a media block, it will not apply for viewers on the default system theme.

Type is Fraunces for display, Public Sans for body, IBM Plex Mono for dates,
labels and data. Loaded from Google Fonts with real fallback stacks.
