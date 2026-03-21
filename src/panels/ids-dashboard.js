/**
 * ids-dashboard.js — Dashboard IDS avec jauge, graphiques et tableau
 */

import { Chart, ArcElement, BarElement, CategoryScale, LinearScale, Tooltip, Legend, DoughnutController, BarController } from "chart.js";
import * as WebIFC from "web-ifc";
import { getIfcApi, getCurrentModelId } from "../viewer/viewer.js";
import { selectByExpressID } from "../tools/selection.js";

Chart.register(ArcElement, BarElement, CategoryScale, LinearScale, Tooltip, Legend, DoughnutController, BarController);

const overlay = () => document.getElementById("ids-dashboard-overlay");
let chartPie = null;
let chartBar = null;
let tableRows = [];
let sortCol = "id";
let sortAsc = true;
let activeFilter = "all";
let searchQuery = "";

/* ========== Public API ========== */

export function showDashboard(specResults, elementStatus) {
  const el = overlay();
  if (!el) return;
  el.classList.remove("hidden");

  tableRows = buildTableData(specResults, elementStatus);

  renderGauge(specResults);
  renderCharts(specResults);
  renderSpecSummary(specResults);
  renderFilters(specResults);
  renderTable();
}

export function hideDashboard() {
  const el = overlay();
  if (el) el.classList.add("hidden");
  if (chartPie) { chartPie.destroy(); chartPie = null; }
  if (chartBar) { chartBar.destroy(); chartBar = null; }
}

export function isDashboardOpen() {
  const el = overlay();
  return el && !el.classList.contains("hidden");
}

/* ========== Storey cache ========== */

function buildStoreyCache(api, modelId) {
  const storeyMap = new Map(); // expressID → storeyName
  try {
    const rels = api.GetLineIDsWithType(modelId, WebIFC.IFCRELCONTAINEDINSPATIALSTRUCTURE);
    for (let i = 0; i < rels.size(); i++) {
      let rel;
      try { rel = api.GetLine(modelId, rels.get(i)); } catch { continue; }
      if (!rel?.RelatedObjects || !rel.RelatingStructure) continue;

      const strucId = rel.RelatingStructure?.value ?? rel.RelatingStructure;
      let storeyName = "";
      try {
        const struc = api.GetLine(modelId, strucId);
        storeyName = getVal(struc?.Name) || "";
      } catch { continue; }

      for (let j = 0; j < rel.RelatedObjects.length; j++) {
        const ref = rel.RelatedObjects[j];
        const elemId = ref?.value ?? ref;
        storeyMap.set(elemId, storeyName);
      }
    }
  } catch (e) { console.warn("Erreur storey cache:", e); }
  return storeyMap;
}

/* ========== Data Building ========== */

function buildTableData(specResults, elementStatus) {
  const api = getIfcApi();
  const modelId = getCurrentModelId();
  const rows = [];
  const seen = new Map();

  const storeyMap = (api && modelId !== null) ? buildStoreyCache(api, modelId) : new Map();

  for (const spec of specResults) {
    for (const r of spec.results) {
      const eid = r.expressID;
      let line = null;
      try { line = api.GetLine(modelId, eid); } catch { /* skip */ }

      const typeName = line?.constructor?.name || "?";
      const name = getVal(line?.Name) || "";
      const globalId = getVal(line?.GlobalId) || "";
      const storey = storeyMap.get(eid) || "";

      // First failing requirement detail
      const failedReqs = r.details ? r.details.filter(d => !d.pass) : [];
      const failReason = failedReqs.map(d => `${d.name}: ${d.reason}`).join(" | ");

      if (seen.has(eid)) {
        const existing = seen.get(eid);
        existing.specs.push({ name: spec.name, pass: r.pass, details: r.details });
        if (!r.pass) {
          existing.status = "fail";
          if (!existing.failReason && failReason) existing.failReason = failReason;
        }
        continue;
      }

      const row = {
        id: eid,
        guid: globalId,
        type: typeName.replace(/^Ifc/, ""),
        typeRaw: typeName,
        name,
        storey,
        specs: [{ name: spec.name, pass: r.pass, details: r.details }],
        status: r.pass ? "pass" : "fail",
        failReason: r.pass ? "" : failReason,
      };
      rows.push(row);
      seen.set(eid, row);
    }
  }

  return rows;
}

function getVal(v) {
  if (v === null || v === undefined) return null;
  if (typeof v === "string" || typeof v === "number") return v;
  if (typeof v === "object" && "value" in v) return v.value;
  return null;
}

/* ========== Gauge ========== */

function renderGauge(specResults) {
  let total = 0, passed = 0;
  for (const s of specResults) { total += s.applicable; passed += s.passed; }
  const pct = total > 0 ? Math.round((passed / total) * 100) : 0;

  const gaugeArc = document.getElementById("dash-gauge-arc");
  const gaugePct = document.getElementById("dash-gauge-pct");
  const gaugeDetail = document.getElementById("dash-gauge-detail");

  if (gaugePct) gaugePct.textContent = pct + "%";
  if (gaugeDetail) gaugeDetail.textContent = `${passed} / ${total} conformes`;

  if (gaugeArc) {
    const offset = 173 - (173 * pct / 100);
    gaugeArc.style.strokeDashoffset = offset;
    gaugeArc.style.stroke = pct >= 80 ? "#4caf50" : pct >= 50 ? "#ff9800" : "#f44336";
  }

  const elTotal = document.getElementById("dash-total");
  const elPass  = document.getElementById("dash-pass");
  const elFail  = document.getElementById("dash-fail");
  const elSpecs = document.getElementById("dash-specs");

  if (elTotal) elTotal.textContent = total;
  if (elPass)  elPass.textContent  = passed;
  if (elFail)  elFail.textContent  = total - passed;
  if (elSpecs) elSpecs.textContent = specResults.length;
}

/* ========== Charts ========== */

function renderCharts(specResults) {
  let totalPassed = 0, totalFailed = 0;
  for (const s of specResults) { totalPassed += s.passed; totalFailed += s.failed; }

  // Doughnut — conformes vs non conformes
  if (chartPie) chartPie.destroy();
  const pieCanvas = document.getElementById("dash-chart-pie");
  if (pieCanvas) {
    chartPie = new Chart(pieCanvas.getContext("2d"), {
      type: "doughnut",
      data: {
        labels: ["Conformes", "Non conformes"],
        datasets: [{
          data: [totalPassed, totalFailed],
          backgroundColor: ["#4caf50", "#f44336"],
          borderColor: ["#4caf5040", "#f4433640"],
          borderWidth: 2,
        }],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        cutout: "65%",
        plugins: {
          legend: {
            position: "bottom",
            labels: { color: "#8892a4", font: { size: 10, family: "'Segoe UI', sans-serif" }, padding: 12 },
          },
        },
      },
    });
  }

  // Bar chart — par spécification
  const specLabels = specResults.map(s => s.name.length > 28 ? s.name.substring(0, 28) + "…" : s.name);
  const specPass   = specResults.map(s => s.passed);
  const specFail   = specResults.map(s => s.failed);

  if (chartBar) chartBar.destroy();
  const barCanvas = document.getElementById("dash-chart-bar");
  if (barCanvas) {
    chartBar = new Chart(barCanvas.getContext("2d"), {
      type: "bar",
      data: {
        labels: specLabels,
        datasets: [
          { label: "Conformes",     data: specPass, backgroundColor: "#4caf50", borderRadius: 2 },
          { label: "Non conformes", data: specFail, backgroundColor: "#f44336", borderRadius: 2 },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        indexAxis: "y",
        scales: {
          x: { stacked: true, ticks: { color: "#8892a4", font: { size: 10 } }, grid: { color: "#2e334020" } },
          y: { stacked: true, ticks: { color: "#e0e4ec", font: { size: 9 } },  grid: { display: false } },
        },
        plugins: {
          legend: {
            position: "bottom",
            labels: { color: "#8892a4", font: { size: 10 }, padding: 12 },
          },
        },
      },
    });
  }
}

/* ========== Spec Summary ========== */

function renderSpecSummary(specResults) {
  const container = document.getElementById("dash-spec-summary");
  if (!container) return;

  let html = "";
  for (const spec of specResults) {
    const pct      = spec.applicable > 0 ? Math.round(spec.passed / spec.applicable * 100) : 100;
    const isPass   = spec.failed === 0;
    const barColor = isPass ? "#4caf50" : pct >= 50 ? "#ff9800" : "#f44336";
    const cls      = isPass ? "dash-spec-badge-pass" : "dash-spec-badge-fail";

    html += `<div class="dash-spec-row">
      <span class="dash-spec-badge ${cls}">${isPass ? "PASS" : "FAIL"}</span>
      <span class="dash-spec-name" title="${esc(spec.name)}">${esc(spec.name)}</span>
      <div class="dash-spec-bar-wrap">
        <div class="dash-spec-bar-fill" style="width:${pct}%;background:${barColor}"></div>
      </div>
      <span class="dash-spec-pct">${pct}%</span>
      <span class="dash-spec-counts">
        <span class="dash-c-green">✓${spec.passed}</span>
        <span class="dash-c-red"> ✗${spec.failed}</span>
        <span class="dash-spec-total"> /${spec.applicable}</span>
      </span>
    </div>`;
  }
  container.innerHTML = html || '<div class="dash-empty">Aucune spécification</div>';
}

/* ========== Filters ========== */

function renderFilters(specResults) {
  const typeSelect = document.getElementById("dash-filter-type");
  if (typeSelect) {
    const types = new Set(tableRows.map(r => r.type));
    typeSelect.innerHTML = '<option value="">Tous les types</option>';
    for (const t of [...types].sort()) {
      typeSelect.innerHTML += `<option value="${esc(t)}">${esc(t)}</option>`;
    }
  }

  const specSelect = document.getElementById("dash-filter-spec");
  if (specSelect) {
    specSelect.innerHTML = '<option value="">Toutes les exigences</option>';
    for (const s of specResults) {
      specSelect.innerHTML += `<option value="${esc(s.name)}">${esc(s.name)}</option>`;
    }
  }
}

/* ========== Table ========== */

function getFilteredRows() {
  let rows = tableRows;

  if (activeFilter === "pass") rows = rows.filter(r => r.status === "pass");
  else if (activeFilter === "fail") rows = rows.filter(r => r.status === "fail");

  const typeVal = document.getElementById("dash-filter-type")?.value;
  if (typeVal) rows = rows.filter(r => r.type === typeVal);

  const specVal = document.getElementById("dash-filter-spec")?.value;
  if (specVal) rows = rows.filter(r => r.specs.some(s => s.name === specVal));

  if (searchQuery) {
    const q = searchQuery.toLowerCase();
    rows = rows.filter(r =>
      String(r.id).includes(q) ||
      r.type.toLowerCase().includes(q) ||
      r.name.toLowerCase().includes(q) ||
      r.guid.toLowerCase().includes(q) ||
      r.storey.toLowerCase().includes(q)
    );
  }

  rows = [...rows].sort((a, b) => {
    let va = a[sortCol], vb = b[sortCol];
    if (sortCol === "id")     { va = Number(va); vb = Number(vb); }
    if (sortCol === "status") { va = va === "pass" ? 0 : 1; vb = vb === "pass" ? 0 : 1; }
    if (typeof va === "string") va = va.toLowerCase();
    if (typeof vb === "string") vb = vb.toLowerCase();
    if (va < vb) return sortAsc ? -1 : 1;
    if (va > vb) return sortAsc ?  1 : -1;
    return 0;
  });

  return rows;
}

function renderTable() {
  const tbody = document.getElementById("dash-tbody");
  if (!tbody) return;

  const filtered   = getFilteredRows();
  const passCount  = filtered.filter(r => r.status === "pass").length;
  const failCount  = filtered.filter(r => r.status === "fail").length;

  const foot   = document.getElementById("dash-tbl-foot");
  const footOk = document.getElementById("dash-tbl-ok");
  const footKo = document.getElementById("dash-tbl-ko");
  const countEl = document.getElementById("dash-tbl-count");

  if (foot)   foot.textContent   = `${filtered.length} éléments affichés`;
  if (footOk) footOk.textContent = `${passCount} conformes`;
  if (footKo) footKo.textContent = `${failCount} non conformes`;
  if (countEl) countEl.textContent = `(${filtered.length})`;

  if (filtered.length === 0) {
    tbody.innerHTML = '<tr><td colspan="8" class="dash-empty">Aucun élément trouvé</td></tr>';
    return;
  }

  let html = "";
  for (const row of filtered) {
    const specNames  = row.specs.map(s => s.name).join(", ");
    const reasonShort = row.failReason.length > 55
      ? row.failReason.substring(0, 55) + "…"
      : row.failReason;

    html += `<tr data-eid="${row.id}" class="${row.status === "fail" ? "dash-row-fail" : ""}">
      <td class="dash-c-id">#${row.id}</td>
      <td class="dash-c-type">${esc(row.type)}</td>
      <td class="dash-c-name" title="${esc(row.name)}">${esc(row.name)}</td>
      <td class="dash-c-storey" title="${esc(row.storey)}">${esc(row.storey)}</td>
      <td class="dash-c-guid" title="${esc(row.guid)}">${esc(row.guid)}</td>
      <td class="dash-c-spec" title="${esc(specNames)}">${esc(specNames)}</td>
      <td class="dash-c-reason" title="${esc(row.failReason)}">${esc(reasonShort)}</td>
      <td><span class="dash-badge dash-badge-${row.status}">${row.status === "pass" ? "PASS" : "FAIL"}</span></td>
    </tr>`;
  }
  tbody.innerHTML = html;
}

/* ========== Event Wiring ========== */

export function initDashboardEvents() {
  document.getElementById("dash-close")?.addEventListener("click", hideDashboard);

  window.addEventListener("keydown", e => {
    if (e.key === "Escape" && isDashboardOpen()) {
      hideDashboard();
      e.stopPropagation();
    }
  });

  document.querySelectorAll(".dash-pill").forEach(pill => {
    pill.addEventListener("click", () => {
      activeFilter = pill.dataset.f;
      document.querySelectorAll(".dash-pill").forEach(p => p.classList.toggle("on", p.dataset.f === activeFilter));
      renderTable();
    });
  });

  document.getElementById("dash-search")?.addEventListener("input", e => {
    searchQuery = e.target.value;
    renderTable();
  });

  document.getElementById("dash-filter-type")?.addEventListener("change", () => renderTable());
  document.getElementById("dash-filter-spec")?.addEventListener("change", () => renderTable());

  document.querySelectorAll("#dash-thead th[data-col]").forEach(th => {
    th.addEventListener("click", () => {
      const col = th.dataset.col;
      if (sortCol === col) sortAsc = !sortAsc;
      else { sortCol = col; sortAsc = true; }
      document.querySelectorAll("#dash-thead th").forEach(t => t.classList.remove("dash-sorted"));
      th.classList.add("dash-sorted");
      th.querySelector(".dash-si").textContent = sortAsc ? "↑" : "↓";
      renderTable();
    });
  });

  // Row click → select in 3D, do NOT close dashboard
  document.getElementById("dash-tbody")?.addEventListener("click", e => {
    const tr = e.target.closest("tr[data-eid]");
    if (!tr) return;
    const eid = parseInt(tr.dataset.eid, 10);
    if (!isNaN(eid)) {
      selectByExpressID(eid);
      window.dispatchEvent(new CustomEvent("element-selected", { detail: { expressID: eid } }));
    }
  });

  // Export CSV
  document.getElementById("dash-export-csv")?.addEventListener("click", () => {
    const rows = getFilteredRows();
    const BOM = "\uFEFF";
    const sep = ";";
    let csv = BOM + ["ID", "Type IFC", "Nom", "Etage", "GlobalId", "Exigence IDS", "Raison echec", "Statut"].join(sep) + "\n";
    for (const r of rows) {
      const specNames = r.specs.map(s => s.name).join(" | ");
      csv += [
        r.id, r.typeRaw,
        `"${r.name}"`, `"${r.storey}"`, r.guid,
        `"${specNames}"`, `"${r.failReason}"`,
        r.status === "pass" ? "CONFORME" : "NON CONFORME"
      ].join(sep) + "\n";
    }
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement("a");
    a.href = url; a.download = "ids-validation-results.csv"; a.click();
    URL.revokeObjectURL(url);
  });
}

/* ========== Utils ========== */

function esc(str) {
  return String(str || "")
    .replace(/&/g, "&amp;").replace(/</g, "&lt;")
    .replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}
