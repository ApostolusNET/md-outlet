/**
 * Folder browse lists for open / save / new modals.
 */
import { $, setStatus } from "./dom.js";
import { apiFetch, t } from "./i18n.js";

let api = {};
export function bindBrowse(next) {
  api = next;
}

export let browseState = {
  mode: "open", // open | save-md | save-pdf | new-md
  dir: "",
  parent: null,
  home: "",
  selectedPath: "",
  listing: null,
};

export function browseUi() {
  if (browseState.mode === "save-md") {
    return {
      list: $("mdSaveBrowseList"),
      pathDisp: $("mdSaveBrowsePath"),
      up: $("btnMdSaveUp"),
      homeBtn: $("btnMdSaveHome"),
      rootSel: $("mdSaveRootSelect"),
      input: $("mdModalPathInput"),
      ext: "md",
      fileKind: "md",
      emptyMsg: t("browse.emptyMd"),
    };
  }
  if (browseState.mode === "save-pdf") {
    return {
      list: $("pdfSaveBrowseList"),
      pathDisp: $("pdfSaveBrowsePath"),
      up: $("btnPdfSaveUp"),
      homeBtn: $("btnPdfSaveHome"),
      rootSel: $("pdfSaveRootSelect"),
      input: $("pdfModalPathInput"),
      ext: "pdf",
      fileKind: "pdf",
      emptyMsg: t("browse.emptyPdf"),
    };
  }
  if (browseState.mode === "new-md") {
    return {
      list: $("newMdBrowseList"),
      pathDisp: $("newMdBrowsePath"),
      up: $("btnNewMdUp"),
      homeBtn: $("btnNewMdHome"),
      rootSel: $("newMdRootSelect"),
      input: $("newMdPathInput"),
      ext: "md",
      fileKind: "md",
      emptyMsg: t("browse.emptyMd"),
    };
  }
  return {
    list: $("openMdBrowseList"),
    pathDisp: $("openMdBrowsePath"),
    up: $("btnOpenMdUp"),
    homeBtn: $("btnOpenMdHome"),
    rootSel: $("openMdRootSelect"),
    input: $("openMdPathInput"),
    ext: "md,xml,json,yaml,yml,txt,log,csv,tsv",
    fileKind: "doc",
    emptyMsg: t("browse.emptyDocs"),
  };
}

export function pathBasename(p) {
  const s = String(p || "");
  const i = Math.max(s.lastIndexOf("/"), s.lastIndexOf("\\"));
  return i >= 0 ? s.slice(i + 1) : s;
}

export function joinDirName(dir, name) {
  const d = String(dir || "").replace(/[/\\]+$/, "");
  const n = String(name || "").replace(/^[/\\]+/, "");
  if (!d) return n;
  if (!n) return d;
  const sep = d.includes("\\") && !d.startsWith("/") ? "\\" : "/";
  return d + sep + n;
}

export function syncSavePathToBrowseDir() {
  if (browseState.mode === "open") return;
  const ui = browseUi();
  const name = pathBasename(ui.input.value) || pathBasename(ui.input.placeholder) || "";
  if (!name || !browseState.dir) return;
  ui.input.value = joinDirName(browseState.dir, name);
}

export function closeOpenMdModal() {
  $("openMdModal").hidden = true;
}

export function initialBrowseDir() {
  const md = api.getState()?.mdPath || "";
  const ceiling = api.getState()?.browseRoot || "";
  const home = api.getState()?.workspaceRoot || "";
  if (!md) return home;
  const norm = (p) => String(p).replace(/\\/g, "/").toLowerCase();
  const mdN = norm(md);
  if (ceiling && !mdN.startsWith(norm(ceiling))) return home;
  const slash = Math.max(md.lastIndexOf("/"), md.lastIndexOf("\\"));
  return slash > 0 ? md.slice(0, slash) : home;
}

export function renderBrowseList(data) {
  const ui = browseUi();
  const box = ui.list;
  box.textContent = "";
  const addRow = (kind, name, path, onActivate) => {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.setAttribute("role", "option");
    btn.dataset.path = path || "";
    const k = document.createElement("span");
    k.className = "browse-kind";
    k.textContent = kind;
    const n = document.createElement("span");
    n.className = "browse-name";
    n.textContent = name;
    btn.appendChild(k);
    btn.appendChild(n);
    if (path && path === browseState.selectedPath) {
      btn.classList.add("selected");
    }
    btn.addEventListener("click", () => onActivate("click"));
    btn.addEventListener("dblclick", (e) => {
      e.preventDefault();
      onActivate("dblclick");
    });
    box.appendChild(btn);
  };

  if (data.parent) {
    addRow("↑", "..", data.parent, (how) => {
      if (how === "click" || how === "dblclick") loadBrowseDir(data.parent);
    });
  }
  for (const d of data.dirs || []) {
    addRow("dir", d.name + "/", d.path, (how) => {
      if (how === "click" || how === "dblclick") loadBrowseDir(d.path);
    });
  }
  for (const f of data.files || []) {
    const rowKind = /\.xml$/i.test(f.name)
      ? "xml"
      : /\.json$/i.test(f.name)
        ? "json"
        : /\.ya?ml$/i.test(f.name)
          ? "yaml"
          : /\.(csv|tsv)$/i.test(f.name)
            ? "csv"
            : /\.log$/i.test(f.name)
              ? "log"
              : /\.txt$/i.test(f.name)
                ? "txt"
                : /\.pdf$/i.test(f.name)
                  ? "pdf"
                  : ui.fileKind === "doc"
                    ? "md"
                    : ui.fileKind;
    addRow(rowKind, f.name, f.path, (how) => {
      browseState.selectedPath = f.path;
      ui.input.value = f.path;
      renderBrowseList(data);
      if (how === "dblclick") {
        if (browseState.mode === "open") {
          api.runOpenMd(f.path, { nav: "replace" });
        } else if (browseState.mode === "save-md") {
          api.runSaveMd(f.path);
        } else if (browseState.mode === "save-pdf") {
          api.runExportPdf(f.path);
        } else if (browseState.mode === "new-md") {
          api.runNewMd(f.path, false, {
            skipDirtyConfirm: api.getNewMdMode() === "drop-save",
            fromDrop: api.getNewMdMode() === "drop-save",
          });
        }
      }
    });
  }
  if (!box.children.length) {
    const empty = document.createElement("div");
    empty.className = "browse-empty";
    empty.textContent = ui.emptyMsg;
    box.appendChild(empty);
  }
}

export async function loadBrowseDir(dir) {
  const ui = browseUi();
  const q =
    "?ext=" +
    encodeURIComponent(ui.ext) +
    (dir ? "&dir=" + encodeURIComponent(dir) : "");
  const res = await apiFetch("/api/browse-md" + q);
  const data = await res.json();
  if (!res.ok) {
    setStatus(data.error || t("browse.openFail"), "err");
    return;
  }
  browseState.dir = data.dir || "";
  browseState.parent = data.parent || null;
  browseState.home = data.home || api.getState()?.workspaceRoot || "";
  browseState.listing = data;
  ui.pathDisp.textContent = data.display || data.dir || ".";
  ui.up.disabled = !data.parent;
  syncSavePathToBrowseDir();
  renderBrowseList(data);
}

export function fillBrowseRoots(sel) {
  const roots = Array.isArray(api.getState()?.browseRoots) ? api.getState().browseRoots : [];
  sel.textContent = "";
  const ph = document.createElement("option");
  ph.value = "";
  ph.textContent = roots.length ? t("browse.pickPlace") : t("browse.noExtraPlace");
  sel.appendChild(ph);
  for (const r of roots) {
    const opt = document.createElement("option");
    opt.value = r.path;
    opt.textContent = r.label;
    sel.appendChild(opt);
  }
}

export async function startBrowse(mode, opts) {
  const options = opts || {};
  browseState.mode = mode;
  browseState.selectedPath = options.selectedPath || "";
  const ui = browseUi();
  if (options.pathValue != null) ui.input.value = options.pathValue;
  fillBrowseRoots(ui.rootSel);
  const startDir =
    options.startDir ||
    initialBrowseDir() ||
    api.getState()?.workspaceRoot ||
    "";
  await loadBrowseDir(startDir);
}

export async function openOpenMdModal() {
  $("openMdPathInput").value = "";
  $("openMdModal").hidden = false;
  try {
    await startBrowse("open", { selectedPath: "", pathValue: "" });
  } catch (e) {
    setStatus(e instanceof Error ? e.message : String(e), "err");
  }
  $("openMdBrowseList").focus?.();
}
