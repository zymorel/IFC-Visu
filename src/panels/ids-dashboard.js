/**
 * ids-dashboard.js — Dashboard IDS avec jauge, graphiques et tableau
 * Inspiré du design de référence ids_validator.html
 */

import { Chart, ArcElement, BarElement, CategoryScale, LinearScale, Tooltip, Legend, DoughnutController, BarController } from "chart.js";
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

  // Build row data
  tableRows = buildTableData(specResults, elementStatus);

  // Render all sections
  renderGauge(specResults);
  renderCharts(specResults);
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

/* ========== Data Building ========== */

function buildTableData(specResults, elementStatus) {
  const api = getIfcApi();
  const modelId = getCurrentModelId();
  const rows = [];
  const seen = new Map(); // expressID → row (to merge specs)

  for (const spec of specResults) {
    for (const r of spec.results) {
      const eid = r.expressID;
      let line = null;
      try { line = api.GetLine(modelId, eid); } catch { /* skip */ }

      const typeName = line?.constructor?.name || "?";
      const name = getVal(line?.Name) || "";
      const globalId = getVal(line?.GlobalId) || "";

      if (seen.has(eid)) {
        // Append spec info
        const existing = seen.get(eid);
        existing.specs.push({ name: spec.name, pass: r.pass, details: r.details });
        if (!r.pass) existing.status = "fail";
        continue;
      }

      const row = {
        id: eid,
        guid: globalId,
        type: typeName.replace(/^Ifc/, ""),
        typeRaw: typeName,
        name,
        specs: [{ name: spec.name, pass: r.pass, details: r.details }],
        status: r.pass ? "pass" : "fail",
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
    // Arc length = 173 (semi-circle path)
    const offset = 173 - (173 * pct / 100);
    gaugeArc.style.strokeDashoffset = offset;
    gaugeArc.style.stroke = pct >= 80 ? "#4caf50" : pct >= 50 ? "#ff9800" : "#f44336";
  }

  // Summary cards
  const elTotal = document.getElementById("dash-total");
  const elPass = document.getElementById("dash-pass");
  const elFail = document.getElementById("dash-fail");
  const elSpecs = document.getElementById("dash-specs");

  if (elTotal) elTotal.textContent = total;
  if (elPass) elPass.textContent = passed;
  if (elFail) elFail.textContent = total - passed;
  if (elSpecs) elSpecs.textContent = specResults.length;
}

/* ========== Charts ========== */

function renderCharts(specResults) {
  let totalPassed = 0, totalFailed = 0;
  for (const s of specResults) { totalPassed += s.passed; totalFailed += s.failed; }

  // Pie chart
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

  // Bar chart — by IFC type
  const typeStats = new Map();
  for (const row of tableRows) {
    if (!typeStats.has(row.type)) typeStats.set(row.type, { pass: 0, fail: 0 });
    const s = typeStats.get(row.type);
    if (row.status === "pass") s.pass++; else s.fail++;
  }

  const sortedTypes = [...typeStats.entries()].sort((a, b) => (b[1].pass + b[1].fail) - (a[1].pass + a[1].fail));
  const barLabels = sortedTypes.map(([t]) => t);
  const barPass = sortedTypes.map(([, s]) => s.pass);
  const barFail = sortedTypes.map(([, s]) => s.fail);

  if (chartBar) chartBar.destroy();
  const barCanvas = document.getElementById("dash-chart-bar");
  if (barCanvas) {
    chartBar = new Chart(barCanvas.getContext("2d"), {
      type: "bar",
      data: {
        labels: barLabels,
        datasets: [
          { label: "Conformes", data: barPass, backgroundColor: "#4caf50", borderRadius: 2 },
          { label: "Non conformes", data: barFail, backgroundColor: "#f44336", borderRadius: 2 },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        indexAxis: "y",
        scales: {
          x: { stacked: true, ticks: { color: "#8892a4", font: { size: 10 } }, grid: { color: "#2e334020" } },
          y: { stacked: true, ticks: { color: "#e0e4ec", font: { size: 10 } }, grid: { display: false } },
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

/* ========== Filters ========== */

function renderFilters(specResults) {
  // Type filter
  const typeSelect = document.getElementById("dash-filter-type");
  if (typeSelect) {
    const types = new Set(tableRows.map((r) => r.type));
    typeSelect.innerHTML = '<option value="">Tous les types</option>';
    for (const t of [...types].sort()) {
      typeSelect.innerHTML += `<option value="${esc(t)}">${esc(t)}</option>`;
    }
  }

  // Spec filter
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

  if (activeFilter === "pass") rows = rows.filter((r) => r.status === "pass");
  else if (activeFilter === "fail") rows = rows.filter((r) => r.status === "fail");

  const typeVal = document.getElementById("dash-filter-type")?.value;
  if (typeVal) rows = rows.filter((r) => r.type === typeVal);

  const specVal = document.getElementById("dash-filter-spec")?.value;
  if (specVal) rows = rows.filter((r) => r.specs.some((s) => s.name === specVal));

  if (searchQuery) {
    const q = searchQuery.toLowerCase();
    rows = rows.filter((r) =>
      String(r.id).includes(q) ||
      r.type.toLowerCase().includes(q) ||
      r.name.toLowerCase().includes(q) ||
      r.guid.toLowerCase().includes(q)
    );
  }

  // Sort
  rows = [...rows].sort((a, b) => {
    let va = a[sortCol], vb = b[sortCol];
    if (sortCol === "id") { va = Number(va); vb = Number(vb); }
    if (sortCol === "status") { va = va === "pass" ? 0 : 1; vb = vb === "pass" ? 0 : 1; }
    if (typeof va === "string") va = va.toLowerCase();
    if (typeof vb === "string") vb = vb.toLowerCase();
    if (va < vb) return sortAsc ? -1 : 1;
    if (va > vb) return sortAsc ? 1 : -1;
    return 0;
  });

  return rows;
}

function renderTable() {
  const tbody = document.getElementById("dash-tbody");
  if (!tbody) return;

  const filtered = getFilteredRows();
  const passCount = filtered.filter((r) => r.status === "pass").length;
  const failCount = filtered.filter((r) => r.status === "fail").length;

  // Footer
  const foot = document.getElementById("dash-tbl-foot");
  if (foot) foot.textContent = `${filtered.length} éléments affichés`;
  const footOk = document.getElementById("dash-tbl-ok");
  if (footOk) footOk.textContent = `${passCount} conformes`;
  const footKo = document.getElementById("dash-tbl-ko");
  if (footKo) footKo.textContent = `${failCount} non conformes`;

  // Count badge
  const countEl = document.getElementById("dash-tbl-count");
  if (countEl) countEl.textContent = `(${filtered.length})`;

  if (filtered.length === 0) {
    tbody.innerHTML = '<tr><td colspan="6" class="dash-empty">Aucun élément trouvé</td></tr>';
    return;
  }

  let html = "";
  for (const row of filtered) {
    const specNames = row.specs.map((s) => s.name).join(", ");
    html += `<tr data-eid="${row.id}">
      <td class="dash-c-id">#${row.id}</td>
      <td class="dash-c-type">${esc(row.type)}</td>
      <td class="dash-c-name" title="${esc(row.name)}">${esc(row.name)}</td>
      <td class="dash-c-guid" title="${esc(row.guid)}">${esc(row.guid)}</td>
      <td class="dash-c-spec" title="${esc(specNames)}">${esc(specNames)}</td>
      <td><span class="dash-badge dash-badge-${row.status}">${row.status === "pass" ? "CONFORME" : "NON CONFORME"}</span></td>
    </tr>`;
  }
  tbody.innerHTML = html;
}

/* ========== Event Wiring (called once from main.js) ========== */

export function initDashboardEvents() {
  // Close button
  document.getElementById("dash-close")?.addEventListener("click", hideDashboard);

  // Escape key
  window.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && isDashboardOpen()) {
      hideDashboard();
      e.stopPropagation();
    }
  });

  // Filter pills
  document.querySelectorAll(".dash-pill").forEach((pill) => {
    pill.addEventListener("click", () => {
      activeFilter = pill.dataset.f;
      document.querySelectorAll(".dash-pill").forEach((p) => p.classList.toggle("on", p.dataset.f === activeFilter));
      renderTable();
    });
  });

  // Search
  document.getElementById("dash-search")?.addEventListener("input", (e) => {
    searchQuery = e.target.value;
    renderTable();
  });

  // Type/Spec filters
  document.getElementById("dash-filter-type")?.addEventListener("change", () => renderTable());
  document.getElementById("dash-filter-spec")?.addEventListener("change", () => renderTable());

  // Table header sort
  document.querySelectorAll("#dash-thead th[data-col]").forEach((th) => {
    th.addEventListener("click", () => {
      const col = th.dataset.col;
      if (sortCol === col) sortAsc = !sortAsc;
      else { sortCol = col; sortAsc = true; }
      // Update sort indicators
      document.querySelectorAll("#dash-thead th").forEach((t) => t.classList.remove("dash-sorted"));
      th.classList.add("dash-sorted");
      th.querySelector(".dash-si").textContent = sortAsc ? "\u2191" : "\u2193";
      renderTable();
    });
  });

  // Row click → select in 3D
  document.getElementById("dash-tbody")?.addEventListener("click", (e) => {
    const tr = e.target.closest("tr[data-eid]");
    if (!tr) return;
    const eid = parseInt(tr.dataset.eid, 10);
    if (!isNaN(eid)) {
      selectByExpressID(eid);
      window.dispatchEvent(new CustomEvent("element-selected", { detail: { expressID: eid } }));
      hideDashboard();
    }
  });

  // Export CSV
  document.getElementById("dash-export-csv")?.addEventListener("click", () => {
    const rows = getFilteredRows();
    const BOM = "\uFEFF";
    const sep = ";";
    let csv = BOM + ["ID", "Type IFC", "Nom", "GlobalId", "Exigence IDS", "Statut"].join(sep) + "\n";
    for (const r of rows) {
      const specNames = r.specs.map((s) => s.name).join(" | ");
      csv += [r.id, r.typeRaw, `"${r.name}"`, r.guid, `"${specNames}"`, r.status === "pass" ? "CONFORME" : "NON CONFORME"].join(sep) + "\n";
    }
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "ids-validation-results.csv";
    a.click();
    URL.revokeObjectURL(url);
  });
}

/* ========== Utils ========== */

function esc(str) {
  return String(str || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
