/** DOM helpers shared by UI modules. */

export const $ = (id) => document.getElementById(id);

let toastTimer = null;

export function setStatus(msg, kind) {
  const el = $("toast");
  el.hidden = false;
  el.textContent = msg || "";
  el.className = "toast visible" + (kind ? " " + kind : "");
  if (toastTimer) clearTimeout(toastTimer);
  const ms = kind === "err" ? 5200 : kind === "ok" ? 3200 : 2800;
  toastTimer = setTimeout(() => {
    el.classList.remove("visible");
    setTimeout(() => {
      if (!el.classList.contains("visible")) {
        el.hidden = true;
        el.textContent = "";
        el.className = "toast";
      }
    }, 220);
  }, ms);
}
