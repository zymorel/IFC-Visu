/**
 * ids-results.js — Panneau de résultats de validation IDS
 */

import { selectByExpressID } from "../tools/selection.js";

const panel = document.getElementById("ids-panel");
const idsTitle = document.getElementById("ids-title");
const idsContent = document.getElementById("ids-content");
const btnCloseIds = document.getElementById("btn-close-ids");

btnCloseIds.addEventListener("click", hideIDSPanel);

export function showIDSResults(idsInfo, specResults) {
  panel.classList.remove("hidden");
  idsTitle.textContent = idsInfo.title || "Résultats IDS";

  let html = "";

  // Summary
  let totalApplicable = 0;
  let totalPassed = 0;
  let totalFailed = 0;
  for (const s of specResults) {
    totalApplicable += s.applicable;
    totalPassed += s.passed;
    totalFailed += s.failed;
  }

  html += `<div class="ids-summary">`;
  html += `<div class="ids-stat ids-stat-total"><span class="ids-stat-num">${totalApplicable}</span><span class="ids-stat-label">Testés</span></div>`;
  html += `<div class="ids-stat ids-stat-pass"><span class="ids-stat-num">${totalPassed}</span><span class="ids-stat-label">Conformes</span></div>`;
  html += `<div class="ids-stat ids-stat-fail"><span class="ids-stat-num">${totalFailed}</span><span class="ids-stat-label">Non conformes</span></div>`;
  html += `</div>`;

  // Each specification
  for (const spec of specResults) {
    const passRate = spec.applicable > 0 ? Math.round((spec.passed / spec.applicable) * 100) : 100;
    const statusClass = spec.failed > 0 ? "ids-spec-fail" : "ids-spec-pass";

    html += `<div class="ids-spec ${statusClass}">`;
    html += `<div class="ids-spec-header">`;
    html += `<span class="ids-spec-arrow has-children">\u25B6</span>`;
    html += `<span class="ids-spec-name">${escapeHTML(spec.name)}</span>`;
    html += `<span class="ids-spec-badge">${passRate}%</span>`;
    html += `</div>`;

    if (spec.description) {
      html += `<div class="ids-spec-desc">${escapeHTML(spec.description)}</div>`;
    }

    html += `<div class="ids-spec-details" style="display:none">`;

    // Failed elements first
    const failed = spec.results.filter((r) => !r.pass);
    const passed = spec.results.filter((r) => r.pass);

    if (failed.length > 0) {
      html += `<div class="ids-group-title ids-fail-title">Non conformes (${failed.length})</div>`;
      for (const r of failed) {
        html += buildResultRow(r, false);
      }
    }

    if (passed.length > 0) {
      html += `<div class="ids-group-title ids-pass-title">Conformes (${passed.length})</div>`;
      for (const r of passed) {
        html += buildResultRow(r, true);
      }
    }

    html += `</div></div>`;
  }

  idsContent.innerHTML = html;

  // Wire up accordion toggles
  idsContent.querySelectorAll(".ids-spec-header").forEach((header) => {
    header.addEventListener("click", () => {
      const spec = header.closest(".ids-spec");
      const details = spec.querySelector(".ids-spec-details");
      const arrow = header.querySelector(".ids-spec-arrow");
      const isOpen = details.style.display !== "none";
      details.style.display = isOpen ? "none" : "";
      arrow.textContent = isOpen ? "\u25B6" : "\u25BC";
    });
  });

  // Wire up element links
  idsContent.querySelectorAll(".ids-elem-link").forEach((link) => {
    link.addEventListener("click", (e) => {
      e.preventDefault();
      const eid = parseInt(link.dataset.expressid, 10);
      if (!isNaN(eid)) {
        selectByExpressID(eid);
        window.dispatchEvent(
          new CustomEvent("element-selected", { detail: { expressID: eid } })
        );
      }
    });
  });
}

function buildResultRow(result, pass) {
  const icon = pass ? "&#x2713;" : "&#x2717;";
  const cls = pass ? "ids-row-pass" : "ids-row-fail";
  let html = `<div class="ids-result-row ${cls}">`;
  html += `<span class="ids-result-icon">${icon}</span>`;
  html += `<a href="#" class="ids-elem-link" data-expressid="${result.expressID}">#${result.expressID}</a>`;

  if (!pass && result.details) {
    const failedReqs = result.details.filter((d) => !d.pass);
    if (failedReqs.length > 0) {
      html += `<span class="ids-result-reason">${escapeHTML(failedReqs.map((d) => d.name + ": " + d.reason).join(" | "))}</span>`;
    }
  }

  html += `</div>`;
  return html;
}

function escapeHTML(input) {
  return String(input)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

export function hideIDSPanel() {
  panel.classList.add("hidden");
}
