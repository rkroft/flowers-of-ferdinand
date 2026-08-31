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

if (garden) {
  for (const field of ["title", "standfirst", "eyebrow", "updated", "season", "beds", "meta"]) {
    if (garden[field] === undefined) fail(`garden.json: missing "${field}"`);
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(garden.updated ?? "")) {
    fail(`garden.json: "updated" must be YYYY-MM-DD, got "${garden.updated}"`);
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
  for (const plant of plants) {
    const where = `plants.json[${plant.name ?? "?"}]`;
    if (!plant.name) fail(`${where}: missing name`);
    if (!STATUSES.has(plant.status)) {
      fail(`${where}: status "${plant.status}" is not one of ${[...STATUSES].join(", ")}`);
    }
    if (!plant.statusLabel) fail(`${where}: missing statusLabel`);
    if (!plant.handling) warn(`${where}: no handling note yet`);
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

for (const w of warnings) console.warn(`warning  ${w}`);

if (errors.length) {
  for (const e of errors) console.error(`error    ${e}`);
  console.error(`\n${errors.length} problem${errors.length === 1 ? "" : "s"} found.`);
  process.exit(1);
}

console.log(`Content OK${warnings.length ? ` (${warnings.length} warning${warnings.length === 1 ? "" : "s"})` : ""}.`);
