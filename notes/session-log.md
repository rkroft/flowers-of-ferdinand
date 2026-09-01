# Flowers of Ferdinand — Session Log

## 2026-08-31 — Published it, then made it plan rather than record

**What we built.** The garden site went from a folder in Downloads to a live page at
rkroft.github.io/flowers-of-ferdinand. Along the way it changed jobs. It started as a
record of what is planted where, and Rachel said what she actually needs is "the planning
and maintaining, not just noting down the idea," so the site now carries a standing
routine (what to put on the beds, how to put them to bed, how to wake them up) and a
per-bed plan with a goal, a method and the symptoms to watch for.

**Technical changes.**
- `docs/` + `package.json` — publishing. `npm run deploy` runs check, builds, and copies
  `dist/index.html` into `docs/`, which GitHub Pages serves. The check runs first on
  purpose, so a bad content edit fails at her terminal rather than rendering a broken page.
- `content/routine.json` (new, 233 lines) — the standing routine: amendments with a
  required `verdict` line each, a fall and a spring season with a `rule` and grouped
  plant lists, and `works` for practices she has found work here.
- `src/build.mjs` — `renderRoutine()` and `renderBedPlan()`. Bed plans render inside the
  area panel above the inventory. Masthead `eyebrow` and `standfirst` became optional and
  are omitted rather than rendered empty. The triage bar was removed.
- `scripts/check.mjs` — validation for `routine.json` and the optional bed `plan`. Both
  negative-tested by breaking the content on purpose and confirming the errors fired.
- `src/app.js` — tapping an area now jumps its panel to the top of the screen. Triage
  filter behaviour deleted.
- `src/styles.css` — routine and bed-plan styling; a 44px touch target for the task
  checkbox and buttons on coarse pointers, with the drawn box unchanged.
- `content/plants.json` — 12 unidentified plants removed, sunflower record corrected,
  bearded iris marked coming out.
- `content/plan.json` — a `next-spring` phase, because the plan stopped at first frost and
  the sunflower thinning is in April.

**Decisions & tradeoffs.**

- **Decision:** publish from a committed `docs/` folder instead of a GitHub Actions build.
  **Why:** the Actions workflow was written first and is the better mechanism, because CI
  rebuilds on every push and the live page cannot lag the content. The push was rejected:
  the `gh` token has `repo` but not `workflow`, and GitHub refuses a push that creates a
  workflow file without it. Getting the scope needed an interactive `gh auth refresh`,
  which would have left her with no live site until she ran it.
  **Alternatives:** ask her to refresh the scope and wait (blocks the deliverable on a
  command she had not been asked for); rewrite history to drop the workflow file from the
  commit (`git reset` was blocked by the sandbox, and rewriting history to work around a
  permission is the wrong shape anyway).
  **Tradeoff we accepted:** the published page can now go stale. If she edits a JSON file
  and pushes without running `npm run deploy`, the live site keeps the old build and
  nothing complains. `deploy` gates on `check`, which catches bad content, but it cannot
  catch not being run.

- **Decision:** ask which plants "not sure about" meant, rather than infer it.
  **Why:** the plants split three ways, 29 confirmed / 11 likely / 12 unknown, and the site
  itself calls 23 of them unconfirmed. The two readings differed by 11 real plants she
  almost certainly has (daffodils, zinnia, primroses). Guessing wide would have deleted
  them with no signal that anything was lost.
  **Alternatives:** remove all 23, matching the site's own "unconfirmed" wording; remove
  only the 12 and mention it.
  **Tradeoff we accepted:** an interruption, in a session where she was moving fast.

- **Decision:** build a bed `plan` schema rather than answer the sunflower question in chat.
  **Why:** she pushed back on the framing, that recording an idea is not planning it. A
  chat answer would have evaporated. Beds now carry `{goal, method[], watch[]}` with a
  `when` required on every method step, since timing is usually the whole difference.
  **Alternatives:** put the sunflower advice in the plant's `care` fields (it is bed-level
  and would not generalise); a new top-level content file (splits bed knowledge in two).
  **Tradeoff we accepted:** the same fact can now live in a bed's method step and in a
  dated task, and the two can drift. Documented in `CLAUDE.md` that they must agree; the
  sunflower thinning is deliberately in both.

- **Decision:** grade the bearded iris removal `costs`, not `closes`.
  **Why:** her own record says the division window shuts in early September, which is
  pressure to grade it urgent. But removal is not time-limited; only the chance to pass on
  live divisions is. `CLAUDE.md` warns that over-grading empties the meaning of `closes`.
  **Tradeoff we accepted:** it reads as less urgent than it feels. The body says plainly
  why this week still matters.
  **Worth noting:** the triage view this grading protected was deleted an hour later at her
  request. The grading still shows on the task as a tag, so the discipline was not wasted,
  but the reason recorded at the time is now only half-true.

- **Decision:** jump to the panel instead of animating to it.
  **Why:** the first version used `scrollIntoView({behavior: "smooth"})` and did not work.
  Measuring `scrollY` before and after a tap showed 228 and 228 while the panel opened
  correctly at 867px in a 626px viewport. The feature looked shipped and did nothing.
  Instant scroll worked on every bed tested.
  **Tradeoff we accepted:** no animation to soften a long jump. It also removed the
  reduced-motion branch, since there is no motion left to reduce.

- **Decision:** correct her own records where they contradicted what works.
  **Why:** the sunflower `propagate` field said to sow directly in May; she sows in fall and
  it works better here, and fall-sown seed is never transplanted, which matters for a
  taproot. `poor` blamed thin stems on insufficient light in a bed rated full sun, when in
  that bed the cause is crowding. Leaving both would have had the site giving advice that
  works against the stated goal.
  **Tradeoff we accepted:** none worth naming. Recorded in `CLAUDE.md` as a habit to repeat.

**Concepts in play.**
- Build-time rendering over client assembly. Panels and the routine ship in the HTML, so
  content survives the script never running. Already the project's pattern; the new
  sections follow it.
- Validate at the boundary. Every new content shape got a `check.mjs` rule, and each was
  negative-tested rather than assumed. A green check that has never failed proves nothing.
- Honest severity grading. A filter that flags everything filters nothing, so `closes` is
  reserved even when a task feels urgent.
- Progressive disclosure. The bed plan collapses behind its goal line so the panel stays
  scannable, which is the same move as the existing `<details>` on plant division steps.
- Verify with numbers, not appearance. The scroll bug was invisible by eye because the
  panel opened correctly; only `scrollY` showed it.

**Open threads.**
- The site can go stale if `npm run deploy` is skipped. A `gh auth refresh -s workflow`
  plus the already-written Actions workflow would remove the failure mode entirely.
- Upper Lower Bed has 18 plants, so its task list still sits below the fold after the jump.
- The Path Bed will have nothing in flower October to June once the tulips and iris are
  out. Daffodils are named in the bed's watch list as the fix and are not planted; her call.
- A CSS rule that faded the SVG map groups matched the elements and had no competing rule,
  yet computed to opacity 1. Never explained. Worked around by fading the parent `<figure>`
  instead, then discarded with the split layout. If per-element map fading is wanted for
  overlays, this will resurface.
- Chrome automation froze three times during scroll testing. The last split-layout build was
  verified from build output, not visually.
- Bed descriptions still mention a euphorbia and a wildflower mix that were removed from the
  inventory. Left on purpose: the plants are still in the ground, just not identified.
- Overlays are the likely direction for showing bed detail. Not decided; brainstorm first.

**Stories worth keeping.**
- *(technical → story-bank)* The scroll feature that shipped, looked right, and moved nothing.
- *(product/AI → product-judgment)* Asking which 12 of 23 plants to delete instead of guessing.
- *(product/AI → product-judgment)* Being told "planning, not noting," and building a schema
  for it rather than answering the question.
