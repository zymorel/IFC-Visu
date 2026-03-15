/**
 * powerbi.js — Export IFC pour Power BI (XLSX multi-onglets)
 *
 * 5 onglets identiques au classeur de reference :
 *   01_Elements      — 1 ligne par objet IFC (26 colonnes)
 *   02_Proprietes    — 1 ligne par propriete (jointure ExpressID)
 *   03_Materiaux     — 1 ligne par association element-materiau
 *   04_Synthese      — Tableaux croises prets pour PowerBI
 *   05_Guide_PowerBI — Mode d'emploi
 */

import * as XLSX from "xlsx";
import * as WebIFC from "web-ifc";
import { getIfcApi, getCurrentModelId } from "../viewer/viewer.js";

/* ================================================================
   TYPES IFC A EXPORTER
   ================================================================ */

const PRODUCT_TYPES = [
  WebIFC.IFCWALL, WebIFC.IFCWALLSTANDARDCASE, WebIFC.IFCSLAB,
  WebIFC.IFCCOLUMN, WebIFC.IFCBEAM, WebIFC.IFCDOOR, WebIFC.IFCWINDOW,
  WebIFC.IFCSTAIR, WebIFC.IFCSTAIRFLIGHT, WebIFC.IFCROOF, WebIFC.IFCPLATE,
  WebIFC.IFCMEMBER, WebIFC.IFCRAILING, WebIFC.IFCFURNISHINGELEMENT,
  WebIFC.IFCSPACE, WebIFC.IFCOPENINGELEMENT, WebIFC.IFCBUILDINGSTOREY,
  WebIFC.IFCBUILDING, WebIFC.IFCSITE, WebIFC.IFCCOVERING,
  WebIFC.IFCFLOWSEGMENT, WebIFC.IFCFLOWTERMINAL, WebIFC.IFCFOOTING,
  WebIFC.IFCCURTAINWALL, WebIFC.IFCBUILDINGELEMENTPROXY,
  WebIFC.IFCFLOWFITTING, WebIFC.IFCFLOWCONTROLLER,
];

const ELEM_COLUMNS = [
  "ExpressID", "GUID", "Type_IFC", "Nom", "Description", "Type_objet",
  "Niveau", "Materiau", "Classification", "Reference_Revit", "Famille_Revit",
  "Categorie_Revit", "Nb_Psets", "Nb_Proprietes", "A_Nom", "A_Materiau",
  "A_Classification", "A_Quantites", "Completude_%", "Longueur_m", "Aire_m2",
  "Volume_m3", "Hauteur_m", "Largeur_m", "IsExternal", "LoadBearing",
];

const REVIT_CATEGORIES = {
  IFCWALL: "Murs", IFCWALLSTANDARDCASE: "Murs",
  IFCSLAB: "Sols", IFCCOLUMN: "Poteaux porteurs", IFCBEAM: "Ossature",
  IFCDOOR: "Portes", IFCWINDOW: "Fenetres", IFCSTAIR: "Escaliers",
  IFCSTAIRFLIGHT: "Escaliers", IFCROOF: "Toits", IFCPLATE: "Ossature",
  IFCMEMBER: "Ossature", IFCRAILING: "Garde-corps",
  IFCFURNISHINGELEMENT: "Mobilier", IFCSPACE: "Pieces",
  IFCOPENINGELEMENT: "Ouvertures", IFCBUILDINGSTOREY: "Niveaux",
  IFCBUILDING: "Informations sur le projet", IFCSITE: "Site",
  IFCCOVERING: "Plafonds", IFCFLOWSEGMENT: "Segments de flux",
  IFCFLOWTERMINAL: "Appareils sanitaires", IFCFOOTING: "Fondations",
  IFCCURTAINWALL: "Murs-rideaux", IFCBUILDINGELEMENTPROXY: "Solide topographique",
};

/* ================================================================
   CACHES RELATIONNELS
   ================================================================ */

function buildStoreyMap(api, mid) {
  const m = new Map();
  try {
    const rels = api.GetLineIDsWithType(mid, WebIFC.IFCRELCONTAINEDINSPATIALSTRUCTURE);
    for (let i = 0; i < rels.size(); i++) {
      try {
        const rel = api.GetLine(mid, rels.get(i));
        if (!rel) continue;
        const sid = rel.RelatingStructure?.value ?? rel.RelatingStructure;
        let sl; try { sl = api.GetLine(mid, sid); } catch { continue; }
        const sn = v(sl?.Name) || "Non defini";
        if (rel.RelatedElements) for (const r of rel.RelatedElements) m.set(r?.value ?? r, sn);
      } catch { /* skip */ }
    }
  } catch { /* skip */ }
  return m;
}

function buildMaterialMap(api, mid) {
  const m = new Map();
  try {
    const rels = api.GetLineIDsWithType(mid, WebIFC.IFCRELASSOCIATESMATERIAL);
    for (let i = 0; i < rels.size(); i++) {
      try {
        const rel = api.GetLine(mid, rels.get(i));
        if (!rel) continue;
        const matId = rel.RelatingMaterial?.value ?? rel.RelatingMaterial;
        const matName = resolveMat(api, mid, matId);
        if (rel.RelatedObjects) for (const r of rel.RelatedObjects) m.set(r?.value ?? r, matName);
      } catch { /* skip */ }
    }
  } catch { /* skip */ }
  return m;
}

function resolveMat(api, mid, id) {
  if (!id) return "";
  try {
    const mat = api.GetLine(mid, id);
    if (!mat) return `#${id}`;
    if (mat.Name) return v(mat.Name) || "";
    if (mat.ForLayerSet) return resolveMat(api, mid, mat.ForLayerSet?.value ?? mat.ForLayerSet);
    if (mat.MaterialLayers) {
      const ns = [];
      for (const lr of mat.MaterialLayers) {
        try { const l = api.GetLine(mid, lr?.value ?? lr); if (l?.Material) { const mm = api.GetLine(mid, l.Material?.value ?? l.Material); if (mm?.Name) ns.push(v(mm.Name)); } } catch { /**/ }
      }
      return ns.join(", ") || `#${id}`;
    }
    if (mat.Materials) {
      const ns = [];
      for (const mr of mat.Materials) { try { const mm = api.GetLine(mid, mr?.value ?? mr); if (mm?.Name) ns.push(v(mm.Name)); } catch { /**/ } }
      return ns.join(", ") || `#${id}`;
    }
    return `#${id}`;
  } catch { return `#${id}`; }
}

function buildClassMap(api, mid) {
  const m = new Map();
  try {
    const rels = api.GetLineIDsWithType(mid, WebIFC.IFCRELASSOCIATESCLASSIFICATION);
    for (let i = 0; i < rels.size(); i++) {
      try {
        const rel = api.GetLine(mid, rels.get(i));
        if (!rel) continue;
        const cid = rel.RelatingClassification?.value ?? rel.RelatingClassification;
        let cs = "";
        try { const cl = api.GetLine(mid, cid); cs = v(cl?.ItemReference) || v(cl?.Identification) || v(cl?.Name) || ""; } catch { /**/ }
        if (rel.RelatedObjects) for (const r of rel.RelatedObjects) m.set(r?.value ?? r, cs);
      } catch { /* skip */ }
    }
  } catch { /* skip */ }
  return m;
}

/**
 * Returns: Map<expressID, { psets: Map<name,Map<prop,val>>, qsets: Map<name,Map<prop,val>> }>
 * Also returns flatProps: Array<{expressID, type, pset, prop, val}> for sheet 02
 */
function buildPropCache(api, mid) {
  const cache = new Map();
  const flat = []; // for sheet 02

  try {
    const rels = api.GetLineIDsWithType(mid, WebIFC.IFCRELDEFINESBYPROPERTIES);
    for (let i = 0; i < rels.size(); i++) {
      try {
        const rel = api.GetLine(mid, rels.get(i));
        if (!rel?.RelatedObjects) continue;
        const psetId = rel.RelatingPropertyDefinition?.value ?? rel.RelatingPropertyDefinition;
        if (!psetId) continue;
        let pset; try { pset = api.GetLine(mid, psetId); } catch { continue; }
        if (!pset) continue;

        const psetName = v(pset.Name) || "";
        const isQ = pset.Quantities != null;
        const props = new Map();

        if (pset.HasProperties) {
          for (const pr of pset.HasProperties) {
            try {
              const p = api.GetLine(mid, pr?.value ?? pr);
              if (p?.Name) { const pn = v(p.Name); const pv = v(p.NominalValue) ?? v(p.Value) ?? ""; props.set(pn, pv); }
            } catch { /**/ }
          }
        }
        if (pset.Quantities) {
          for (const qr of pset.Quantities) {
            try {
              const q = api.GetLine(mid, qr?.value ?? qr);
              if (q?.Name) {
                const qn = v(q.Name);
                const qv = v(q.LengthValue) ?? v(q.AreaValue) ?? v(q.VolumeValue) ?? v(q.WeightValue) ?? v(q.CountValue) ?? v(q.TimeValue) ?? "";
                props.set(qn, qv);
              }
            } catch { /**/ }
          }
        }

        if (props.size === 0) continue;

        for (const elRef of rel.RelatedObjects) {
          const eid = elRef?.value ?? elRef;
          if (!cache.has(eid)) cache.set(eid, { psets: new Map(), qsets: new Map() });
          const ec = cache.get(eid);
          const target = isQ ? ec.qsets : ec.psets;
          if (!target.has(psetName)) target.set(psetName, new Map());
          const existing = target.get(psetName);
          for (const [k, val] of props) {
            existing.set(k, val);
            // Flat row for sheet 02 (deferred — needs type info)
            flat.push({ eid, pset: psetName, prop: k, val: String(val) });
          }
        }
      } catch { /* skip */ }
    }
  } catch { /* skip */ }

  return { cache, flat };
}

/* ================================================================
   COLLECTE DES DONNEES
   ================================================================ */

function collectAll() {
  const api = getIfcApi();
  const mid = getCurrentModelId();
  if (!api || mid === null) return null;

  setStatus("Preparation des caches...");
  const storeyMap = buildStoreyMap(api, mid);
  const matMap = buildMaterialMap(api, mid);
  const classMap = buildClassMap(api, mid);
  const { cache: propCache, flat: flatProps } = buildPropCache(api, mid);

  // Detect IFC schema
  let ifcSchema = "IFC2X3";
  try {
    const header = api.GetHeaderLine(mid, WebIFC.FILE_SCHEMA);
    if (header) ifcSchema = String(v(header[0]) || header).toUpperCase();
  } catch { /* skip */ }

  const elemRows = [];
  const matRows = [];  // for sheet 03
  const typeMap = new Map(); // expressID → typeName for flat props

  for (const ifcType of PRODUCT_TYPES) {
    let ids; try { ids = api.GetLineIDsWithType(mid, ifcType); } catch { continue; }
    for (let i = 0; i < ids.size(); i++) {
      const eid = ids.get(i);
      try {
        const line = api.GetLine(mid, eid);
        if (!line) continue;
        const typeName = line.constructor?.name || "";
        const typeUpper = typeName.toUpperCase();
        typeMap.set(eid, typeName);

        const name = v(line.Name) || "";
        const desc = v(line.Description) || "";
        const objType = v(line.ObjectType) || "";
        const parts = name.split(":");
        const famille = parts.length >= 2 ? parts[0] : "";
        const refRevit = parts.length >= 2 ? parts[1] : v(line.Tag) || "";

        const niveau = storeyMap.get(eid) || "Non defini";
        const materiau = matMap.get(eid) || "";
        const classif = classMap.get(eid) || "";
        const catRevit = REVIT_CATEGORIES[typeUpper] || "";

        const ec = propCache.get(eid);
        let nbPsets = 0, nbProps = 0, hasQ = false;
        if (ec) {
          nbPsets = ec.psets.size + ec.qsets.size;
          for (const [, p] of ec.psets) nbProps += p.size;
          for (const [, p] of ec.qsets) { nbProps += p.size; hasQ = p.size > 0; }
        }

        const aNom = name.length > 0 ? "Oui" : "Non";
        const aMat = materiau.length > 0 && !materiau.startsWith("#") ? "Oui" : "Non";
        const aCls = classif.length > 0 ? "Oui" : "Non";
        const aQte = hasQ ? "Oui" : "Non";
        const complet = Math.round(([aNom, aMat, aCls, aQte].filter((x) => x === "Oui").length / 4) * 100);

        let longueur = "", aire = "", volume = "", hauteur = "", largeur = "";
        let isExt = "", loadB = "";
        if (ec) {
          for (const [, p] of ec.qsets) for (const [qn, qv] of p) {
            const ql = qn.toLowerCase();
            if (!longueur && (ql.includes("length") || ql.includes("longueur"))) longueur = fmtN(qv);
            else if (!aire && (ql.includes("area") || ql.includes("aire") || ql.includes("surface"))) aire = fmtN(qv);
            else if (!volume && ql.includes("volume")) volume = fmtN(qv);
            else if (!hauteur && (ql.includes("height") || ql.includes("hauteur"))) hauteur = fmtN(qv);
            else if (!largeur && (ql.includes("width") || ql.includes("largeur"))) largeur = fmtN(qv);
          }
          for (const [, p] of ec.psets) {
            if (p.has("IsExternal")) isExt = p.get("IsExternal") ? "Oui" : "";
            if (p.has("LoadBearing")) loadB = p.get("LoadBearing") ? "Oui" : "";
            for (const [pn, pv] of p) {
              const pl = pn.toLowerCase();
              if (!hauteur && (pl === "height" || pl === "hauteur")) hauteur = fmtN(pv);
              if (!largeur && (pl === "width" || pl === "largeur")) largeur = fmtN(pv);
            }
          }
        }

        elemRows.push({
          ExpressID: eid, GUID: v(line.GlobalId) || "", Type_IFC: typeName,
          Nom: name, Description: desc, Type_objet: objType,
          Niveau: niveau, Materiau: materiau, Classification: classif,
          Reference_Revit: refRevit, Famille_Revit: famille, Categorie_Revit: catRevit,
          Nb_Psets: nbPsets, Nb_Proprietes: nbProps,
          A_Nom: aNom, A_Materiau: aMat, A_Classification: aCls, A_Quantites: aQte,
          "Completude_%": complet,
          Longueur_m: longueur, Aire_m2: aire, Volume_m3: volume,
          Hauteur_m: hauteur, Largeur_m: largeur,
          IsExternal: isExt, LoadBearing: loadB,
        });

        // Sheet 03 row
        if (materiau) matRows.push({ ExpressID: eid, Type_IFC: typeName, Materiau: materiau });
      } catch { /* skip */ }
    }
  }

  // Sheet 02 — enrich flat props with type
  const propRows = flatProps
    .filter((fp) => typeMap.has(fp.eid))
    .map((fp) => ({
      ExpressID: fp.eid,
      Type_IFC: typeMap.get(fp.eid) || "",
      Pset: fp.pset,
      Propriete: fp.prop,
      Valeur: fp.val,
    }));

  return { elemRows, propRows, matRows, ifcSchema };
}

/* ================================================================
   EXPORT XLSX (5 onglets)
   ================================================================ */

export async function exportCSV(filename) {
  setStatus("Export XLSX en cours...");
  const data = collectAll();
  if (!data || data.elemRows.length === 0) { setStatus("Aucune donnee a exporter"); return; }

  const baseName = filename?.replace(/\.\w+$/, "") || "ifc-export";
  const xlsxFilename = baseName.replace(/\.xlsx$/i, "") + "_BIM_PowerBI.xlsx";

  const wb = XLSX.utils.book_new();

  // ── 01 Elements ──
  const titleRow = [`\u{1F4E6}  INVENTAIRE IFC  [${data.ifcSchema}]`];
  const ws1Data = [titleRow, ELEM_COLUMNS, ...data.elemRows.map((r) => ELEM_COLUMNS.map((c) => r[c] ?? ""))];
  const ws1 = XLSX.utils.aoa_to_sheet(ws1Data);
  ws1["!merges"] = [{ s: { r: 0, c: 0 }, e: { r: 0, c: ELEM_COLUMNS.length - 1 } }];
  ws1["!cols"] = ELEM_COLUMNS.map((c) => ({ wch: Math.max(c.length + 2, 14) }));
  XLSX.utils.book_append_sheet(wb, ws1, "01_Elements");

  // ── 02 Proprietes ──
  const propCols = ["ExpressID", "Type_IFC", "Pset", "Propriete", "Valeur"];
  const ws2Title = ["\u{1F4CB}  PROPRIETES IFC \u2014 1 ligne = 1 propriete  |  Jointure sur ExpressID"];
  const ws2Data = [ws2Title, propCols, ...data.propRows.map((r) => propCols.map((c) => r[c] ?? ""))];
  const ws2 = XLSX.utils.aoa_to_sheet(ws2Data);
  ws2["!merges"] = [{ s: { r: 0, c: 0 }, e: { r: 0, c: propCols.length - 1 } }];
  ws2["!cols"] = [{ wch: 12 }, { wch: 28 }, { wch: 30 }, { wch: 28 }, { wch: 40 }];
  XLSX.utils.book_append_sheet(wb, ws2, "02_Proprietes");

  // ── 03 Materiaux ──
  const matCols = ["ExpressID", "Type_IFC", "Materiau"];
  const ws3Title = ["\u{1F9F1}  MATERIAUX \u2014 1 ligne = 1 association element <-> materiau"];
  const ws3Data = [ws3Title, matCols, ...data.matRows.map((r) => matCols.map((c) => r[c] ?? ""))];
  const ws3 = XLSX.utils.aoa_to_sheet(ws3Data);
  ws3["!merges"] = [{ s: { r: 0, c: 0 }, e: { r: 0, c: matCols.length - 1 } }];
  ws3["!cols"] = [{ wch: 12 }, { wch: 28 }, { wch: 40 }];
  XLSX.utils.book_append_sheet(wb, ws3, "03_Materiaux");

  // ── 04 Synthese ──
  const ws4 = buildSyntheseSheet(data);
  XLSX.utils.book_append_sheet(wb, ws4, "04_Synthese");

  // ── 05 Guide PowerBI ──
  const ws5 = buildGuideSheet();
  XLSX.utils.book_append_sheet(wb, ws5, "05_Guide_PowerBI");

  // Download
  const wbOut = XLSX.write(wb, { bookType: "xlsx", type: "array" });
  downloadBlob(new Blob([wbOut], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }), xlsxFilename);
  setStatus(`Export XLSX — ${data.elemRows.length} elements, 5 onglets`);
}

function buildSyntheseSheet(data) {
  const rows = data.elemRows;

  // Quantites par type IFC
  const typeStats = new Map();
  for (const r of rows) {
    const t = r.Type_IFC;
    if (!typeStats.has(t)) typeStats.set(t, { nb: 0, vol: 0, aire: 0, long: 0, noMat: 0, noCls: 0 });
    const s = typeStats.get(t);
    s.nb++;
    if (r.Volume_m3) s.vol += parseFloat(r.Volume_m3) || 0;
    if (r.Aire_m2) s.aire += parseFloat(r.Aire_m2) || 0;
    if (r.Longueur_m) s.long += parseFloat(r.Longueur_m) || 0;
    if (!r.Materiau || r.Materiau.startsWith("#")) s.noMat++;
    if (!r.Classification) s.noCls++;
  }

  // Top materiaux
  const matCount = new Map();
  for (const r of rows) {
    if (r.Materiau) {
      matCount.set(r.Materiau, (matCount.get(r.Materiau) || 0) + 1);
    }
  }
  const topMats = [...matCount.entries()].sort((a, b) => b[1] - a[1]).slice(0, 20);

  const aoa = [];
  aoa.push(["\u{1F4CA}  SYNTHESE & ANALYSES \u2014 PRET POUR POWERBI"]);
  aoa.push([]);

  // Left table: Types IFC
  const typeHeader = ["Type IFC", "Nb elements", "Volume m\u00B3", "Aire m\u00B2", "Longueur m", "Sans materiau", "Sans classif.", "", "", "Materiau", "Nb elements", "% Total"];
  aoa.push(["\u{1F4E6} QUANTITES PAR TYPE IFC", "", "", "", "", "", "", "", "", "\u{1F9F1} TOP MATERIAUX"]);
  aoa.push(typeHeader);

  const sortedTypes = [...typeStats.entries()].sort((a, b) => b[1].nb - a[1].nb);
  const maxRows = Math.max(sortedTypes.length, topMats.length);
  for (let i = 0; i < maxRows; i++) {
    const row = new Array(12).fill("");
    if (i < sortedTypes.length) {
      const [t, s] = sortedTypes[i];
      row[0] = t; row[1] = s.nb;
      row[2] = s.vol ? s.vol.toFixed(2) : "";
      row[3] = s.aire ? s.aire.toFixed(2) : "";
      row[4] = s.long ? s.long.toFixed(2) : "";
      row[5] = s.noMat; row[6] = s.noCls;
    }
    if (i < topMats.length) {
      const [m, c] = topMats[i];
      row[9] = m; row[10] = c;
      row[11] = ((c / rows.length) * 100).toFixed(1) + "%";
    }
    aoa.push(row);
  }

  aoa.push([]);
  aoa.push([]);

  // Completude
  aoa.push(["\u{2705} AUDIT COMPLETUDE"]);
  aoa.push(["Critere", "Nb Oui", "Nb Non", "% Oui"]);
  for (const [label, key] of [["A un nom", "A_Nom"], ["A un materiau", "A_Materiau"], ["A une classification", "A_Classification"], ["A des quantites", "A_Quantites"]]) {
    const oui = rows.filter((r) => r[key] === "Oui").length;
    const non = rows.length - oui;
    aoa.push([label, oui, non, rows.length > 0 ? ((oui / rows.length) * 100).toFixed(1) + "%" : "0%"]);
  }

  aoa.push([]);
  aoa.push(["Total elements", rows.length]);

  const ws = XLSX.utils.aoa_to_sheet(aoa);
  ws["!cols"] = [
    { wch: 30 }, { wch: 12 }, { wch: 12 }, { wch: 12 }, { wch: 12 }, { wch: 14 }, { wch: 14 },
    { wch: 3 }, { wch: 3 },
    { wch: 40 }, { wch: 12 }, { wch: 10 },
  ];
  return ws;
}

function buildGuideSheet() {
  const lines = [
    ["\u{1F4D8}  GUIDE D'UTILISATION POWERBI \u2014 IFC BIM Analysis"],
    [],
    ["ETAPE 1 \u2014 IMPORTER CE FICHIER DANS POWERBI DESKTOP"],
    ["  1. Ouvrir PowerBI Desktop  (gratuit : microsoft.com/fr-fr/power-platform/products/power-bi/desktop)"],
    ["  2. Accueil  \u2192  Obtenir des donnees  \u2192  Excel"],
    ["  3. Selectionner ce fichier Excel (.xlsx)"],
    ["  4. Cocher les 4 tables : 01_Elements \u00B7 02_Proprietes \u00B7 03_Materiaux \u00B7 04_Synthese"],
    ["  5. Cliquer  Charger  (ou  Transformer  pour nettoyer)"],
    [],
    ["ETAPE 2 \u2014 CREER LE MODELE EN ETOILE (Star Schema)"],
    ["  Dans PowerBI \u2192 onglet  Vue Modele  :"],
    ["  \u2022 01_Elements = TABLE DE FAITS centrale (1 ligne par objet IFC)"],
    ["  \u2022 Relier  02_Proprietes.ExpressID  \u2192  01_Elements.ExpressID  (relation N:1)"],
    ["  \u2022 Relier  03_Materiaux.ExpressID   \u2192  01_Elements.ExpressID  (relation N:1)"],
    [],
    ["ETAPE 3 \u2014 VISUELS RECOMMANDES"],
    ["  ANALYSE 1 \u2014 Inventaire par type IFC"],
    ["    Histogramme groupe : Axe X = Type_IFC / Valeurs = COUNTROWS"],
    ["  ANALYSE 2 \u2014 Repartition par niveau"],
    ["    Matrice : Lignes = Niveau / Colonnes = Type_IFC / Valeurs = Count"],
    ["  ANALYSE 3 \u2014 Completude des donnees"],
    ["    Jauge : Valeur = AVERAGE(Completude_%)"],
    ["    KPI : A_Nom, A_Materiau, A_Classification, A_Quantites"],
    ["  ANALYSE 4 \u2014 Materiaux"],
    ["    Treemap ou Histogramme sur 03_Materiaux.Materiau"],
    [],
    ["COLONNES CALCULEES UTILES (DAX)"],
    ["  IsComplete = IF([Completude_%] = 100, \"Oui\", \"Non\")"],
    ["  HasMaterial = IF([A_Materiau] = \"Oui\", 1, 0)"],
    [],
    ["Genere par IFC Visu v2 — " + new Date().toLocaleDateString("fr-FR")],
  ];
  const ws = XLSX.utils.aoa_to_sheet(lines);
  ws["!cols"] = [{ wch: 90 }];
  return ws;
}

/* ================================================================
   EXPORT JSON (inchange)
   ================================================================ */

export async function exportJSON(filename = "ifc-export.json") {
  setStatus("Export JSON en cours...");
  const data = collectAll();
  if (!data || data.elemRows.length === 0) { setStatus("Aucune donnee a exporter"); return; }

  const json = JSON.stringify(
    { elements: data.elemRows, properties: data.propRows, materials: data.matRows, count: data.elemRows.length, exportedAt: new Date().toISOString() },
    null, 2
  );
  downloadBlob(new Blob(["\uFEFF" + json], { type: "application/json" }), filename);
  setStatus(`Export JSON — ${data.elemRows.length} elements`);
}

/* ================================================================
   HELPERS
   ================================================================ */

function v(val) {
  if (val === null || val === undefined) return null;
  if (typeof val === "string" || typeof val === "number" || typeof val === "boolean") return val;
  if (typeof val === "object" && "value" in val) return val.value;
  return null;
}

function fmtN(val) {
  if (val === null || val === undefined || val === "") return "";
  const n = typeof val === "number" ? val : parseFloat(val);
  return isNaN(n) ? String(val) : n.toFixed(3);
}

function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

function setStatus(msg) {
  const el = document.getElementById("status-text");
  if (el) el.textContent = msg;
}
