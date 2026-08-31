# Working on this project

A garden plan for eleven growing areas around a house in Seattle. It is a static site built from JSON
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
  plants.json     the inventory, grouped by area at render time
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
  "name": "Side Bed Box",
  "mapLabel": "Side",
  "aspect": "Side wall of the house, which side to be confirmed",
  "exposure": "Morning or afternoon sun, to confirm",
  "sun": "part",
  "surveyed": true,
  "vertical": false,
  "map": { "x": 30, "y": 296, "w": 56, "h": 76 },
  "description": "..."
}
```

`sun` must be `full`, `part`, `shade` or `unknown`, and it drives the fill on
the plan. It is an **ordered** quantity, so the plan renders it as one gold
ramp rather than four unrelated colours: more gold means more sun, and
`unknown` is drawn unfilled with a dashed outline. Do not add a fifth category
or give any level its own hue.

`map` is the rectangle on the plan, in the coordinate space of `map.viewBox`.

**Orientation is settled and should not be re-derived. The plan is north-up:
the street is the NORTH side, the townhomes are SOUTH, west is on the left.**
Rachel confirmed this three independent ways (street faces north, south is
where the townhomes are, the Side Bed Box is on the west wall), and it agrees
with her original hand sketch. This took several wrong turns to pin down
because one intermediate note said "south is at the top", so treat that note
as superseded and do not reason from it. Every sun conclusion in the project
inverts if this is got wrong.

`npm run check` fails if two areas overlap, because that is nearly impossible
to spot in JSON.

**Bed names must match the labels on Rachel's Figma plan exactly**, and the
site plan draws that same full name rather than an abbreviation. Abbreviating
was tried and reverted: it meant the map and the rest of the page called the
same bed two different things. Names wrap onto as many lines as the box needs,
and `npm run check` fails if the longest word will not fit across the box or if
the wrapped lines will not fit down it. Fix that by widening the box, turning
the label with `"vertical": true`, or, as a last resort, setting an explicit
short `mapLabel` override. A structure can have `"label": ""` to stay
unlabelled when its box is too small for any text.

Current names, matching the plan: Path Bed, Street Bed Box 1, Street Bed Box 2,
Driveway Bed 1, Front Lower Bed, Upper Bed, Side Bed Box, Driveway Bed 2, Back
Bed 1, Back Bed 2, Back Bed 3. Upper Bed is the one deliberate difference:
Rachel renamed it from the plan's "Upper Lower Bed".

`watering` records how that area actually gets water, which differs by bed and
changes advice: hose-watered beds get water in bursts when Rachel remembers,
drip-line beds get it steadily. Current split: Front Lower Bed and Upper Bed are
on drip, everything else surveyed is hose by hand, and the three back beds are
unconfirmed.

`surveyed` is false for areas that are on the map but have not been
photographed or walked yet. The area's panel then says so instead of
pretending it is empty.

Tapping an area on the plan opens its panel: what is planted there, and its
tasks ordered by urgency: **calendar phase first**, then weight (`now`, `seed`,
`check`, `grow`), with done tasks last. Calendar has to lead, otherwise an
October reminder outranks a mid-September deadline. Panels are rendered into the HTML at
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
  "slip": "closes",
  "ifSkipped": "The pods shatter and next spring's poppies come up wherever they land.",
  "beds": ["street-2"],
  "flags": ["Closing window"],
  "done": false,
  "body": ["first paragraph", "second paragraph"]
}
```

**`slip` and `ifSkipped` are required on every task and matter more than any
other field here.** Rachel's time comes in bursts, not steadily, and her stated
goal is low maintenance. She needs to know what she can drop, so every task
says plainly what happens if it does not get done.

| slip     | means                                                          |
| -------- | -------------------------------------------------------------- |
| `closes` | a window shuts and it cannot be made up this year                |
| `costs`  | recoverable, but you lose flowers, vigour or make later work     |
| `safe`   | cosmetic or deferrable, nothing suffers                          |

Be honest when grading these. Most deadheading is `costs`, not `closes`:
skipping it means fewer flowers, not dead plants, and saying otherwise turns a
low-maintenance garden into a guilt list. Reserve `closes` for real deadlines,
seed windows, division windows, frost protection, and the one pruning mistake
that cannot be undone. The triage button on the page filters to `closes` only,
so over-grading empties that view of meaning.

`weight` sets the colour of the left stripe and must be one of:

| weight  | means                                        | stripe   |
| ------- | -------------------------------------------- | -------- |
| `now`   | time-sensitive, do it this week               | scarlet  |
| `seed`  | saving, sowing or scattering seed             | gold     |
| `grow`  | ordinary growing and maintenance work         | green    |
| `check` | go look at something and report back          | violet   |

`beds` entries must match an area `id` in `garden.json`. Current ids:
`path-bed`, `street-1`, `street-2`, `driveway-1`, `front-lower`, `upper-lower`, `side`, `driveway-2`, `back-2`, `back-1`, `back-3`. Task `id`s must be unique across the whole
file, because the browser checkboxes key off them.

**plants.json** is the inventory. Each plant:

```json
{
  "id": "shirley-poppy",
  "name": "Shirley poppy",
  "variety": "Papaver rhoeas",
  "beds": ["street-2"],
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

**`care` is required on every plant and is the heart of this project.** Rachel
asked for these six things per plant, in this order, and the page renders
them in that order every time:

```json
"care": {
  "feed":        "If and when it needs soil or fertiliser.",
  "deadhead":    "How and when to deadhead, or that there is nothing to deadhead.",
  "good":        "What it looks like when it is thriving.",
  "poor":        "What it looks like when it is struggling, and what that means.",
  "endOfSeason": "When it is finished, and whether to cut it back or leave it.",
  "propagate":   "Whether to divide, let it seed, take cuttings or just buy more, and when."
}
```

`propagate` must name a season, not just a method: "divide in early spring" is
useful, "divide periodically" is not. Say plainly when the honest answer is buy
new (tulips) or when a plant cannot be renewed at all (a grafted Japanese
maple). Autumn division is usually the wrong call in Seattle because new roots
going into a wet winter rot; surface rhizomes like bearded iris are the
exception.

Write these as things she can see with her eyes, not as categories. "Fat round
buds and thick stems" beats "vigorous growth". For `feed`, "none, ever" is a
real and common answer and is more useful than inventing a schedule; most of
these plants want nothing. For a plant that is not yet identified, say so in
the fields rather than giving generic advice that might be wrong for whatever
it turns out to be.

`art` drives the little mark beside each plant name: `{ "form": "daisy",
"petal": "#C0392B", "centre": "#E3BC4F" }`. These are **schematics, not
photographs**: the flower's form plus its real colour, which between them are
what you match against standing in front of a plant. Do not present them as
photographs and do not try to fetch real images, which the artifact runtime
blocks anyway.

`form` must be one of the keys in `FORMS` in `src/build.mjs`: daisy, pompon,
cup, trumpet, spike, cluster, pincushion, iris, face, pea, berry, needle, leaf,
mat, mixed, unknown. Use `unknown`, which draws a dashed circle with a question
mark, for anything not yet identified rather than guessing a form. Adding a
seventeenth form is fine when a plant genuinely does not fit; keep the path
data short.

The marks are inlined per card rather than referenced from one `<symbol>`
sprite. That was tried and reverted: CSS class selectors do not cross into the
shadow content `<use>` creates, so the colours never applied and every mark
rendered solid black.

`planned: true` marks a plant Rachel intends to put in but has not planted yet.
It renders a "planned" chip on the card. Keep the care fields written as normal,
since the point is knowing what it will need before committing to it.

`window` is optional and drives the year calendar: `{ "from": 3, "to": 5,
"kind": "flowers" }`, month numbers 1 to 12 inclusive. `kind` is free text and
says what the plant is doing in that window, usually flowers, fruit, harvest or
autumn colour. Leave it off a plant whose season you do not actually know
rather than guessing, since a bar on the calendar reads as a fact. Windows that
wrap the new year are not supported yet.

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

## What Rachel wants from this

Stated directly: document what is actually there, and understand the timing of
everything. **She has explicitly said she does not want new recommendations at
the moment.** Record, identify and schedule; do not redesign. The annual
sunflower and zinnia patch in Driveway Bed 1 is deliberate and she enjoys it, so
do not propose replacing it with something lower maintenance.

Low maintenance is a preference she holds, and her time comes in bursts, so
`slip` and `ifSkipped` still matter on every task. That is about making the
existing plan honest, not about changing the planting.

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
