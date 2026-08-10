/**
 * Paper profile form (margins / theme / YAML save / template switch).
 */
import { $, setStatus } from "./dom.js";

let api = {};
export function bindProfileForm(next) {
  api = next;
}

const MARGIN_PRESETS = {
  narrow: { top: "12mm", right: "12mm", bottom: "12mm", left: "12mm" },
  normal: { top: "20mm", right: "18mm", bottom: "20mm", left: "18mm" },
  wide: { top: "28mm", right: "24mm", bottom: "28mm", left: "24mm" },
};

const TEMPLATE_LABELS = {
  "simple-preview": "気軽な閲覧（既定）",
  default: "一般文書",
  "ops-manual": "マニュアル（章ごと改ページ）",
};
export { TEMPLATE_LABELS };

export function currentTheme() {
  const custom = $("themeCustom").value.trim();
  if (custom) return custom;
  return $("themeSelect").value || "default";
}

export function readMargins() {
  return {
    top: $("mTop").value.trim() || "20mm",
    right: $("mRight").value.trim() || "18mm",
    bottom: $("mBottom").value.trim() || "20mm",
    left: $("mLeft").value.trim() || "18mm",
  };
}

export function writeMargins(m) {
  $("mTop").value = m.top || "20mm";
  $("mRight").value = m.right || "18mm";
  $("mBottom").value = m.bottom || "20mm";
  $("mLeft").value = m.left || "18mm";
}

export function marginsMatch(a, b) {
  return (
    a.top === b.top &&
    a.right === b.right &&
    a.bottom === b.bottom &&
    a.left === b.left
  );
}

export function detectMarginPreset(m) {
  for (const [key, preset] of Object.entries(MARGIN_PRESETS)) {
    if (marginsMatch(m, preset)) return key;
  }
  return "custom";
}

export function syncMarginPresetUi() {
  const preset = $("marginPreset").value;
  const custom = preset === "custom";
  $("marginCustomRow").hidden = !custom;
  if (!custom && MARGIN_PRESETS[preset]) {
    writeMargins(MARGIN_PRESETS[preset]);
  }
}

export function readForm() {
  const breakH1 = $("breakH1").checked;
  const scale = Number($("scale").value);
  return {
    version: 1,
    meta: {
      name: $("name").value.trim() || "untitled",
      description: $("description").value.trim() || undefined,
    },
    page: {
      format: $("format").value,
      orientation: $("orientation").value,
      margin: readMargins(),
      printBackground: $("printBg").checked,
      scale: Number.isFinite(scale) ? scale : 1,
    },
    theme: currentTheme(),
    breaks: {
      beforeHeadings: breakH1 ? ["h1"] : [],
      skipFirst: $("skipFirst").checked,
      avoidInside: api.getState()?.profile?.breaks?.avoidInside || ["pre", "table", "blockquote"],
      avoidAfter: api.getState()?.profile?.breaks?.avoidAfter || ["h2", "h3", "h4"],
    },
    markdown: api.getState()?.profile?.markdown || {
      gfm: true,
      highlight: true,
      highlightStyle: "github",
      allowHtml: true,
    },
    bodyClass: api.getState()?.profile?.bodyClass || [],
  };
}

export function fillThemeOptions(themes, current) {
  const sel = $("themeSelect");
  sel.innerHTML = "";
  const list = Array.isArray(themes) && themes.length ? themes : ["default"];
  const themeLabels = { default: "標準", compact: "コンパクト" };
  for (const t of list) {
    const opt = document.createElement("option");
    opt.value = t;
    opt.textContent = themeLabels[t] || t;
    sel.appendChild(opt);
  }
  if (list.includes(current)) {
    sel.value = current;
    $("themeCustom").value = "";
  } else if (current) {
    sel.value = list.includes("default") ? "default" : list[0];
    $("themeCustom").value = current;
    $("advancedPanel").open = true;
  }
}

export function fillForm(profile) {
  $("name").value = profile.meta?.name || "";
  $("description").value = profile.meta?.description || "";
  $("format").value = profile.page?.format || "A4";
  $("orientation").value = profile.page?.orientation || "portrait";
  const margin = {
    top: profile.page?.margin?.top || "20mm",
    right: profile.page?.margin?.right || "18mm",
    bottom: profile.page?.margin?.bottom || "20mm",
    left: profile.page?.margin?.left || "18mm",
  };
  writeMargins(margin);
  const preset = detectMarginPreset(margin);
  $("marginPreset").value = preset;
  $("marginCustomRow").hidden = preset !== "custom";
  $("scale").value = profile.page?.scale ?? 1;
  $("printBg").checked = profile.page?.printBackground !== false;
  fillThemeOptions(api.getState()?.themes || ["default"], profile.theme || "default");
  const heads = profile.breaks?.beforeHeadings || [];
  $("breakH1").checked = heads.includes("h1");
  $("skipFirst").checked = profile.breaks?.skipFirst !== false;
  updateSettingsHints();
}

export function updateSettingsHints() {
  const pageHint = $("pagePanelHint");
  const lookHint = $("lookPanelHint");
  if (pageHint) {
    const format = $("format").value || "A4";
    const orient =
      $("orientation").value === "landscape" ? "横" : "縦";
    const preset = $("marginPreset").value;
    const marginLabel =
      preset === "narrow"
        ? "余白狭"
        : preset === "wide"
          ? "余白広"
          : preset === "custom"
            ? "余白指定"
            : "";
    pageHint.textContent = marginLabel
      ? format + "：" + orient + " · " + marginLabel
      : format + "：" + orient;
  }
  if (lookHint) {
    const theme =
      ($("themeCustom").value || "").trim() ||
      $("themeSelect").value ||
      "default";
    const themeShort = api.basenamePath(theme) || theme;
    lookHint.textContent = $("breakH1").checked
      ? themeShort + " · H1改ページ"
      : themeShort;
  }
}

export function fillTemplateOptions(builtins, currentRef) {
  const sel = $("templateSelect");
  sel.innerHTML = "";
  const list = Array.isArray(builtins) ? builtins : [];
  for (const t of list) {
    const opt = document.createElement("option");
    opt.value = t;
    opt.textContent = TEMPLATE_LABELS[t] || t;
    sel.appendChild(opt);
  }
  if (list.includes(currentRef)) {
    sel.value = currentRef;
  } else if (list.length) {
    const opt = document.createElement("option");
    opt.value = currentRef;
    opt.textContent = (TEMPLATE_LABELS[currentRef] || currentRef) + "（ファイル）";
    sel.appendChild(opt);
    sel.value = currentRef;
  }
}

export async function saveYaml() {
  const savePath = $("savePath").value.trim();
  const res = await fetch("/api/save", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ profile: readForm(), savePath }),
  });
  const data = await res.json();
  if (!res.ok) {
    setStatus(data.error || "Yaml設定の保存に失敗しました", "err");
    return;
  }
  dirtyProfile = false;
  updateHints();
  setStatus("Yaml設定を保存しました: " + data.path, "ok");
}

export async function switchTemplate(name) {
  const res = await fetch("/api/use-template", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ profile: name }),
  });
  const data = await res.json();
  if (!res.ok) {
    setStatus(data.error || "ひな形の切り替えに失敗しました", "err");
    return;
  }
  api.applyStatePayload(data);
  const label = TEMPLATE_LABELS[data.profileRef] || data.profileRef;
  setStatus("ひな形を切り替えました: " + label, "ok");
  await api.refreshPreview();
}
