/**
 * main.js — IFCstudio — orchestration tab-based
 */

import { initViewer, loadIFC, fitToModel, toggleWireframe, getCurrentModel, forceResize } from "./viewer/viewer.js";
import { exportCSV, exportJSON } from "./export/powerbi.js";
import { initSelection, deselectAll, getSelectedExpressID, isolateSelected, hideSelected, showAll, setSelectionEnabled } from "./tools/selection.js";
import { initClipping, toggleClipping, setClipAxis, flipClipDirection, setClipSlider } from "./tools/clipping.js";
import { initMeasurement, toggleMeasureTool, isMeasureActive, clearMeasurements } from "./tools/measurement.js";
import { toggleTransparency } from "./tools/transparency.js";
import { showProperties, hidePanel } from "./panels/properties.js";
import { buildTree, clearTree, highlightTreeByExpressID } from "./panels/tree.js";
import { parseIDS, validateIDS, applyValidationColors, clearValidationColors } from "./tools/ids-validator.js";
import { showIDSResults, hideIDSPanel } from "./panels/ids-results.js";
import { showDashboard, hideDashboard, initDashboardEvents } from "./panels/ids-dashboard.js";
import { initPanelResize } from "./tools/panel-resize.js";
import { renderIDSEditor, exportIDS } from "./panels/ids-editor.js";

/* ══ State ══════════════════════════════════════════════════════════ */
let fileIfc = null;
let fileIds = null;
let idsDataParsed = null;
let lastValidationResults = null;
let lastElementStatus = null;
let viewerInitialized = false;
let wireframeMode = false;
let selectionMode = true;

/* ══ DOM refs ════════════════════════════════════════════════════════ */
const canvas          = document.getElementById("three-canvas");
const viewerContainer = document.getElementById("viewer-container");
const loadingOverlay  = document.getElementById("loading-overlay");
const loadingText     = document.getElementById("loading-text");
const statusText      = document.getElementById("status-text");
const statusCount     = document.getElementById("status-count");

// Upload tab
const zIfc   = document.getElementById("z-ifc");
const zIds   = document.getElementById("z-ids");
const iIfc   = document.getElementById("i-ifc");
const iIds   = document.getElementById("i-ids");
const nIfc   = document.getElementById("n-ifc");
const nIds   = document.getElementById("n-ids");
const btnRun = document.getElementById("btn-run");
const errBox = document.getElementById("err-box");

// Viewer toolbar
const btnFit       = document.getElementById("btn-fit");
const btnSelect    = document.getElementById("btn-select");
const btnMeasure   = document.getElementById("btn-measure");
const btnClip      = document.getElementById("btn-clip");
const btnWireframe = document.getElementById("btn-wireframe");
const btnXray      = document.getElementById("btn-xray");
const btnIsolate   = document.getElementById("btn-isolate");
const btnHide      = document.getElementById("btn-hide");
const btnShowAll   = document.getElementById("btn-show-all");
const btnClearIds  = document.getElementById("btn-clear-ids");
const btnExportCsv = document.getElementById("btn-export-csv");
const btnExportJson= document.getElementById("btn-export-json");

// IDS dans le viewer
const iIdsViewer  = document.getElementById("i-ids-viewer");
const btnIdsLoad  = document.getElementById("btn-ids-load");
const btnIdsRun   = document.getElementById("btn-ids-run");

// Clip
const clipControls  = document.getElementById("clip-controls");
const clipSlider    = document.getElementById("clip-slider");
const btnClipFlip   = document.getElementById("btn-clip-flip");
const clipAxisBtns  = document.querySelectorAll(".clip-axis-btn");

/* ══ Init ════════════════════════════════════════════════════════════ */
(async () => {
  initDashboardEvents();
  initPanelResize();
  setStatus("Prêt — chargez un fichier IFC et/ou IDS");

  // Dashboard close → go back to viewer
  document.getElementById("dash-close")?.addEventListener("click", () => goTab("viewer"));
})();

/* ══ Tab navigation ══════════════════════════════════════════════════ */
document.querySelectorAll(".tbtn[data-tab]").forEach(btn => {
  btn.addEventListener("click", () => {
    if (btn.disabled) return;
    goTab(btn.dataset.tab);
  });
});

async function goTab(id) {
  document.querySelectorAll(".tbtn[data-tab]").forEach(b => b.classList.toggle("active", b.dataset.tab === id));
  document.querySelectorAll(".panel").forEach(p => p.classList.toggle("active", p.id === "tab-" + id));

  if (id === "viewer") {
    await ensureViewerInit();
    // Forcer le recalcul après que le panel soit visible (micro-délai pour le layout CSS)
    requestAnimationFrame(() => forceResize());
  }

  if (id === "dashboard") {
    if (lastValidationResults && lastElementStatus) {
      document.getElementById("dash-no-data").classList.add("hidden");
      showDashboard(lastValidationResults, lastElementStatus);
    } else {
      document.getElementById("dash-no-data").classList.remove("hidden");
    }
  }
}

function enableTab(id, on = true) {
  const btn = document.querySelector(`.tbtn[data-tab="${id}"]`);
  if (btn) btn.disabled = !on;
}

/* ══ Viewer init (lazy) ══════════════════════════════════════════════ */
async function ensureViewerInit() {
  if (viewerInitialized) return;
  try {
    await initViewer(canvas);
    initSelection(canvas);
    initMeasurement(canvas);
    initClipping();
    viewerInitialized = true;
  } catch (e) {
    setStatus("Erreur init viewer : " + e.message);
    console.error(e);
  }
}

/* ══ Upload drop zones ═══════════════════════════════════════════════ */
function setupDrop(zone, input, nameEl, accept, onFile) {
  input.addEventListener("change", () => {
    const f = input.files?.[0];
    if (f) onFile(f);
    input.value = "";
  });
  zone.addEventListener("dragover",  e => { e.preventDefault(); zone.classList.add("drag"); });
  zone.addEventListener("dragleave", ()  => zone.classList.remove("drag"));
  zone.addEventListener("drop", e => {
    e.preventDefault();
    zone.classList.remove("drag");
    const f = e.dataTransfer.files?.[0];
    if (f) onFile(f);
  });
}

setupDrop(zIfc, iIfc, nIfc, ".ifc", file => {
  fileIfc = file;
  nIfc.textContent = file.name;
  zIfc.classList.add("loaded");
  updateRunButton();
});

setupDrop(zIds, iIds, nIds, ".ids,.xml", file => {
  fileIds = file;
  nIds.textContent = file.name;
  zIds.classList.add("loaded");
  updateRunButton();
});

function updateRunButton() {
  hideError();
  if (!fileIfc && !fileIds) {
    btnRun.disabled = true;
    btnRun.textContent = "Sélectionner au moins un fichier";
    return;
  }
  btnRun.disabled = false;
  if (fileIfc && fileIds) {
    btnRun.textContent = "▶ Lancer la validation IFC + IDS";
  } else if (fileIfc) {
    btnRun.textContent = "→ Ouvrir dans le Viewer 3D";
  } else {
    btnRun.textContent = "→ Visualiser l'IDS";
  }
}

/* ══ Run button ══════════════════════════════════════════════════════ */
btnRun.addEventListener("click", async () => {
  hideError();

  if (fileIfc && fileIds) {
    await runValidation();
  } else if (fileIfc) {
    await openViewer();
  } else if (fileIds) {
    await openIDSExplorer();
  }
});

/* ── IFC only → Viewer ──────────────────────────────────────────── */
async function openViewer() {
  enableTab("viewer", true);
  await goTab("viewer");
  await loadModel(fileIfc);
}

/* ── IDS only → IDS Explorer ───────────────────────────────────── */
async function openIDSExplorer() {
  hideResults();
  setStatus("Lecture du fichier IDS…");
  try {
    const xml = await fileIds.text();
    idsDataParsed = parseIDS(xml);

    const wrap = document.getElementById("ids-explorer-wrap");
    const container = document.getElementById("ids-editor-container");
    renderIDSEditor(container, idsDataParsed);
    wrap.style.display = "block";

    document.getElementById("btn-ids-export-standalone").onclick = () => exportIDS(idsDataParsed);
    setStatus(`IDS chargé : ${idsDataParsed.specifications.length} spécification(s)`);
  } catch (e) {
    showError("Erreur lecture IDS : " + e.message);
    console.error(e);
  }
}

/* ── IFC + IDS → Validation ─────────────────────────────────────── */
async function runValidation() {
  btnRun.disabled = true;
  btnRun.textContent = "Validation en cours…";
  hideResults();

  try {
    // 1. Load IFC in viewer
    enableTab("viewer", true);
    await goTab("viewer");
    await loadModel(fileIfc);

    // 2. Parse + validate IDS
    setStatus("Validation IDS…");
    const xml = await fileIds.text();
    idsDataParsed = parseIDS(xml);
    await new Promise(r => setTimeout(r, 30)); // let UI breathe

    const results = validateIDS(idsDataParsed);
    lastValidationResults = results.specResults;
    lastElementStatus = results.elementStatus;

    applyValidationColors(results.elementStatus);
    showIDSResults(idsDataParsed.info, results.specResults);
    btnClearIds.classList.remove("hidden");

    // 3. Show results in upload tab
    await goTab("upload");
    showValidationResults(results.specResults);
    enableTab("dashboard", true);

    const failed = results.specResults.reduce((s, r) => s + r.failed, 0);
    const total  = results.specResults.reduce((s, r) => s + r.applicable, 0);
    setStatus(`Validation terminée — ${total} éléments testés, ${failed} non conformes`);
  } catch (e) {
    showError("Erreur : " + e.message);
    console.error(e);
  } finally {
    btnRun.disabled = false;
    btnRun.textContent = "▶ Relancer la validation";
  }
}

/* ── Load IFC model ─────────────────────────────────────────────── */
async function loadModel(file) {
  showLoading(`Chargement de ${file.name}…`);
  document.getElementById("drop-message").style.display = "none";
  wireframeMode = false;
  btnWireframe.classList.remove("active");
  clearMeasurements();
  clearTree();
  hidePanel();

  try {
    await loadIFC(file, group => {
      statusCount.textContent = `${group.children.length} meshes`;
    });
    fitToModel();
    buildTree();
    setStatus(`${file.name} chargé`);
    hideLoading();
  } catch (e) {
    hideLoading();
    document.getElementById("drop-message").style.display = "";
    throw e;
  }
}

/* ── Viewer drag & drop (reload IFC from viewer tab) ───────────── */
let dragDepth = 0;
viewerContainer.addEventListener("dragenter", e => { e.preventDefault(); dragDepth++; document.getElementById("drop-zone").classList.add("drag-over"); });
viewerContainer.addEventListener("dragover",  e => e.preventDefault());
viewerContainer.addEventListener("dragleave", e => { e.preventDefault(); dragDepth = Math.max(0, dragDepth - 1); if (dragDepth === 0) document.getElementById("drop-zone").classList.remove("drag-over"); });
viewerContainer.addEventListener("drop", async e => {
  e.preventDefault(); dragDepth = 0;
  document.getElementById("drop-zone").classList.remove("drag-over");
  const f = e.dataTransfer.files?.[0];
  if (f?.name.toLowerCase().endsWith(".ifc")) {
    fileIfc = f; nIfc.textContent = f.name;
    zIfc.classList.add("loaded");
    updateRunButton();
    await loadModel(f);
  }
});

/* ══ Viewer toolbar buttons ══════════════════════════════════════════ */
btnFit.addEventListener("click", () => { fitToModel(); setStatus("Vue ajustée"); });

btnSelect.addEventListener("click", () => {
  selectionMode = !selectionMode;
  setSelectionEnabled(selectionMode);
  btnSelect.classList.toggle("active", selectionMode);
  setStatus(selectionMode ? "Sélection activée" : "Sélection désactivée");
});

btnMeasure.addEventListener("click", () => {
  const on = toggleMeasureTool();
  btnMeasure.classList.toggle("active", on);
  if (on) { setSelectionEnabled(false); selectionMode = false; btnSelect.classList.remove("active"); }
  else    { setSelectionEnabled(true);  selectionMode = true;  btnSelect.classList.add("active"); }
  setStatus(on ? "Mesure — cliquez 2 points" : "Mesure désactivée");
});

btnClip.addEventListener("click", () => {
  const on = toggleClipping();
  btnClip.classList.toggle("active", on);
  clipControls.classList.toggle("hidden", !on);
  document.getElementById("app").classList.toggle("clip-open", on);
  setStatus(on ? "Plan de coupe activé" : "Plan de coupe désactivé");
});

clipSlider.addEventListener("input",  () => setClipSlider(parseFloat(clipSlider.value)));
btnClipFlip.addEventListener("click", () => flipClipDirection());
clipAxisBtns.forEach(btn => btn.addEventListener("click", () => {
  clipAxisBtns.forEach(b => b.classList.remove("active"));
  btn.classList.add("active");
  setClipAxis(btn.dataset.axis);
}));

btnWireframe.addEventListener("click", () => {
  wireframeMode = !wireframeMode;
  toggleWireframe(wireframeMode);
  btnWireframe.classList.toggle("active", wireframeMode);
  setStatus(wireframeMode ? "Mode filaire" : "Mode solide");
});

btnXray.addEventListener("click", () => {
  const on = toggleTransparency();
  btnXray.classList.toggle("active", on);
  setStatus(on ? "Mode X-Ray" : "Mode normal");
});

btnIsolate.addEventListener("click", () => {
  if (!getSelectedExpressID()) { setStatus("Sélectionnez un élément d'abord"); return; }
  isolateSelected(); setStatus("Élément isolé");
});

btnHide.addEventListener("click", () => {
  if (!getSelectedExpressID()) { setStatus("Sélectionnez un élément d'abord"); return; }
  hideSelected(); setStatus("Élément masqué");
});

btnShowAll.addEventListener("click", () => { showAll(); setStatus("Tous les éléments affichés"); });

btnClearIds.addEventListener("click", () => {
  clearValidationColors();
  hideIDSPanel();
  hideDashboard();
  btnClearIds.classList.add("hidden");
  enableTab("dashboard", false);
  lastValidationResults = null;
  lastElementStatus = null;
  hideResults();
  setStatus("Validation effacée");
});

btnExportCsv.addEventListener("click",  async () => { if (!getCurrentModel()) { setStatus("Chargez un IFC d'abord"); return; } await exportCSV(); setStatus("Export XLSX terminé"); });
btnExportJson.addEventListener("click", async () => { if (!getCurrentModel()) { setStatus("Chargez un IFC d'abord"); return; } await exportJSON(); setStatus("Export JSON terminé"); });

/* ══ IDS dans le Viewer ══════════════════════════════════════════════ */
iIdsViewer.addEventListener("change", () => {
  const f = iIdsViewer.files?.[0];
  if (!f) return;
  fileIds = f;
  nIds.textContent = f.name;
  zIds.classList.add("loaded");
  btnIdsLoad.textContent = `📋 ${f.name.length > 18 ? f.name.slice(0, 16) + "…" : f.name}`;
  btnIdsLoad.classList.add("loaded");
  btnIdsRun.classList.remove("hidden");
  updateRunButton();
  setStatus(`IDS chargé : ${f.name} — cliquez ▶ Valider pour lancer`);
  iIdsViewer.value = "";
});

btnIdsRun.addEventListener("click", async () => {
  if (!getCurrentModel()) { setStatus("Chargez un IFC d'abord"); return; }
  if (!fileIds) { setStatus("Chargez un fichier IDS d'abord"); return; }
  await runValidationFromViewer();
});

async function runValidationFromViewer() {
  btnIdsRun.disabled = true;
  btnIdsRun.textContent = "…";
  try {
    setStatus("Validation IDS en cours…");
    const xml = await fileIds.text();
    idsDataParsed = parseIDS(xml);
    await new Promise(r => setTimeout(r, 30));

    const results = validateIDS(idsDataParsed);
    lastValidationResults = results.specResults;
    lastElementStatus = results.elementStatus;

    applyValidationColors(results.elementStatus);
    showIDSResults(idsDataParsed.info, results.specResults);
    btnClearIds.classList.remove("hidden");
    enableTab("dashboard", true);

    const failed = results.specResults.reduce((s, r) => s + r.failed, 0);
    const total  = results.specResults.reduce((s, r) => s + r.applicable, 0);
    setStatus(`Validation terminée — ${total} éléments testés, ${failed} non conformes`);
  } catch (e) {
    setStatus("Erreur validation : " + e.message);
    console.error(e);
  } finally {
    btnIdsRun.disabled = false;
    btnIdsRun.textContent = "▶ Valider";
  }
}

/* ══ Upload results navigation ═══════════════════════════════════════ */
document.getElementById("btn-go-viewer")?.addEventListener("click", () => goTab("viewer"));
document.getElementById("btn-go-dash")?.addEventListener("click",   () => goTab("dashboard"));

document.getElementById("btn-dl-json")?.addEventListener("click", () => {
  if (!lastValidationResults) return;
  const blob = new Blob([JSON.stringify({ specifications: lastValidationResults }, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob); const a = document.createElement("a");
  a.href = url; a.download = "ids-results.json"; a.click(); URL.revokeObjectURL(url);
});

document.getElementById("btn-dl-csv")?.addEventListener("click", () => {
  if (!lastValidationResults) return;
  const BOM = "\uFEFF"; let csv = BOM + "Exigence;Statut;Passés;Échoués;Applicables\n";
  for (const s of lastValidationResults)
    csv += `"${s.name}";${s.failed > 0 ? "FAIL" : "PASS"};${s.passed};${s.failed};${s.applicable}\n`;
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob); const a = document.createElement("a");
  a.href = url; a.download = "ids-results.csv"; a.click(); URL.revokeObjectURL(url);
});

/* ══ Selection events ════════════════════════════════════════════════ */
window.addEventListener("element-selected", e => {
  showProperties(e.detail.expressID);
  highlightTreeByExpressID(e.detail.expressID);
});
window.addEventListener("element-deselected", () => {
  hidePanel();
  highlightTreeByExpressID(null);
});

/* ══ Keyboard shortcuts ══════════════════════════════════════════════ */
window.addEventListener("keydown", e => {
  if (e.target.tagName === "INPUT" || e.target.tagName === "TEXTAREA") return;
  const tab = document.querySelector(".panel.active")?.id;
  if (tab !== "tab-viewer") return;

  switch (e.key.toLowerCase()) {
    case "f": fitToModel(); setStatus("Vue ajustée"); break;
    case "s": btnSelect.click(); break;
    case "m": btnMeasure.click(); break;
    case "c": btnClip.click(); break;
    case "w": btnWireframe.click(); break;
    case "x": btnXray.click(); break;
    case "i": btnIsolate.click(); break;
    case "h": btnHide.click(); break;
    case "a": btnShowAll.click(); break;
    case "escape":
      deselectAll();
      if (isMeasureActive()) { toggleMeasureTool(); btnMeasure.classList.remove("active"); setSelectionEnabled(true); selectionMode = true; btnSelect.classList.add("active"); }
      setStatus("Désélectionné"); break;
    case "delete": clearMeasurements(); setStatus("Mesures effacées"); break;
  }
});

/* ══ Validation results in upload tab ════════════════════════════════ */
function showValidationResults(specResults) {
  // Bilan cards
  const tp  = specResults.reduce((s, r) => s + r.passed, 0);
  const tf  = specResults.reduce((s, r) => s + r.failed, 0);
  const tot = tp + tf;
  const pct = tot > 0 ? Math.round(tp / tot * 100) : 0;

  document.getElementById("bilan-row").innerHTML = `
    <div class="bcard c-blu"><div class="v">${tot}</div><div class="l">Éléments testés</div></div>
    <div class="bcard c-acc"><div class="v">${specResults.length}</div><div class="l">Exigences IDS</div></div>
    <div class="bcard c-grn"><div class="v">${tp}</div><div class="l">Conformes</div></div>
    <div class="bcard c-red"><div class="v">${tf}</div><div class="l">Non conformes</div></div>
    <div class="bcard c-pur"><div class="v">${pct}%</div><div class="l">Conformité</div></div>`;

  // Spec blocks
  const list = document.getElementById("specs-list");
  list.innerHTML = "";
  specResults.forEach(sp => list.appendChild(buildSpecBlock(sp)));

  document.getElementById("validation-results").style.display = "block";
  document.getElementById("ids-explorer-wrap").style.display  = "none";
}

function buildSpecBlock(sp) {
  const isPass = sp.failed === 0;
  const pct    = sp.applicable > 0 ? Math.round(sp.passed / sp.applicable * 100) : 100;
  const barCol = isPass ? "#4caf50" : pct > 0 ? `linear-gradient(90deg,#4caf50 ${pct}%,#f44336 ${pct}%)` : "#f44336";

  const el = document.createElement("div");
  el.className = "spec-block";
  el.innerHTML = `
    <div class="spec-hdr" onclick="this.closest('.spec-block').classList.toggle('open')">
      <span class="sbadge ${isPass ? "pass" : "fail"}">${isPass ? "PASS" : "FAIL"}</span>
      <span class="sname">${esc(sp.name)}</span>
      <span class="scnt"><span class="ok">✓${sp.passed}</span> <span class="ko">✗${sp.failed}</span> /${sp.applicable}</span>
      <span class="schev">›</span>
    </div>
    <div class="pbar"><div class="pbar-fill" style="width:${pct}%;background:${barCol}"></div></div>
    <div class="sdetail">
      ${sp.failed > 0 ? `<div class="dsec"><div class="dsec-title ko">✗ Non conformes (${sp.failed})</div>
        <div class="el-list">${sp.results.filter(r=>!r.pass).slice(0,8).map(r=>`<span class="el-item ko">#${r.expressID}</span>`).join("")}${sp.failed > 8 ? `<span class="el-more">+${sp.failed-8}</span>` : ""}</div></div>` : ""}
      ${sp.passed > 0 ? `<div class="dsec"><div class="dsec-title ok">✓ Conformes (${sp.passed})</div>
        <div class="el-list">${sp.results.filter(r=>r.pass).slice(0,8).map(r=>`<span class="el-item ok">#${r.expressID}</span>`).join("")}${sp.passed > 8 ? `<span class="el-more">+${sp.passed-8}</span>` : ""}</div></div>` : ""}
    </div>`;
  return el;
}

/* ══ Helpers ════════════════════════════════════════════════════════ */
function setStatus(msg)  { if (statusText) statusText.textContent = msg; }
function showLoading(msg){ loadingText.textContent = msg; loadingOverlay.classList.remove("hidden"); }
function hideLoading()   { loadingOverlay.classList.add("hidden"); }
function hideResults()   { document.getElementById("validation-results").style.display = "none"; document.getElementById("ids-explorer-wrap").style.display = "none"; }
function showError(msg)  { errBox.textContent = "❌ " + msg; errBox.style.display = "block"; }
function hideError()     { errBox.style.display = "none"; }
function esc(s) { return String(s||"").replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;"); }
