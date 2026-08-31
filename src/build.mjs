#!/usr/bin/env node
/* Build the garden site.
 *
 * Reads content/*.json, renders it, and writes two files:
 *
 *   dist/index.html     a complete standalone page. Open it, host it anywhere.
 *   dist/artifact.html  the same page without the <!doctype>/<head>/<body>
 *                       skeleton, which is the shape the Claude Artifact tool
 *                       wants when republishing to the live URL.
 *
 * No dependencies. Node 18+.
 */

import { readFile, writeFile, mkdir } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const CONTENT = join(ROOT, "content");
const SRC = join(ROOT, "src");
const DIST = join(ROOT, "dist");

const FONTS =
  "https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,400;9..144,600;9..144,700" +
  "&family=Public+Sans:ital,wght@0,400;0,500;0,600;1,400" +
  "&family=IBM+Plex+Mono:wght@400;500;600&display=swap";

/* ---------- helpers ---------- */

const esc = (value) =>
  String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");

const readJson = async (name) =>
  JSON.parse(await readFile(join(CONTENT, name), "utf8"));

const formatDate = (iso) => {
  const [y, m, d] = String(iso).split("-").map(Number);
  if (!y || !m || !d) return esc(iso);
  const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  return `${months[m - 1]} ${d}, ${y}`;
};

/* ---------- partials ---------- */

function renderMasthead(garden) {
  const meta = garden.meta
    .map((m) => `<span><strong>${esc(m.label)}</strong> ${esc(m.value)}</span>`)
    .join("\n        ");

  return `  <header class="masthead">
    <div class="eyebrow">${esc(garden.eyebrow)}</div>
    <h1>${esc(garden.title)}</h1>
    <p class="standfirst">${esc(garden.standfirst)}</p>
    <div class="meta">
        ${meta}
    </div>
  </header>`;
}

function renderBeds(garden) {
  if (!garden.beds?.length) return "";

  const cards = garden.beds
    .map(
      (bed) => `      <div class="bed">
        <h3>${esc(bed.name)}</h3>
        <span class="role">${esc(bed.role)}</span>
        <p>${esc(bed.description)}</p>
      </div>`
    )
    .join("\n");

  return `  <section>
    <div class="section-head">
      <h2>The two beds</h2>
    </div>
    <div class="beds">
${cards}
    </div>
  </section>`;
}

function renderTask(task, bedsById) {
  const tags = [
    ...(task.beds ?? []).map((id) => {
      const bed = bedsById.get(id);
      return `<span class="tag ${esc(id)}">${esc(bed ? bed.name : id)}</span>`;
    }),
    ...(task.flags ?? []).map((flag) => `<span class="tag flag">${esc(flag)}</span>`),
  ].join("");

  const tagRow = tags ? `          <div class="tags">${tags}</div>\n` : "";
  const paragraphs = (task.body ?? [])
    .map((p) => `          <p>${esc(p)}</p>`)
    .join("\n");

  const done = task.done === true;

  return `      <div class="task${done ? " done" : ""}" data-weight="${esc(task.weight ?? "grow")}" data-id="${esc(task.id)}" data-source-done="${done}">
        <input type="checkbox" ${done ? "checked " : ""}aria-labelledby="h-${esc(task.id)}">
        <div class="task-body">
${tagRow}          <h3 id="h-${esc(task.id)}">${esc(task.title)}</h3>
${paragraphs}
        </div>
      </div>`;
}

function renderPhase(phase, bedsById) {
  const note = phase.note
    ? `    <p class="section-note">${esc(phase.note)}</p>\n`
    : "";

  const tasks = phase.tasks.map((t) => renderTask(t, bedsById)).join("\n\n");

  const callout = phase.callout
    ? `\n\n    <div class="callout">
      <h3>${esc(phase.callout.title)}</h3>
      <p>${esc(phase.callout.body)}</p>
    </div>`
    : "";

  return `  <section id="${esc(phase.id)}">
    <div class="section-head">
      <h2>${esc(phase.title)}</h2>
      ${phase.window ? `<span class="window">${esc(phase.window)}</span>` : ""}
    </div>
${note}    <div class="tasks">

${tasks}

    </div>${callout}
  </section>`;
}

function plantRow(plant) {
  const uncertain = plant.confidence !== "confirmed";
  const mark = uncertain
    ? `<span class="conf conf-${esc(plant.confidence)}">${plant.confidence === "likely" ? "likely" : "unknown"}</span>`
    : "";

  return `          <tr>
            <td class="plant">${esc(plant.name)}${mark}${plant.variety ? `<em>${esc(plant.variety)}</em>` : ""}</td>
            <td class="type">${esc(plant.type)}</td>
            <td><span class="status ${esc(plant.status)}">${esc(plant.statusLabel)}</span></td>
            <td>${esc(plant.handling)}</td>
          </tr>`;
}

function renderPlants(plants, garden) {
  const confirmed = plants.filter((p) => p.confidence === "confirmed").length;

  const groups = garden.beds
    .map((bed) => {
      const inBed = plants.filter((p) => (p.beds ?? []).includes(bed.id));
      if (!inBed.length) return "";

      const shared = inBed.filter((p) => (p.beds ?? []).length > 1).length;
      const count = `${inBed.length} plant${inBed.length === 1 ? "" : "s"}${
        shared ? `, ${shared} shared with the other bed` : ""
      }`;

      return `    <div class="bed-group">
      <div class="bed-group-head">
        <h3>${esc(bed.name)}</h3>
        <span class="window">${count}</span>
      </div>
      <div class="table-scroll">
        <table>
          <thead>
            <tr>
              <th>Plant</th>
              <th>Type</th>
              <th>Status</th>
              <th>Handling</th>
            </tr>
          </thead>
          <tbody>
${inBed.map(plantRow).join("\n")}
          </tbody>
        </table>
      </div>
    </div>`;
    })
    .filter(Boolean)
    .join("\n\n");

  return `  <section id="plants">
    <div class="section-head">
      <h2>Bed inventory</h2>
      <span class="window">${confirmed} of ${plants.length} confirmed</span>
    </div>
    <p class="section-note">Plants growing in both beds are listed under each. Anything not marked confirmed is a working guess, not a fact.</p>

${groups}
  </section>`;
}

function renderUnknowns(plants) {
  const open = plants.filter((p) => p.confidence !== "confirmed" && p.idNote);
  if (!open.length) return "";

  const unknown = open.filter((p) => p.confidence === "unknown").length;

  const items = open
    .map(
      (p) => `      <div class="id-card" data-confidence="${esc(p.confidence)}">
        <div class="id-card-head">
          <h3>${esc(p.name)}</h3>
          <span class="conf conf-${esc(p.confidence)}">${esc(p.confidence)}</span>
        </div>
        <p>${esc(p.idNote)}</p>
      </div>`
    )
    .join("\n");

  return `  <section id="unknowns">
    <div class="section-head">
      <h2>Still to identify</h2>
      <span class="window">${unknown} unknown, ${open.length - unknown} to confirm</span>
    </div>
    <p class="section-note">What to look at, and what would settle it. Photograph anything on this list next time you are out there.</p>

    <div class="id-cards">
${items}
    </div>
  </section>`;
}

function renderIdGuide(guide) {
  const shots = guide.shots
    .map(
      (shot) => `      <li class="shot">
        <h3>${esc(shot.name)}</h3>
        <p>${esc(shot.what)}</p>
        <p class="why"><span>Why</span> ${esc(shot.why)}</p>
      </li>`
    )
    .join("\n");

  const tips = guide.tips.map((t) => `        <li>${esc(t)}</li>`).join("\n");

  const off = guide.offCamera
    .map(
      (item) => `      <div class="id-card" data-confidence="likely">
        <div class="id-card-head"><h3>${esc(item.title)}</h3></div>
        <p>${esc(item.note)}</p>
      </div>`
    )
    .join("\n");

  return `  <section id="id-guide">
    <div class="section-head">
      <h2>How to photograph a plant for ID</h2>
      <span class="window">${guide.shots.length} shots per plant</span>
    </div>
    <p class="section-note">${esc(guide.intro)}</p>

    <ol class="shots">
${shots}
    </ol>

    <div class="callout">
      <h3>While you are out there</h3>
      <ul>
${tips}
      </ul>
    </div>

    <h3 class="sub-head">Things that beat taking more photos</h3>
    <div class="id-cards">
${off}
    </div>
  </section>`;
}

function renderQuestions(questions) {
  const open = questions.filter((q) => !q.answer).length;

  const items = questions
    .map(
      (q) => `      <div class="q${q.answer ? " answered" : ""}">
        <div>
          <h3>${esc(q.question)}</h3>
          <p>${esc(q.detail)}</p>
          ${q.answer ? `<div class="answer">${esc(q.answer)}</div>` : ""}
        </div>
      </div>`
    )
    .join("\n");

  return `  <section id="questions">
    <div class="section-head">
      <h2>Things to check</h2>
      <span class="window">${open} still open</span>
    </div>

    <div class="qlist">
${items}
    </div>
  </section>`;
}

function renderJournal(entries) {
  if (!entries?.length) return "";

  const sorted = [...entries].sort((a, b) => String(b.date).localeCompare(String(a.date)));

  const items = sorted
    .map(
      (e) => `      <div class="entry">
        <time datetime="${esc(e.date)}">${formatDate(e.date)}</time>
        <div>
          <h3>${esc(e.title)}</h3>
          <p>${esc(e.note)}</p>
        </div>
      </div>`
    )
    .join("\n");

  return `  <section id="journal">
    <div class="section-head">
      <h2>Log</h2>
      <span class="window">${sorted.length} ${sorted.length === 1 ? "entry" : "entries"}</span>
    </div>

    <div class="journal">
${items}
    </div>
  </section>`;
}

function renderFooter(garden) {
  return `  <footer>
    <p>${esc(garden.footnote)}</p>
    <div class="actions">
      <button class="btn" type="button" id="copy-done">Copy done list</button>
      <button class="btn" type="button" id="reset">Reset to plan</button>
    </div>
    <span class="built">Built ${formatDate(garden.updated)} · season ${esc(garden.season)}</span>
  </footer>`;
}

/* ---------- assembly ---------- */

async function build() {
  const [garden, plan, plants, questions, journal, idguide, css, js] = await Promise.all([
    readJson("garden.json"),
    readJson("plan.json"),
    readJson("plants.json"),
    readJson("questions.json"),
    readJson("journal.json"),
    readJson("idguide.json"),
    readFile(join(SRC, "styles.css"), "utf8"),
    readFile(join(SRC, "app.js"), "utf8"),
  ]);

  const bedsById = new Map(garden.beds.map((b) => [b.id, b]));

  const head = `<title>${esc(garden.title)}</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="${FONTS}">

<style>
${css}</style>`;

  const body = `<div class="wrap">

${renderMasthead(garden)}

${renderBeds(garden)}

${plan.map((phase) => renderPhase(phase, bedsById)).join("\n\n")}

${renderPlants(plants, garden)}

${renderUnknowns(plants)}

${renderIdGuide(idguide)}

${renderQuestions(questions)}

${renderJournal(journal)}

${renderFooter(garden)}

</div>

<script>
${js}</script>`;

  await mkdir(DIST, { recursive: true });

  /* dist/artifact.html: no page skeleton, for the Claude Artifact tool */
  await writeFile(join(DIST, "artifact.html"), `${head}\n\n${body}\n`, "utf8");

  /* dist/index.html: a complete page for hosting or opening locally */
  const page = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="description" content="${esc(garden.standfirst)}">
<meta name="color-scheme" content="light dark">
${head}
</head>
<body>
${body}
</body>
</html>
`;
  await writeFile(join(DIST, "index.html"), page, "utf8");

  const taskCount = plan.reduce((n, phase) => n + phase.tasks.length, 0);
  const doneCount = plan.reduce(
    (n, phase) => n + phase.tasks.filter((t) => t.done).length,
    0
  );
  const unconfirmed = plants.filter((p) => p.confidence !== "confirmed").length;

  console.log("Built dist/index.html and dist/artifact.html");
  console.log(
    `  ${plan.length} phases · ${taskCount} tasks (${doneCount} done) · ` +
      `${plants.length} plants (${unconfirmed} unconfirmed) · ` +
      `${questions.filter((q) => !q.answer).length} open questions`
  );
}

build().catch((error) => {
  console.error("Build failed:", error.message);
  process.exit(1);
});
