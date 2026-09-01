#!/usr/bin/env node
/* Validate content/*.json before building.
 *
 * Catches the mistakes that are easy to make when editing content by hand:
 * a typo'd bed id, a duplicate task id, an unknown weight or status, a missing
 * field. Run it with `npm run check`. Exits non-zero on any error.
 */

import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const CONTENT = join(dirname(fileURLToPath(import.meta.url)), "..", "content");

const WEIGHTS = new Set(["now", "seed", "grow", "check"]);
const STATUSES = new Set(["blooming", "finished", "watch"]);
const CONFIDENCE = new Set(["confirmed", "likely", "unknown"]);
const SLIP = new Set(["closes", "costs", "safe"]);

const errors = [];
const warnings = [];

const fail = (msg) => errors.push(msg);
const warn = (msg) => warnings.push(msg);

const readJson = async (name) => {
  try {
    return JSON.parse(await readFile(join(CONTENT, name), "utf8"));
  } catch (error) {
    fail(`${name}: ${error.message}`);
    return null;
  }
};

const garden = await readJson("garden.json");
const plan = await readJson("plan.json");
const plants = await readJson("plants.json");
const questions = await readJson("questions.json");
const journal = await readJson("journal.json");
const idguide = await readJson("idguide.json");
const routine = await readJson("routine.json");

if (garden) {
  for (const field of ["title", "standfirst", "eyebrow", "updated", "season", "beds", "meta"]) {
    if (garden[field] === undefined) fail(`garden.json: missing "${field}"`);
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(garden.updated ?? "")) {
    fail(`garden.json: "updated" must be YYYY-MM-DD, got "${garden.updated}"`);
  }
}

const SUN = new Set(["full", "part", "shade", "unknown"]);

if (garden) {
  const seen = new Set();

  for (const bed of garden.beds ?? []) {
    const where = `garden.json[${bed.id ?? bed.name ?? "?"}]`;

    if (!bed.id) fail(`${where}: missing id`);
    if (seen.has(bed.id)) fail(`${where}: duplicate area id "${bed.id}"`);
    seen.add(bed.id);

    for (const field of ["name", "aspect", "exposure", "description", "watering"]) {
      if (!bed[field]) fail(`${where}: missing "${field}"`);
    }
    if (!SUN.has(bed.sun)) {
      fail(`${where}: sun "${bed.sun}" is not one of ${[...SUN].join(", ")}`);
    }
    if (typeof bed.surveyed !== "boolean") {
      fail(`${where}: "surveyed" must be true or false`);
    }
    if (!bed.map || ["x", "y", "w", "h"].some((k) => typeof bed.map[k] !== "number")) {
      fail(`${where}: "map" needs numeric x, y, w and h so it can be drawn on the site plan`);
    }
    if (bed.surveyed && bed.sun === "unknown") {
      warn(`${where}: surveyed but sun is still "unknown"`);
    }

    /* The map wraps the full name, so the check is whether the longest single
       word fits across the box and whether the wrapped lines fit down it. */
    if (bed.plan) {
      const pw = `${where} plan`;
      if (!bed.plan.goal) fail(`${pw}: needs a "goal", which is what the bed is meant to become`);
      if (!Array.isArray(bed.plan.method) || !bed.plan.method.length) {
        fail(`${pw}: needs a non-empty "method"`);
      }
      for (const step of bed.plan.method ?? []) {
        const sw = `${pw} step "${step.title ?? "?"}"`;
        if (!step.title) fail(`${sw}: missing title`);
        if (!step.when) fail(`${sw}: missing "when"`);
        if (!step.body) fail(`${sw}: missing body`);
      }
      if (bed.plan.watch !== undefined && !Array.isArray(bed.plan.watch)) {
        fail(`${pw}: "watch" must be an array when present`);
      }
    }
    if (bed.map) {
      const label = bed.mapLabel ?? bed.name ?? "";
      const across = (bed.vertical ? bed.map.h : bed.map.w) - 10;
      const down = (bed.vertical ? bed.map.w : bed.map.h) - 6;

      const longest = Math.max(0, ...label.split(" ").map((w) => w.length * 6.2));
      if (longest > across) {
        fail(
          `${where}: the word "${label.split(" ").find((w) => w.length * 6.2 > across)}" needs ` +
            `about ${Math.ceil(longest)} units and the box gives ${across} across. Widen the box, ` +
            `turn the label with "vertical": true, or set a shorter "mapLabel".`
        );
      }

      let line = "";
      let count = 1;
      for (const word of label.split(" ")) {
        const candidate = line ? `${line} ${word}` : word;
        if (line && candidate.length * 6.2 > across) {
          count += 1;
          line = word;
        } else {
          line = candidate;
        }
      }
      if (count * 12 > down) {
        fail(
          `${where}: "${label}" wraps to ${count} lines needing ${count * 12} units and the box ` +
            `gives ${down} down. Make the box taller or set a shorter "mapLabel".`
        );
      }
    }
  }

  for (const s of garden.map?.structures ?? []) {
    if (!s.label) continue;
    const room = (s.vertical ? s.h : s.w) - 8;
    const needed = s.label.length * 6.6;
    if (needed > room) {
      fail(
        `garden.json[${s.id}]: label "${s.label}" needs about ${Math.ceil(needed)} units but the ` +
          `box gives ${room}. Shorten it, turn it, or use "" to leave the block unlabelled.`
      );
    }
  }

  /* The masthead's area count and the survey task both restate what the data
     already knows, and both have quietly gone stale before. Check them. */
  const surveyed = (garden.beds ?? []).filter((b) => b.surveyed).length;
  const areasLine = (garden.meta ?? []).find((m) => m.label === "Areas");
  if (areasLine) {
    const expected = `${garden.beds.length} mapped, ${surveyed} surveyed`;
    if (areasLine.value !== expected) {
      fail(
        `garden.json: the Areas line says "${areasLine.value}" but the beds say "${expected}". ` +
          `Update it, or it drifts every time an area is surveyed.`
      );
    }
  }

  const pending = new Set((garden.beds ?? []).filter((b) => !b.surveyed).map((b) => b.id));
  for (const phase of plan ?? []) {
    for (const task of phase.tasks ?? []) {
      if (!/^survey-/.test(task.id)) continue;
      for (const id of task.beds ?? []) {
        if (!pending.has(id)) {
          fail(
            `plan.json[${task.id}]: lists "${id}", which is already surveyed. A survey task ` +
              `should only name areas whose "surveyed" is false.`
          );
        }
      }
    }
  }

  /* Overlapping rectangles mean the plan is drawn wrong, and it is very hard
     to see in JSON. Structures are allowed to touch beds, beds are not. */
  const boxes = (garden.beds ?? []).filter((b) => b.map);
  for (let i = 0; i < boxes.length; i++) {
    for (let j = i + 1; j < boxes.length; j++) {
      const a = boxes[i].map;
      const b = boxes[j].map;
      const overlap =
        a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
      if (overlap) {
        fail(`garden.json: "${boxes[i].id}" and "${boxes[j].id}" overlap on the site plan`);
      }
    }
  }
}

const bedIds = new Set((garden?.beds ?? []).map((b) => b.id));

const checkBeds = (where, ids) => {
  for (const id of ids ?? []) {
    if (!bedIds.has(id)) {
      fail(`${where}: unknown bed "${id}". Known beds: ${[...bedIds].join(", ") || "none"}`);
    }
  }
};

if (plan) {
  const taskIds = new Set();
  const phaseIds = new Set();

  for (const phase of plan) {
    if (!phase.id) fail("plan.json: a phase is missing an id");
    if (phaseIds.has(phase.id)) fail(`plan.json: duplicate phase id "${phase.id}"`);
    phaseIds.add(phase.id);

    if (!phase.title) fail(`plan.json[${phase.id}]: missing title`);
    if (!Array.isArray(phase.tasks)) {
      fail(`plan.json[${phase.id}]: "tasks" must be an array`);
      continue;
    }

    for (const task of phase.tasks) {
      const where = `plan.json[${phase.id}/${task.id ?? "?"}]`;

      if (!task.id) fail(`${where}: missing id`);
      if (taskIds.has(task.id)) fail(`${where}: duplicate task id "${task.id}"`);
      taskIds.add(task.id);

      if (!task.title) fail(`${where}: missing title`);
      if (!WEIGHTS.has(task.weight)) {
        fail(`${where}: weight "${task.weight}" is not one of ${[...WEIGHTS].join(", ")}`);
      }
      if (typeof task.done !== "boolean") fail(`${where}: "done" must be true or false`);

      if (!SLIP.has(task.slip)) {
        fail(`${where}: slip "${task.slip}" is not one of ${[...SLIP].join(", ")}`);
      }
      if (!task.ifSkipped) {
        fail(
          `${where}: every task needs "ifSkipped" saying plainly what happens if it does not ` +
            `get done. Rachel's time comes in bursts, so that line is how she triages.`
        );
      }
      if (!Array.isArray(task.body) || task.body.length === 0) {
        fail(`${where}: "body" must be a non-empty array of paragraphs`);
      }
      checkBeds(where, task.beds);
    }
  }
}

if (plants) {
  const plantIds = new Set();

  for (const plant of plants) {
    const where = `plants.json[${plant.id ?? plant.name ?? "?"}]`;

    if (!plant.id) fail(`${where}: missing id`);
    if (plantIds.has(plant.id)) fail(`${where}: duplicate plant id "${plant.id}"`);
    plantIds.add(plant.id);

    if (!plant.name) fail(`${where}: missing name`);
    if (!plant.type) fail(`${where}: missing type, use "unknown" if you do not know yet`);

    if (!STATUSES.has(plant.status)) {
      fail(`${where}: status "${plant.status}" is not one of ${[...STATUSES].join(", ")}`);
    }
    if (!CONFIDENCE.has(plant.confidence)) {
      fail(`${where}: confidence "${plant.confidence}" is not one of ${[...CONFIDENCE].join(", ")}`);
    }
    if (plant.confidence !== "confirmed" && !plant.idNote) {
      fail(`${where}: confidence is "${plant.confidence}" so it needs an idNote saying what would settle it`);
    }
    for (const f of ["feed", "deadhead", "good", "poor", "endOfSeason", "propagate"]) {
      if (!plant.care?.[f]) {
        fail(`${where}: care.${f} is missing. Every plant answers the same six questions: what to feed it and when, how to deadhead it, what doing well looks like, what struggling looks like, what to do at the end of the season, and how to get more of it and when.`);
      }
    }

    if (plant.window) {
      const w = plant.window;
      const ok = (m) => Number.isInteger(m) && m >= 1 && m <= 12;
      if (!ok(w.from) || !ok(w.to)) {
        fail(`${where}: window.from and window.to must be month numbers 1 to 12`);
      } else if (w.to < w.from) {
        fail(`${where}: window runs from month ${w.from} to ${w.to}. Windows that wrap the new year are not supported yet.`);
      }
      if (!w.kind) fail(`${where}: window needs a "kind", such as flowers, fruit or harvest`);
    }

    if (!plant.statusLabel) fail(`${where}: missing statusLabel`);
    if (!plant.handling) warn(`${where}: no handling note yet`);
    if (!plant.beds?.length) warn(`${where}: not assigned to any bed`);

    checkBeds(where, plant.beds);
  }
}

if (questions) {
  const ids = new Set();
  for (const q of questions) {
    const where = `questions.json[${q.id ?? "?"}]`;
    if (!q.id) fail(`${where}: missing id`);
    if (ids.has(q.id)) fail(`${where}: duplicate id`);
    ids.add(q.id);
    if (!q.question) fail(`${where}: missing question`);
    if (q.answer !== null && typeof q.answer !== "string") {
      fail(`${where}: "answer" must be a string or null`);
    }
  }
}

if (journal) {
  for (const entry of journal) {
    const where = `journal.json[${entry.date ?? "?"}]`;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(entry.date ?? "")) {
      fail(`${where}: date must be YYYY-MM-DD`);
    }
    if (!entry.title) fail(`${where}: missing title`);
    if (!entry.note) fail(`${where}: missing note`);
  }
}

if (idguide) {
  if (!idguide.intro) fail("idguide.json: missing intro");

  for (const field of ["shots", "tips", "offCamera"]) {
    if (!Array.isArray(idguide[field]) || !idguide[field].length) {
      fail(`idguide.json: "${field}" must be a non-empty array`);
    }
  }

  for (const shot of idguide.shots ?? []) {
    const where = `idguide.json[${shot.name ?? "?"}]`;
    if (!shot.name) fail(`${where}: missing name`);
    if (!shot.what) fail(`${where}: missing "what" instruction`);
    if (!shot.why) fail(`${where}: missing "why" it matters`);
  }

  for (const item of idguide.offCamera ?? []) {
    const where = `idguide.json[${item.title ?? "?"}]`;
    if (!item.title) fail(`${where}: missing title`);
    if (!item.note) fail(`${where}: missing note`);
  }
}

if (routine) {
  if (!routine.intro) fail("routine.json: missing intro");

  const am = routine.amendments;
  if (!am || !Array.isArray(am.items) || !am.items.length) {
    fail('routine.json: "amendments.items" must be a non-empty array');
  } else {
    if (!am.intro) fail("routine.json: amendments needs an intro");
    const seen = new Set();
    for (const item of am.items) {
      const where = `routine.json amendment "${item.id ?? "?"}"`;
      if (!item.id) fail(`${where}: missing id`);
      if (seen.has(item.id)) fail(`${where}: duplicate amendment id`);
      seen.add(item.id);
      // verdict is the line Rachel reads if she reads nothing else, so it is required
      for (const field of ["name", "job", "what", "use", "avoid", "verdict"]) {
        if (!item[field]) fail(`${where}: missing "${field}"`);
      }
    }
  }

  if (!Array.isArray(routine.seasons) || !routine.seasons.length) {
    fail('routine.json: "seasons" must be a non-empty array');
  }

  const seenSeason = new Set();
  for (const season of routine.seasons ?? []) {
    const where = `routine.json season "${season.id ?? "?"}"`;
    if (!season.id) fail(`${where}: missing id`);
    if (seenSeason.has(season.id)) fail(`${where}: duplicate season id`);
    seenSeason.add(season.id);
    for (const field of ["title", "window", "intro"]) {
      if (!season[field]) fail(`${where}: missing "${field}"`);
    }
    if (!season.rule?.title || !Array.isArray(season.rule?.body) || !season.rule.body.length) {
      fail(`${where}: needs a rule with a title and a non-empty body`);
    }
    if (!Array.isArray(season.groups) || !season.groups.length) {
      fail(`${where}: needs at least one group`);
    }
    for (const group of season.groups ?? []) {
      const gw = `${where} group "${group.id ?? "?"}"`;
      if (!group.id) fail(`${gw}: missing id`);
      if (!group.label) fail(`${gw}: missing label`);
      if (!group.why) fail(`${gw}: missing "why", which is the reason the group exists`);
      if (!Array.isArray(group.plants) || !group.plants.length) {
        fail(`${gw}: needs a non-empty list`);
      }
    }
    if (!Array.isArray(season.steps)) fail(`${where}: "steps" must be an array, use [] for none`);
    for (const step of season.steps ?? []) {
      const sw = `${where} step "${step.title ?? "?"}"`;
      if (!step.title) fail(`${sw}: missing title`);
      if (!step.when) fail(`${sw}: missing "when"`);
      if (!step.body) fail(`${sw}: missing body`);
    }
  }

  if (!Array.isArray(routine.works)) fail('routine.json: "works" must be an array, use [] for none');
  for (const w of routine.works ?? []) {
    const where = `routine.json works "${w.title ?? "?"}"`;
    if (!w.title) fail(`${where}: missing title`);
    if (!w.note) fail(`${where}: missing note`);
  }
}

for (const w of warnings) console.warn(`warning  ${w}`);

if (errors.length) {
  for (const e of errors) console.error(`error    ${e}`);
  console.error(`\n${errors.length} problem${errors.length === 1 ? "" : "s"} found.`);
  process.exit(1);
}

console.log(`Content OK${warnings.length ? ` (${warnings.length} warning${warnings.length === 1 ? "" : "s"})` : ""}.`);
