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

    for (const field of ["name", "aspect", "exposure", "description", "mapLabel"]) {
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

for (const w of warnings) console.warn(`warning  ${w}`);

if (errors.length) {
  for (const e of errors) console.error(`error    ${e}`);
  console.error(`\n${errors.length} problem${errors.length === 1 ? "" : "s"} found.`);
  process.exit(1);
}

console.log(`Content OK${warnings.length ? ` (${warnings.length} warning${warnings.length === 1 ? "" : "s"})` : ""}.`);
