/* Site plan selection.
 *
 * Every area on the plan is a button. Selecting one reveals its pre-rendered
 * panel: what is planted there, and its jobs ordered by urgency. The panels
 * ship in the HTML rather than being built here, so the content is present
 * even if this script never runs.
 */
(function () {
  var hits = Array.prototype.slice.call(document.querySelectorAll(".m-hit"));
  if (!hits.length) return;

  var panels = Array.prototype.slice.call(document.querySelectorAll(".panel"));
  var prompt = document.getElementById("panel-prompt");
  var selected = null;

  function select(id) {
    // Tapping the selected area again clears it.
    selected = selected === id ? null : id;

    hits.forEach(function (hit) {
      var on = hit.dataset.bed === selected;
      hit.classList.toggle("is-selected", on);
      hit.setAttribute("aria-pressed", on ? "true" : "false");
    });

    panels.forEach(function (panel) {
      panel.hidden = panel.dataset.panel !== selected;
    });

    if (prompt) prompt.hidden = selected !== null;

    // Bring the panel to the top of the screen. Without this the panel opens
    // below the plan and, on a phone, entirely off screen. Only on select:
    // tapping the same area again clears it, and scrolling then would be
    // chasing something that just disappeared.
    if (selected) {
      var open = null;
      panels.forEach(function (panel) {
        if (panel.dataset.panel === selected) open = panel;
      });
      if (open && open.scrollIntoView) {
        var reduce =
          window.matchMedia &&
          window.matchMedia("(prefers-reduced-motion: reduce)").matches;
        try {
          open.scrollIntoView({ behavior: reduce ? "auto" : "smooth", block: "start" });
        } catch (e) {
          open.scrollIntoView(); // older Safari takes no options
        }
      }
    }
  }

  hits.forEach(function (hit) {
    hit.addEventListener("click", function () {
      select(hit.dataset.bed);
    });

    hit.addEventListener("keydown", function (event) {
      if (event.key === "Enter" || event.key === " " || event.key === "Spacebar") {
        event.preventDefault();
        select(hit.dataset.bed);
      }
    });
  });
})();

/* Field checkboxes.
 *
 * The durable record of what is done lives in content/plan.json ("done": true).
 * These checkboxes are a local convenience for ticking things off at the bed on
 * a phone. They start from whatever plan.json says, then remember any changes in
 * this browser only. "Copy done list" puts the task ids on the clipboard so they
 * can be pasted into Claude Code to update plan.json for real.
 */
(function () {
  var KEY = "seattle-garden:done";
  var boxes = Array.prototype.slice.call(
    document.querySelectorAll('.task input[type="checkbox"]')
  );
  var stored = {};

  try {
    stored = JSON.parse(localStorage.getItem(KEY) || "{}") || {};
  } catch (e) {
    stored = {};
  }

  function rowOf(box) {
    return box.closest(".task");
  }

  function persist() {
    var state = {};
    boxes.forEach(function (box) {
      state[rowOf(box).dataset.id] = box.checked;
    });
    try {
      localStorage.setItem(KEY, JSON.stringify(state));
    } catch (e) {
      /* storage blocked; checkboxes still work for this session */
    }
  }

  boxes.forEach(function (box) {
    var row = rowOf(box);
    var id = row.dataset.id;

    if (Object.prototype.hasOwnProperty.call(stored, id)) {
      box.checked = !!stored[id];
    }
    row.classList.toggle("done", box.checked);

    box.addEventListener("change", function () {
      row.classList.toggle("done", box.checked);
      persist();
    });
  });

  var reset = document.getElementById("reset");
  if (reset) {
    reset.addEventListener("click", function () {
      boxes.forEach(function (box) {
        box.checked = rowOf(box).dataset.sourceDone === "true";
        rowOf(box).classList.toggle("done", box.checked);
      });
      persist();
      flash(reset, "Reset to plan.json");
    });
  }

  var copy = document.getElementById("copy-done");
  if (copy) {
    copy.addEventListener("click", function () {
      var ids = boxes
        .filter(function (box) {
          return box.checked;
        })
        .map(function (box) {
          return rowOf(box).dataset.id;
        });

      var text = ids.length
        ? "Mark these done in content/plan.json: " + ids.join(", ")
        : "Nothing ticked yet.";

      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(text).then(
          function () {
            flash(copy, "Copied");
          },
          function () {
            flash(copy, text);
          }
        );
      } else {
        flash(copy, text);
      }
    });
  }

  function flash(button, message) {
    var original = button.textContent;
    button.textContent = message;
    setTimeout(function () {
      button.textContent = original;
    }, 1800);
  }
})();
