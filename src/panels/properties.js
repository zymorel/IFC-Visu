/**
 * properties.js — Panneau de propriétés IFC (web-ifc direct)
 */

import { getIfcApi, getCurrentModelId } from "../viewer/viewer.js";
import * as WebIFC from "web-ifc";

const panel = document.getElementById("properties-panel");
const panelTitle = document.getElementById("panel-title");
const elementInfo = document.getElementById("element-info");
const btnClose = document.getElementById("btn-close-panel");

btnClose.addEventListener("click", hidePanel);

export function showProperties(expressID) {
  panel.classList.remove("hidden");
  elementInfo.innerHTML = "<p style='color:var(--text-muted)'>Chargement...</p>";

  try {
    const api = getIfcApi();
    const modelId = getCurrentModelId();
    if (!api || modelId === null) throw new Error("Modèle non chargé");

    const line = api.GetLine(modelId, expressID);
    if (!line) throw new Error("Élément introuvable");

    const props = extractProperties(api, modelId, expressID);
    renderProperties(line, props);
  } catch (e) {
    elementInfo.innerHTML = "<p style='color:var(--text-muted)'>Propriétés non disponibles</p>";
    console.warn("Erreur propriétés:", e);
  }
}

function extractProperties(api, modelId, expressID) {
  const psets = [];
  try {
    const rels = api.GetLineIDsWithType(modelId, WebIFC.IFCRELDEFINESBYPROPERTIES);
    for (let i = 0; i < rels.size(); i++) {
      const relLine = api.GetLine(modelId, rels.get(i));
      if (!relLine || !relLine.RelatedObjects) continue;

      const related = relLine.RelatedObjects;
      let found = false;
      for (let j = 0; j < related.length; j++) {
        const ref = related[j];
        const id = ref?.value ?? ref;
        if (id === expressID) { found = true; break; }
      }
      if (!found) continue;

      const psetRef = relLine.RelatingPropertyDefinition;
      const psetId = psetRef?.value ?? psetRef;
      if (!psetId) continue;

      try {
        const pset = api.GetLine(modelId, psetId);
        if (pset && pset.HasProperties) {
          const group = { name: getVal(pset.Name) || "PropertySet", props: {} };
          for (let k = 0; k < pset.HasProperties.length; k++) {
            const propRef = pset.HasProperties[k];
            const propId = propRef?.value ?? propRef;
            try {
              const prop = api.GetLine(modelId, propId);
              if (prop) {
                const key = getVal(prop.Name) || `Prop_${k}`;
                const val = getVal(prop.NominalValue) ?? getVal(prop.Value) ?? "";
                group.props[key] = String(val);
              }
            } catch { /* skip */ }
          }
          if (Object.keys(group.props).length > 0) psets.push(group);
        }
      } catch { /* skip */ }
    }
  } catch (e) {
    console.warn("Erreur extraction psets:", e);
  }
  return psets;
}

function getVal(v) {
  if (v === null || v === undefined) return null;
  if (typeof v === "string" || typeof v === "number" || typeof v === "boolean") return v;
  if (typeof v === "object" && "value" in v) return v.value;
  return null;
}

function renderProperties(line, psets) {
  const name = getVal(line.Name) || getVal(line.LongName) || `#${line.expressID}`;
  const typeName = line.constructor?.name || "IFC Element";

  let html = `<div class="prop-group"><div class="prop-group-title">Identité</div>`;
  html += propRow("Type", typeName);
  html += propRow("ExpressID", line.expressID);
  if (getVal(line.GlobalId)) html += propRow("GlobalId", getVal(line.GlobalId));
  if (getVal(line.Name)) html += propRow("Name", getVal(line.Name));
  if (getVal(line.LongName)) html += propRow("LongName", getVal(line.LongName));
  if (getVal(line.Description)) html += propRow("Description", getVal(line.Description));
  if (getVal(line.ObjectType)) html += propRow("ObjectType", getVal(line.ObjectType));
  if (getVal(line.Tag)) html += propRow("Tag", getVal(line.Tag));
  html += "</div>";

  for (const group of psets) {
    html += `<div class="prop-group"><div class="prop-group-title">${escapeHTML(group.name)}</div>`;
    for (const [key, val] of Object.entries(group.props)) {
      html += propRow(key, val);
    }
    html += "</div>";
  }

  elementInfo.innerHTML = html;
  panelTitle.textContent = String(name);
}

function escapeHTML(input) {
  return String(input)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function propRow(key, value) {
  return `<div class="prop-row"><span class="prop-key">${escapeHTML(key)}</span><span class="prop-val">${escapeHTML(String(value))}</span></div>`;
}

export function hidePanel() {
  panel.classList.add("hidden");
  elementInfo.innerHTML = "";
  panelTitle.textContent = "Propriétés";
}
