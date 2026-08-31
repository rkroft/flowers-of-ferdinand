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
