/**
 * main.js — Point d'entrée IFC Visu v2
 */

import {
  initViewer,
  loadIFC,
  fitToModel,
  toggleWireframe,
  getCurrentModel,
} from "./viewer/viewer.js";
import { exportCSV, exportJSON } from "./export/powerbi.js";
import { initSelection, deselectAll, getSelectedExpressID, isolateSelected, hideSelected, showAll, setSelectionEnabled } from "./tools/selection.js";
import { initClipping, toggleClipping, setClipAxis, flipClipDirection, setClipSlider } from "./tools/clipping.js";
import { initMeasurement, toggleMeasureTool, isMeasureActive, clearMeasurements } from "./tools/measurement.js";
import { toggleTransparency, isTransparencyActive } from "./tools/transparency.js";
import { showProperties, hidePanel } from "./panels/properties.js";
import { buildTree, clearTree, highlightTreeByExpressID } from "./panels/tree.js";
import { parseIDS, validateIDS, applyValidationColors, clearValidationColors, isValidationActive } from "./tools/ids-validator.js";
import { showIDSResults, hideIDSPanel } from "./panels/ids-results.js";
import { showDashboard, hideDashboard, initDashboardEvents } from "./panels/ids-dashboard.js";
import { initPanelResize } from "./tools/panel-resize.js";

/* ---- DOM refs ---- */
const canvas = document.getElementById("three-canvas");
const viewerContainer = document.getElementById("viewer-container");
const ifcInput = document.getElementById("ifc-input");
const dropZone = document.getElementById("drop-zone");
const dropMessage = document.getElementById("drop-message");
const loadingOverlay = document.getElementById("loading-overlay");
const loadingText = document.getElementById("loading-text");
const statusText = document.getElementById("status-text");
const statusCount = document.getElementById("status-count");

const btnFit = document.getElementById("btn-fit");
const btnSelect = document.getElementById("btn-select");
const btnMeasure = document.getElementById("btn-measure");
const btnClip = document.getElementById("btn-clip");
const btnWireframe = document.getElementById("btn-wireframe");
const btnXray = document.getElementById("btn-xray");
const btnIsolate = document.getElementById("btn-isolate");
const btnHide = document.getElementById("btn-hide");
const btnShowAll = document.getElementById("btn-show-all");
const btnExportCsv = document.getElementById("btn-export-csv");
const btnExportJson = document.getElementById("btn-export-json");

const idsInput = document.getElementById("ids-input");
const btnClearIds = document.getElementById("btn-clear-ids");
const btnIdsDashboard = document.getElementById("btn-ids-dashboard");

const clipControls = document.getElementById("clip-controls");
const clipSlider = document.getElementById("clip-slider");
const btnClipFlip = document.getElementById("btn-clip-flip");
const clipAxisBtns = document.querySelectorAll(".clip-axis-btn");
const appMain = document.getElementById("app");

let wireframeMode = false;
let selectionMode = true;
let dragDepth = 0;
let lastValidationResults = null;
let lastElementStatus = null;

/* ---- Init ---- */
(async () => {
  try {
    await initViewer(canvas);
    initSelection(canvas);
    initMeasurement(canvas);
    initClipping();
    initDashboardEvents();
    initPanelResize();
    setStatus("Prêt — Chargez un fichier IFC pour commencer");
  } catch (e) {
    setStatus(`Erreur d'initialisation : ${e.message}`);
    console.error(e);
  }
})();

/* ---- File loading ---- */
ifcInput.addEventListener("change", (e) => {
  const file = e.target.files?.[0];
  if (file) handleFile(file);
  ifcInput.value = "";
});

window.addEventListener("dragover", (e) => e.preventDefault());
window.addEventListener("drop", (e) => e.preventDefault());

viewerContainer.addEventListener("dragenter", (e) => {
  e.preventDefault();
  dragDepth += 1;
  dropZone.classList.add("drag-over");
});

viewerContainer.addEventListener("dragover", (e) => {
  e.preventDefault();
  dropZone.classList.add("drag-over");
});

viewerContainer.addEventListener("dragleave", (e) => {
  e.preventDefault();
  dragDepth = Math.max(0, dragDepth - 1);
  if (dragDepth === 0) dropZone.classList.remove("drag-over");
});

viewerContainer.addEventListener("drop", (e) => {
  e.preventDefault();
  dragDepth = 0;
  dropZone.classList.remove("drag-over");
  const file = e.dataTransfer.files?.[0];
  if (file?.name.toLowerCase().endsWith(".ifc")) {
    handleFile(file);
  } else {
    setStatus("Format invalide — seuls les fichiers .ifc sont acceptés");
  }
});

async function handleFile(file) {
  showLoading(`Chargement de ${file.name}...`);
  dropMessage.style.display = "none";
  wireframeMode = false;
  btnWireframe.classList.remove("active");
  clearMeasurements();
  clearTree();
  hidePanel();

  try {
    await loadIFC(file, (group) => {
      statusCount.textContent = `${group.children.length} meshes`;
    });
    fitToModel();
    buildTree();
    setStatus(`${file.name} chargé`);
    hideLoading();
  } catch (e) {
    hideLoading();
    dropMessage.style.display = "";
    setStatus(`Erreur : ${e.message}`);
    console.error(e);
  }
}

/* ---- Tool buttons ---- */
btnFit.addEventListener("click", () => {
  fitToModel();
  setStatus("Vue ajustée");
});

btnSelect.addEventListener("click", () => {
  selectionMode = !selectionMode;
  setSelectionEnabled(selectionMode);
  btnSelect.classList.toggle("active", selectionMode);
  setStatus(selectionMode ? "Sélection activée" : "Sélection désactivée");
});
// Start with selection active
btnSelect.classList.add("active");

btnMeasure.addEventListener("click", () => {
  const on = toggleMeasureTool();
  btnMeasure.classList.toggle("active", on);
  if (on) {
    setSelectionEnabled(false);
    selectionMode = false;
    btnSelect.classList.remove("active");
  } else {
    setSelectionEnabled(true);
    selectionMode = true;
    btnSelect.classList.add("active");
  }
  setStatus(on ? "Mesure — cliquez 2 points" : "Mesure désactivée");
});

btnClip.addEventListener("click", () => {
  const on = toggleClipping();
  btnClip.classList.toggle("active", on);
  clipControls.classList.toggle("hidden", !on);
  appMain.classList.toggle("clip-open", on);
  setStatus(on ? "Plan de coupe activé" : "Plan de coupe désactivé");
});

clipSlider.addEventListener("input", () => {
  setClipSlider(parseFloat(clipSlider.value));
});

btnClipFlip.addEventListener("click", () => {
  flipClipDirection();
});

clipAxisBtns.forEach((btn) => {
  btn.addEventListener("click", () => {
    clipAxisBtns.forEach((b) => b.classList.remove("active"));
    btn.classList.add("active");
    setClipAxis(btn.dataset.axis);
  });
});

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
  if (!getSelectedExpressID()) {
    setStatus("Sélectionnez un élément d'abord");
    return;
  }
  isolateSelected();
  setStatus("Élément isolé");
});

btnHide.addEventListener("click", () => {
  if (!getSelectedExpressID()) {
    setStatus("Sélectionnez un élément d'abord");
    return;
  }
  hideSelected();
  setStatus("Élément masqué");
});

btnShowAll.addEventListener("click", () => {
  showAll();
  setStatus("Tous les éléments affichés");
});

btnExportCsv.addEventListener("click", async () => {
  if (!getCurrentModel()) { setStatus("Chargez un fichier IFC d'abord"); return; }
  setStatus("Export CSV en cours...");
  await exportCSV();
  setStatus("Export CSV terminé");
});

btnExportJson.addEventListener("click", async () => {
  if (!getCurrentModel()) { setStatus("Chargez un fichier IFC d'abord"); return; }
  setStatus("Export JSON en cours...");
  await exportJSON();
  setStatus("Export JSON terminé");
});

/* ---- IDS Validation ---- */
idsInput.addEventListener("change", async (e) => {
  const file = e.target.files?.[0];
  if (!file) return;
  idsInput.value = "";

  if (!getCurrentModel()) {
    setStatus("Chargez un fichier IFC d'abord");
    return;
  }

  setStatus(`Lecture de ${file.name}...`);

  try {
    const xmlText = await file.text();
    const idsData = parseIDS(xmlText);

    setStatus("Validation IDS en cours...");

    // Small delay so status shows
    await new Promise((r) => setTimeout(r, 50));

    const results = validateIDS(idsData);
    lastValidationResults = results.specResults;
    lastElementStatus = results.elementStatus;
    applyValidationColors(results.elementStatus);
    showIDSResults(idsData.info, results.specResults);

    const total = results.specResults.reduce((s, r) => s + r.applicable, 0);
    const failed = results.specResults.reduce((s, r) => s + r.failed, 0);
    btnClearIds.classList.remove("hidden");
    btnIdsDashboard.classList.remove("hidden");
    setStatus(`Validation IDS : ${total} éléments testés, ${failed} non conformes`);
  } catch (err) {
    setStatus(`Erreur IDS : ${err.message}`);
    console.error("Erreur IDS:", err);
  }
});

btnClearIds.addEventListener("click", () => {
  clearValidationColors();
  hideIDSPanel();
  hideDashboard();
  btnClearIds.classList.add("hidden");
  btnIdsDashboard.classList.add("hidden");
  lastValidationResults = null;
  lastElementStatus = null;
  setStatus("Validation effacée");
});

btnIdsDashboard.addEventListener("click", () => {
  if (lastValidationResults && lastElementStatus) {
    showDashboard(lastValidationResults, lastElementStatus);
  }
});

/* ---- Selection events → properties panel ---- */
window.addEventListener("element-selected", (e) => {
  const { expressID } = e.detail;
  showProperties(expressID);
  highlightTreeByExpressID(expressID);
});

window.addEventListener("element-deselected", () => {
  hidePanel();
  highlightTreeByExpressID(null);
});

/* ---- Keyboard shortcuts ---- */
window.addEventListener("keydown", (e) => {
  if (e.target.tagName === "INPUT" || e.target.tagName === "TEXTAREA") return;

  switch (e.key.toLowerCase()) {
    case "f":
      fitToModel();
      setStatus("Vue ajustée");
      break;
    case "s":
      btnSelect.click();
      break;
    case "m":
      btnMeasure.click();
      break;
    case "c":
      btnClip.click();
      break;
    case "w":
      btnWireframe.click();
      break;
    case "x":
      btnXray.click();
      break;
    case "i":
      btnIsolate.click();
      break;
    case "h":
      btnHide.click();
      break;
    case "a":
      btnShowAll.click();
      break;
    case "escape":
      deselectAll();
      if (isMeasureActive()) {
        toggleMeasureTool();
        btnMeasure.classList.remove("active");
        setSelectionEnabled(true);
        selectionMode = true;
        btnSelect.classList.add("active");
      }
      setStatus("Désélectionné");
      break;
    case "delete":
      clearMeasurements();
      setStatus("Mesures effacées");
      break;
  }
});

/* ---- Helpers ---- */
function showLoading(msg = "Chargement...") {
  loadingText.textContent = msg;
  loadingOverlay.classList.remove("hidden");
}

function hideLoading() {
  loadingOverlay.classList.add("hidden");
}

function setStatus(msg) {
  statusText.textContent = msg;
}
