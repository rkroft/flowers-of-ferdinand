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
  </header>

  <div class="triage">
    <p>Time comes in bursts, so most of this list is optional. Seven jobs have a window that closes and cannot be made up later.</p>
    <button class="btn" type="button" id="triage-toggle" aria-pressed="false">Show only what cannot wait</button>
  </div>`;
}

/* The site plan. Geometry comes from garden.json so the drawing and the
   written descriptions can never drift apart. Fill encodes sun, which is an
   ordered quantity, so it runs on one gold ramp rather than four unrelated
   colours: more gold means more sun, and unsurveyed areas stay unfilled. */
const WEIGHT_RANK = { now: 0, seed: 1, check: 2, grow: 3 };
const WEIGHT_LABEL = {
  now: "Do now",
  seed: "Seed window",
  check: "Go look",
  grow: "Upkeep",
};

/* Every task, flattened out of its phase and tagged with where it sits in the
   calendar, so an area's list can be ordered by urgency instead of by section. */
function flattenTasks(plan) {
  return plan.flatMap((phase, phaseIndex) =>
    phase.tasks.map((task) => ({ ...task, phase: phase.title, window: phase.window, phaseIndex }))
  );
}

function renderAreaPanel(bed, plants, tasks) {
  const inBed = plants.filter((p) => (p.beds ?? []).includes(bed.id));

  const mine = tasks
    .filter((t) => (t.beds ?? []).includes(bed.id))
    /* Calendar first, weight second. A job in this week's window outranks one
       in October whatever its label, and weight only breaks ties inside a
       window. Sorting by weight first put an October reminder above a
       mid-September deadline. */
    .sort(
      (a, b) =>
        Number(a.done) - Number(b.done) ||
        a.phaseIndex - b.phaseIndex ||
        (WEIGHT_RANK[a.weight] ?? 9) - (WEIGHT_RANK[b.weight] ?? 9)
    );

  const plantList = inBed.length
    ? `        <ul class="panel-plants">
${inBed
  .map(
    (p) => `          <li>
            <span class="pn">${esc(p.name)}${
              p.confidence !== "confirmed"
                ? ` <span class="conf conf-${esc(p.confidence)}">${p.confidence === "likely" ? "likely" : "unknown"}</span>`
                : ""
            }</span>
            <span class="ps status ${esc(p.status)}">${esc(p.statusLabel)}</span>
          </li>`
  )
  .join("\n")}
        </ul>`
    : `        <p class="panel-empty">Nothing recorded here yet. This area has not been surveyed.</p>`;

  const taskList = mine.length
    ? `        <ol class="panel-tasks">
${mine
  .map(
    (t) => `          <li class="${t.done ? "done" : ""}" data-weight="${esc(t.weight)}" data-slip="${esc(t.slip ?? "safe")}">
            <div class="pt-head">
              <span class="pt-weight">${esc(WEIGHT_LABEL[t.weight] ?? t.weight)}</span>
              <span class="pt-window">${esc(t.window)}</span>
              ${t.slip === "closes" ? `<span class="pt-closes">cannot be made up</span>` : ""}
            </div>
            <span class="pt-title">${esc(t.title)}</span>
          </li>`
  )
  .join("\n")}
        </ol>`
    : `        <p class="panel-empty">No jobs on the list for this area yet.</p>`;

  return `      <div class="panel" data-panel="${esc(bed.id)}" hidden>
        <div class="panel-head">
          <h3>${esc(bed.name)}</h3>
          <span class="sun" data-sun="${esc(bed.sun)}">${esc(bed.exposure)}</span>
        </div>
        <p class="panel-aspect">${esc(bed.aspect)}</p>
        <p class="panel-desc">${esc(bed.description)}</p>

        <h4>What is in it <span>${inBed.length}</span></h4>
${plantList}

        <h4>Priority list <span>${mine.filter((t) => !t.done).length} open</span></h4>
${taskList}
      </div>`;
}

function renderMap(garden, plants, plan) {
  const map = garden.map;
  if (!map) return "";
  const tasks = flattenTasks(plan);

  const structures = map.structures
    .map(
      (s) => `      <rect class="m-structure" x="${s.x}" y="${s.y}" width="${s.w}" height="${s.h}" rx="2"></rect>${
        s.label
          ? `\n      <text class="m-structure-label" x="${s.x + s.w / 2}" y="${s.y + s.h / 2}" text-anchor="middle" dominant-baseline="central"${
              s.vertical ? ` transform="rotate(-90 ${s.x + s.w / 2} ${s.y + s.h / 2})"` : ""
            }>${esc(s.label)}</text>`
          : ""
      }`
    )
    .join("\n");

  const lines = map.lines
    .map(
      (l) => `      <line class="m-line" x1="${l.x1}" y1="${l.y1}" x2="${l.x2}" y2="${l.y2}"></line>
      <text class="m-line-label" x="${l.vertical ? l.x1 - 6 : l.x1 + 4}" y="${l.vertical ? (l.y1 + l.y2) / 2 : l.y1 - 6}"${
        l.vertical
          ? ` text-anchor="middle" transform="rotate(-90 ${l.x1 - 6} ${(l.y1 + l.y2) / 2})"`
          : ""
      }>${esc(l.label)}</text>`
    )
    .join("\n");

  const beds = garden.beds
    .map((bed) => {
      const m = bed.map;
      if (!m) return "";
      const cx = m.x + m.w / 2;
      const cy = m.y + m.h / 2;
      /* Narrow beds need a short label or the text runs outside the box. */
      const short =
        bed.mapLabel ??
        bed.name.replace(/^Street Bed /, "Street ").replace(/^Back Bed /, "Back ");

      /* Narrow strips get their label turned, the way they are on the plan. */
      const turn = bed.vertical ? ` transform="rotate(-90 ${cx} ${cy})"` : "";

      return `      <g class="m-hit" role="button" tabindex="0" data-bed="${esc(bed.id)}" aria-pressed="false" aria-label="${esc(bed.name)}, ${esc(bed.exposure)}. Show what is planted here and what needs doing.">
        <rect class="m-bed" data-sun="${esc(bed.sun)}" data-surveyed="${bed.surveyed}" x="${m.x}" y="${m.y}" width="${m.w}" height="${m.h}" rx="2"></rect>
        <text class="m-bed-label" x="${cx}" y="${cy}" text-anchor="middle" dominant-baseline="central"${turn}>${esc(short)}</text>
      </g>`;
    })
    .join("\n");

  const legend = [
    ["full", "Full sun"],
    ["part", "Part sun"],
    ["shade", "Shade"],
    ["unknown", "Not surveyed"],
  ]
    .map(
      ([sun, label]) =>
        `        <li><span class="swatch" data-sun="${sun}"></span>${label}</li>`
    )
    .join("\n");

  const panels = garden.beds
    .map((bed) => renderAreaPanel(bed, plants, tasks))
    .join("\n");

  return `  <section id="map">
    <div class="section-head">
      <h2>Site plan</h2>
      <span class="window">Tap an area</span>
    </div>
    <p class="section-note">Tap or click any bed to see what is planted in it and what needs doing there, most urgent first.</p>

    <figure class="plan">
      <svg viewBox="${esc(map.viewBox)}" role="img" aria-label="Site plan of nine growing areas around the house, shaded by how much sun each receives. The front bed sits on the north side of the house and is shaded; back bed 2 sits on the south wall and gets the most sun; the side bed is on the west wall.">
        <g class="m-structures">
${structures}
        </g>
        <g class="m-lines">
${lines}
        </g>
        <g class="m-beds">
${beds}
        </g>
${(() => {
    /* All four points, always. Which way this plan faced took several rounds
       to pin down, and a lone north arrow leaves room for the same mistake. */
    const cx = map.compass?.x ?? 500;
    const cy = map.compass?.y ?? 300;
    const down = map.north === "down";
    const tip = down ? 22 : -22;
    const tail = down ? -20 : 20;
    const barb = down ? 10 : -10;

    return `        <g class="m-compass" transform="translate(${esc(cx)} ${esc(cy)})">
          <line x1="0" y1="${tail}" x2="0" y2="${barb}"></line>
          <polygon points="0,${tip} -5,${barb} 5,${barb}"></polygon>
          <line x1="-18" y1="0" x2="18" y2="0"></line>
          <text x="0" y="${down ? 38 : -28}" text-anchor="middle">N</text>
          <text x="0" y="${down ? -26 : 40}" text-anchor="middle">S</text>
          <text x="-30" y="5" text-anchor="middle">W</text>
          <text x="30" y="5" text-anchor="middle">E</text>
        </g>`;
  })()}
      </svg>
      <figcaption>${esc(map.caption)}</figcaption>
    </figure>

    <ul class="legend">
${legend}
    </ul>

    <div class="panels" id="panels">
      <p class="panel-prompt" id="panel-prompt">Tap an area on the plan to see its plants and its priority list.</p>
${panels}
    </div>
  </section>`;
}

function renderTask(task, bedsById) {
  const tags = [
    ...(task.beds ?? []).map((id) => {
      const bed = bedsById.get(id);
      return `<span class="tag tag-area">${esc(bed ? bed.name : id)}</span>`;
    }),
    ...(task.flags ?? []).map((flag) => `<span class="tag tag-flag">${esc(flag)}</span>`),
    task.slip === "closes" ? `<span class="tag tag-closes">Cannot be made up</span>` : "",
  ].join("");

  const tagRow = tags ? `          <div class="tags">${tags}</div>\n` : "";
  const paragraphs = (task.body ?? [])
    .map((p) => `          <p>${esc(p)}</p>`)
    .join("\n");

  const done = task.done === true;
  const skip = task.ifSkipped
    ? `\n          <p class="if-skipped"><span>If you skip it</span> ${esc(task.ifSkipped)}</p>`
    : "";

  return `      <div class="task${done ? " done" : ""}" data-weight="${esc(task.weight ?? "grow")}" data-slip="${esc(task.slip ?? "safe")}" data-id="${esc(task.id)}" data-source-done="${done}">
        <input type="checkbox" ${done ? "checked " : ""}aria-labelledby="h-${esc(task.id)}">
        <div class="task-body">
${tagRow}          <h3 id="h-${esc(task.id)}">${esc(task.title)}</h3>
${paragraphs}${skip}
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

/* Three letters, not one. J, M and A each appear twice in a year and a single
   initial makes the reader count columns to work out where they are. */
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

/* The year at a glance: one row per plant, a bar across the months it is doing
   something. One measure, so one hue rather than a palette; the only other
   colour is the band marking the month you are reading it in. Built as a real
   table so it is readable by row header and by screen reader, not just by eye. */
function renderCalendar(garden, plants, now) {
  const withWindow = plants.filter((p) => p.window);
  if (!withWindow.length) return "";

  const thisMonth = now.getMonth() + 1;

  const head = MONTHS.map(
    (m, i) =>
      `<th scope="col"${i + 1 === thisMonth ? ' class="is-now"' : ""}><abbr title="${MONTH_NAMES[i]}">${m}</abbr></th>`
  ).join("");

  const groups = garden.beds
    .map((bed) => {
      const rows = withWindow
        .filter((p) => (p.beds ?? []).includes(bed.id))
        .sort((a, b) => a.window.from - b.window.from || a.window.to - b.window.to);
      if (!rows.length) return "";

      const body = rows
        .map((p) => {
          const { from, to, kind } = p.window;
          const cells = MONTHS.map((_, i) => {
            const m = i + 1;
            const on = m >= from && m <= to;
            const cls = [
              on ? "on" : "",
              on && m === from ? "start" : "",
              on && m === to ? "end" : "",
              m === thisMonth ? "is-now" : "",
            ]
              .filter(Boolean)
              .join(" ");
            return `<td${cls ? ` class="${cls}"` : ""}>${
              on
                ? `<span class="bar" title="${esc(p.name)}: ${esc(kind)} ${MONTH_NAMES[from - 1]} to ${MONTH_NAMES[to - 1]}"></span>`
                : ""
            }</td>`;
          }).join("");

          return `            <tr>
              <th scope="row">${esc(p.name)}<em>${esc(kind)}</em></th>
${cells}
            </tr>`;
        })
        .join("\n");

      return `      <div class="cal-group">
        <h3>${esc(bed.name)}</h3>
        <div class="table-scroll">
          <table class="calendar">
            <thead>
              <tr><th scope="col" class="cal-corner">Plant</th>${head}</tr>
            </thead>
            <tbody>
${body}
            </tbody>
          </table>
        </div>
      </div>`;
    })
    .filter(Boolean)
    .join("\n\n");

  const missing = plants.length - withWindow.length;

  return `  <section id="calendar">
    <div class="section-head">
      <h2>The year</h2>
      <span class="window">${MONTH_NAMES[thisMonth - 1]} highlighted</span>
    </div>
    <p class="section-note">A bar marks the months a plant is doing the thing named under it. Everything else about the year, growing, dying back, sitting dormant, is deliberately not shown.</p>

    <dl class="key">
      <div>
        <dt><span class="key-bar"></span></dt>
        <dd><strong>The bar</strong> is the window when that plant performs. The label under each name says what it is doing: flowers, fruit, harvest or autumn colour. A short bar is not a worse plant, just a shorter season.</dd>
      </div>
      <div>
        <dt><span class="key-band"></span></dt>
        <dd><strong>The band</strong> is the month you are reading this in, so you can see at a glance what should be performing right now.</dd>
      </div>
      <div>
        <dt><span class="key-none"></span></dt>
        <dd><strong>No bar</strong> does not mean dead. Most of these plants are alive year round and simply have nothing to show. ${
          missing
            ? `${missing} plants have no bar at all, and those are the ones still waiting on an identification.`
            : ""
        }</dd>
      </div>
    </dl>

    <p class="provenance">These are typical Seattle seasons for each plant, not measurements from your garden. Yours will run a week or two either side, and a warm wall or a shady corner shifts things further. When you notice something starting or finishing at a different time than the bar says, tell me and I will set that row to what actually happens here rather than what the books say.</p>

${groups}
  </section>`;
}

/* Flower-form marks.
 *
 * These are schematics, not photographs: the form of the flower and its real
 * colour, which between them are what you actually match against when you are
 * standing in front of a plant. Drawn once as symbols and referenced per card,
 * so forty-one marks cost one copy of each shape. Each plant supplies its own
 * petal and centre colours through custom properties. */
const FORMS = {
  daisy: `<g><circle cx="20" cy="20" r="16" fill="none"/>${Array.from(
    { length: 10 },
    (_, i) =>
      `<ellipse cx="20" cy="8.5" rx="3.1" ry="8" class="petal" transform="rotate(${i * 36} 20 20)"/>`
  ).join("")}<circle cx="20" cy="20" r="5.4" class="centre"/></g>`,

  pompon: `<g><circle cx="20" cy="20" r="15" class="petal"/><circle cx="20" cy="20" r="10.5" class="centre" opacity="0.55"/><circle cx="20" cy="20" r="6" class="petal"/><circle cx="20" cy="20" r="2.4" class="centre"/></g>`,

  cup: `<g><path d="M20 37c-7 0-11-5-11-12 0-6 2-12 4-18 1 5 3 8 7 8s6-3 7-8c2 6 4 12 4 18 0 7-4 12-11 12z" class="petal"/><path d="M20 15c-2 0-3-3-3-8 2 4 4 4 6 0 0 5-1 8-3 8z" class="centre"/></g>`,

  trumpet: `<g>${Array.from(
    { length: 6 },
    (_, i) =>
      `<ellipse cx="20" cy="10" rx="4.4" ry="8.4" class="petal" transform="rotate(${i * 60} 20 20)"/>`
  ).join("")}<circle cx="20" cy="20" r="7" class="centre"/><circle cx="20" cy="20" r="4" class="petal" opacity="0.5"/></g>`,

  spike: `<g><line x1="20" y1="37" x2="20" y2="7" class="stem"/>${[
    [13, 10], [27, 13], [13, 17], [27, 20], [13, 24], [27, 27],
  ]
    .map(([x, y]) => `<ellipse cx="${x}" cy="${y}" rx="6" ry="3.6" class="petal"/>`)
    .join("")}<ellipse cx="20" cy="6" rx="4.4" ry="3.2" class="centre"/></g>`,

  cluster: `<g>${[
    [20, 12, 6.5], [12, 19, 6], [28, 19, 6], [16, 27, 5.6], [25, 27, 5.6],
  ]
    .map(([x, y, r]) => `<circle cx="${x}" cy="${y}" r="${r}" class="petal"/>`)
    .join("")}${[
    [20, 12], [12, 19], [28, 19], [16, 27], [25, 27],
  ]
    .map(([x, y]) => `<circle cx="${x}" cy="${y}" r="1.8" class="centre"/>`)
    .join("")}</g>`,

  pincushion: `<g><circle cx="20" cy="20" r="13.5" class="petal"/>${Array.from(
    { length: 12 },
    (_, i) => `<circle cx="20" cy="11.5" r="1.7" class="centre" transform="rotate(${i * 30} 20 20)"/>`
  ).join("")}<circle cx="20" cy="20" r="5.4" class="centre"/></g>`,

  iris: `<g>${[0, 120, 240]
    .map(
      (a) => `<ellipse cx="20" cy="29" rx="5" ry="9" class="petal" transform="rotate(${a} 20 20)"/>`
    )
    .join("")}${[60, 180, 300]
    .map(
      (a) => `<ellipse cx="20" cy="12" rx="4" ry="7.4" class="petal" opacity="0.6" transform="rotate(${a} 20 20)"/>`
    )
    .join("")}<circle cx="20" cy="20" r="3.4" class="centre"/></g>`,

  face: `<g>${Array.from(
    { length: 5 },
    (_, i) => `<ellipse cx="20" cy="11" rx="6.4" ry="8" class="petal" transform="rotate(${i * 72} 20 20)"/>`
  ).join("")}<circle cx="20" cy="20" r="4" class="centre"/></g>`,

  pea: `<g><path d="M8 20c0-7 5-12 12-12s12 5 12 12c0 3-2 5-5 5H13c-3 0-5-2-5-5z" class="petal"/><path d="M13 25h14c0 5-3 8-7 8s-7-3-7-8z" class="centre"/></g>`,

  berry: `<g><path d="M20 36c-7 0-11-6-11-12 0-4 4-8 11-8s11 4 11 8c0 6-4 12-11 12z" class="petal"/><path d="M20 16c-4 0-7-2-9-5 3 1 5 0 6-2 1 2 2 3 3 3s2-1 3-3c1 2 3 3 6 2-2 3-5 5-9 5z" class="centre"/></g>`,

  needle: `<g><line x1="20" y1="37" x2="20" y2="5" class="stem"/>${Array.from(
    { length: 7 },
    (_, i) =>
      `<line x1="20" y1="${9 + i * 4}" x2="${i % 2 ? 30 : 10}" y2="${6 + i * 4}" class="stem"/>`
  ).join("")}<circle cx="20" cy="8" r="3.4" class="petal"/><circle cx="27" cy="15" r="2.8" class="petal"/></g>`,

  leaf: `<path d="M20 36C10 30 7 20 9 8c12 1 20 8 22 18 1 6-4 10-11 10z" class="petal"/><path d="M20 36C17 26 14 16 9 8" class="vein"/>`,

  mat: `<g><path d="M4 30c6-4 10 2 16-2s10 2 16-2" class="stem"/><path d="M4 20c6-4 10 2 16-2s10 2 16-2" class="stem"/>${[
    [10, 26], [22, 24], [32, 21], [15, 15], [28, 13],
  ]
    .map(([x, y]) => `<circle cx="${x}" cy="${y}" r="3.4" class="petal"/>`)
    .join("")}</g>`,

  mixed: `<g><circle cx="12" cy="14" r="6" class="petal"/><circle cx="12" cy="14" r="2.2" class="centre"/><ellipse cx="28" cy="13" rx="4" ry="7" class="centre" opacity="0.7"/><circle cx="26" cy="28" r="5.4" class="petal" opacity="0.7"/><circle cx="13" cy="29" r="3.6" class="centre"/></g>`,

  unknown: `<g><circle cx="20" cy="20" r="14" class="dashed"/><text x="20" y="26" text-anchor="middle" class="qmark">?</text></g>`,
};

/* Inlined per card rather than referenced from one <symbol> sprite. CSS class
   selectors do not cross into the shadow content that <use> creates, so the
   petal and centre colours never landed and every mark rendered solid black.
   Forty-one small inline shapes cost a few kilobytes and always style. */
function plantMark(plant) {
  const art = plant.art;
  const body = FORMS[art?.form];
  if (!body) return "";
  return `<svg class="mark" viewBox="0 0 40 40" aria-hidden="true" focusable="false" style="--petal:${esc(
    art.petal
  )};--centre:${esc(art.centre)}">${body}</svg>`;
}

const CARE_FIELDS = [
  ["feed", "Soil and feeding"],
  ["deadhead", "Deadheading"],
  ["good", "Doing well"],
  ["poor", "Not doing well"],
  ["endOfSeason", "End of season"],
  ["propagate", "More of it"],
];

/* One card per plant, answering the same five questions in the same order
   every time. Built on <details> so it collapses without any script and the
   list stays scannable at forty-one plants. */
function plantCard(plant) {
  const care = plant.care ?? {};
  const uncertain = plant.confidence !== "confirmed";

  const rows = CARE_FIELDS.filter(([k]) => care[k])
    .map(
      ([k, label]) => `            <div class="care-row" data-field="${esc(k)}">
              <dt>${esc(label)}</dt>
              <dd>${esc(care[k])}</dd>
            </div>`
    )
    .join("\n");

  const w = plant.window;

  return `        <details class="plant-card">
          <summary>
            ${plantMark(plant)}
            <span class="pc-name">${esc(plant.name)}${
              uncertain
                ? ` <span class="conf conf-${esc(plant.confidence)}">${plant.confidence === "likely" ? "likely" : "unknown"}</span>`
                : ""
            }</span>
            <span class="pc-meta">
              <span class="pc-type">${esc(plant.type)}</span>
              ${w ? `<span class="pc-window">${esc(w.kind)} ${MONTHS[w.from - 1]}&ndash;${MONTHS[w.to - 1]}</span>` : ""}
              <span class="status ${esc(plant.status)}">${esc(plant.statusLabel)}</span>
            </span>
          </summary>
          <div class="care">
            ${plant.variety ? `<p class="pc-variety">${esc(plant.variety)}</p>` : ""}
            <dl class="care-list">
${rows}
            </dl>
            ${plant.idNote ? `<p class="pc-idnote"><span>To confirm</span> ${esc(plant.idNote)}</p>` : ""}
          </div>
        </details>`;
}

function renderPlants(plants, garden) {
  const confirmed = plants.filter((p) => p.confidence === "confirmed").length;

  const groups = garden.beds
    .map((bed) => {
      const inBed = plants.filter((p) => (p.beds ?? []).includes(bed.id));
      if (!inBed.length) return "";

      const shared = inBed.filter((p) => (p.beds ?? []).length > 1).length;
      const count = `${inBed.length} plant${inBed.length === 1 ? "" : "s"}${
        shared ? `, ${shared} shared with other areas` : ""
      }`;

      return `    <div class="bed-group">
      <div class="bed-group-head">
        <h3>${esc(bed.name)}</h3>
        <span class="window">${count}</span>
      </div>
      <div class="plant-cards">
${inBed.map(plantCard).join("\n")}
      </div>
    </div>`;
    })
    .filter(Boolean)
    .join("\n\n");

  return `  <section id="plants">
    <div class="section-head">
      <h2>Plant by plant</h2>
      <span class="window">${confirmed} of ${plants.length} confirmed</span>
    </div>
    <p class="section-note">Each mark is a schematic of the flower form and its real colour, not a photograph: enough to match a plant by shape and shade when you are standing in front of it. Open any plant for the same six answers: what to feed it and when, how to deadhead it, what it looks like doing well, what it looks like struggling, what to do when it is finished for the year, and how to get more of it. A plant growing in more than one area is listed under each.</p>

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

${renderMap(garden, plants, plan)}

${plan.map((phase) => renderPhase(phase, bedsById)).join("\n\n")}

${renderCalendar(garden, plants, new Date(garden.updated))}

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
