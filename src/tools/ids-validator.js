/**
 * ids-validator.js — Validateur IDS (Information Delivery Specification)
 * Parse un fichier IDS XML, vérifie la conformité des éléments IFC,
 * et colore le modèle 3D en conséquence.
 */

import * as THREE from "three";
import { getIfcApi, getCurrentModelId, getCurrentModel } from "../viewer/viewer.js";
import * as WebIFC from "web-ifc";

/* ---- Result colors ---- */
const MAT_PASS = new THREE.MeshPhongMaterial({
  color: 0x4caf50, emissive: 0x1a3a1a, opacity: 0.9,
  transparent: true, side: THREE.DoubleSide, depthWrite: true,
});
const MAT_FAIL = new THREE.MeshPhongMaterial({
  color: 0xf44336, emissive: 0x3a1a1a, opacity: 0.9,
  transparent: true, side: THREE.DoubleSide, depthWrite: true,
});
const MAT_UNTESTED = new THREE.MeshPhongMaterial({
  color: 0x888888, emissive: 0x222222, opacity: 0.4,
  transparent: true, side: THREE.DoubleSide, depthWrite: false,
});

let validationActive = false;
let lastResults = null;

/**
 * Parse an IDS XML string and return structured specifications
 */
export function parseIDS(xmlString) {
  const parser = new DOMParser();
  const doc = parser.parseFromString(xmlString, "application/xml");

  const parseError = doc.querySelector("parsererror");
  if (parseError) throw new Error("Fichier IDS invalide (XML mal formé)");

  const specs = [];
  const specEls = doc.querySelectorAll("specification");

  for (const specEl of specEls) {
    const spec = {
      name: specEl.getAttribute("name") || getTextContent(specEl, "name") || "Sans nom",
      description: specEl.getAttribute("description") || getTextContent(specEl, "description") || "",
      ifcVersion: specEl.getAttribute("ifcVersion") || "",
      applicability: parseApplicability(specEl.querySelector("applicability")),
      requirements: parseRequirements(specEl.querySelector("requirements")),
    };
    specs.push(spec);
  }

  // Parse info
  const infoEl = doc.querySelector("info");
  const info = {
    title: getTextContent(infoEl, "title") || "IDS",
    version: getTextContent(infoEl, "version") || "",
    author: getTextContent(infoEl, "author") || "",
  };

  return { info, specifications: specs };
}

function parseApplicability(el) {
  if (!el) return { facets: [] };
  return { facets: parseFacets(el) };
}

function parseRequirements(el) {
  if (!el) return { facets: [] };
  return { facets: parseFacets(el) };
}

function parseFacets(parentEl) {
  const facets = [];

  // Entity facet
  for (const entityEl of parentEl.querySelectorAll(":scope > entity")) {
    facets.push({
      type: "entity",
      name: getFacetValue(entityEl, "name"),
      predefinedType: getFacetValue(entityEl, "predefinedType"),
    });
  }

  // Attribute facet
  for (const attrEl of parentEl.querySelectorAll(":scope > attribute")) {
    facets.push({
      type: "attribute",
      name: getFacetValue(attrEl, "name"),
      value: getFacetValue(attrEl, "value"),
      minOccurs: attrEl.getAttribute("minOccurs"),
    });
  }

  // Property facet
  for (const propEl of parentEl.querySelectorAll(":scope > property")) {
    facets.push({
      type: "property",
      propertySet: getFacetValue(propEl, "propertySet"),
      baseName: getFacetValue(propEl, "baseName") || getFacetValue(propEl, "name"),
      value: getFacetValue(propEl, "value"),
      dataType: propEl.getAttribute("dataType") || null,
      minOccurs: propEl.getAttribute("minOccurs"),
    });
  }

  // Classification facet
  for (const classEl of parentEl.querySelectorAll(":scope > classification")) {
    facets.push({
      type: "classification",
      system: getFacetValue(classEl, "system"),
      value: getFacetValue(classEl, "value"),
      minOccurs: classEl.getAttribute("minOccurs"),
    });
  }

  // Material facet
  for (const matEl of parentEl.querySelectorAll(":scope > material")) {
    facets.push({
      type: "material",
      value: getFacetValue(matEl, "value"),
      minOccurs: matEl.getAttribute("minOccurs"),
    });
  }

  return facets;
}

function getFacetValue(el, childName) {
  if (!el) return null;
  const child = el.querySelector(`:scope > ${childName}`);
  if (!child) return null;

  // Check for simpleValue
  const sv = child.querySelector("simpleValue");
  if (sv) return { type: "simple", value: sv.textContent.trim() };

  // Check for restriction (enumeration, pattern, bounds)
  const restriction = child.querySelector("restriction");
  if (restriction) {
    const base = restriction.getAttribute("base") || "";
    const enums = [...restriction.querySelectorAll("enumeration")].map(
      (e) => e.getAttribute("value") || e.textContent.trim()
    );
    if (enums.length > 0) return { type: "enumeration", values: enums };

    const pattern = restriction.querySelector("pattern");
    if (pattern) return { type: "pattern", value: pattern.getAttribute("value") || pattern.textContent.trim() };

    const minInc = restriction.querySelector("minInclusive");
    const maxInc = restriction.querySelector("maxInclusive");
    if (minInc || maxInc) {
      return {
        type: "range",
        min: minInc ? parseFloat(minInc.getAttribute("value")) : null,
        max: maxInc ? parseFloat(maxInc.getAttribute("value")) : null,
      };
    }
  }

  // Plain text
  const text = child.textContent.trim();
  if (text) return { type: "simple", value: text };

  return null;
}

function getTextContent(parent, tag) {
  if (!parent) return null;
  const el = parent.querySelector(tag);
  return el ? el.textContent.trim() : null;
}

/* ==== IFC Type mapping ==== */

const IFC_TYPE_MAP = {
  IFCWALL: WebIFC.IFCWALL,
  IFCWALLSTANDARDCASE: WebIFC.IFCWALLSTANDARDCASE,
  IFCSLAB: WebIFC.IFCSLAB,
  IFCBEAM: WebIFC.IFCBEAM,
  IFCCOLUMN: WebIFC.IFCCOLUMN,
  IFCDOOR: WebIFC.IFCDOOR,
  IFCWINDOW: WebIFC.IFCWINDOW,
  IFCROOF: WebIFC.IFCROOF,
  IFCSTAIR: WebIFC.IFCSTAIR,
  IFCSTAIRFLIGHT: WebIFC.IFCSTAIRFLIGHT,
  IFCRAILING: WebIFC.IFCRAILING,
  IFCCURTAINWALL: WebIFC.IFCCURTAINWALL,
  IFCPLATE: WebIFC.IFCPLATE,
  IFCMEMBER: WebIFC.IFCMEMBER,
  IFCFOOTING: WebIFC.IFCFOOTING,
  IFCFURNISHINGELEMENT: WebIFC.IFCFURNISHINGELEMENT,
  IFCBUILDINGELEMENTPROXY: WebIFC.IFCBUILDINGELEMENTPROXY,
  IFCCOVERING: WebIFC.IFCCOVERING,
  IFCSPACE: WebIFC.IFCSPACE,
  IFCOPENINGELEMENT: WebIFC.IFCOPENINGELEMENT,
  IFCFLOWSEGMENT: WebIFC.IFCFLOWSEGMENT,
  IFCFLOWTERMINAL: WebIFC.IFCFLOWTERMINAL,
  IFCFLOWFITTING: WebIFC.IFCFLOWFITTING,
  IFCFLOWCONTROLLER: WebIFC.IFCFLOWCONTROLLER,
  IFCDISTRIBUTIONELEMENT: WebIFC.IFCDISTRIBUTIONELEMENT,
  IFCPILE: WebIFC.IFCPILE,
  IFCREINFORCINGBAR: WebIFC.IFCREINFORCINGBAR,
};

/* ==== Validation engine ==== */

/**
 * Run IDS validation against the loaded IFC model
 * Returns { specResults: [...], elementStatus: Map<expressID, "pass"|"fail"|"untested"> }
 */
export function validateIDS(idsData) {
  const api = getIfcApi();
  const modelId = getCurrentModelId();
  if (!api || modelId === null) throw new Error("Aucun modèle IFC chargé");

  const group = getCurrentModel();
  if (!group) throw new Error("Aucun modèle 3D");

  // Collect all expressIDs from the 3D model
  const allExpressIDs = new Set();
  group.traverse((child) => {
    if (child.isMesh && child.userData.expressID != null) {
      allExpressIDs.add(child.userData.expressID);
    }
  });

  // Build property cache: expressID → { psetName → { propName → value } }
  const propCache = buildPropertyCache(api, modelId);

  const elementStatus = new Map(); // expressID → "pass" | "fail"
  const specResults = [];

  for (const spec of idsData.specifications) {
    const applicableIDs = findApplicableElements(api, modelId, spec.applicability, allExpressIDs, propCache);
    const results = [];

    for (const expressID of applicableIDs) {
      const reqResults = checkRequirements(api, modelId, expressID, spec.requirements, propCache);
      const allPass = reqResults.every((r) => r.pass);

      results.push({
        expressID,
        pass: allPass,
        details: reqResults,
      });

      // Element status: fail overrides pass (if multiple specs)
      const current = elementStatus.get(expressID);
      if (current === "fail") continue;
      elementStatus.set(expressID, allPass ? "pass" : "fail");
    }

    specResults.push({
      name: spec.name,
      description: spec.description,
      applicable: applicableIDs.length,
      passed: results.filter((r) => r.pass).length,
      failed: results.filter((r) => !r.pass).length,
      results,
    });
  }

  lastResults = { specResults, elementStatus };
  return lastResults;
}

function buildPropertyCache(api, modelId) {
  const cache = new Map(); // expressID → Map<psetName, Map<propName, value>>

  try {
    const rels = api.GetLineIDsWithType(modelId, WebIFC.IFCRELDEFINESBYPROPERTIES);
    for (let i = 0; i < rels.size(); i++) {
      let rel;
      try { rel = api.GetLine(modelId, rels.get(i)); } catch { continue; }
      if (!rel || !rel.RelatedObjects) continue;

      const psetRef = rel.RelatingPropertyDefinition;
      const psetId = psetRef?.value ?? psetRef;
      if (!psetId) continue;

      let pset;
      try { pset = api.GetLine(modelId, psetId); } catch { continue; }
      if (!pset) continue;

      const psetName = getIFCVal(pset.Name) || "";
      const props = new Map();

      if (pset.HasProperties) {
        for (let k = 0; k < pset.HasProperties.length; k++) {
          const propRef = pset.HasProperties[k];
          const propId = propRef?.value ?? propRef;
          try {
            const prop = api.GetLine(modelId, propId);
            if (prop) {
              const propName = getIFCVal(prop.Name) || "";
              const propVal = getIFCVal(prop.NominalValue) ?? getIFCVal(prop.Value) ?? null;
              props.set(propName, propVal);
            }
          } catch { /* skip */ }
        }
      }

      // Quantity sets
      if (pset.Quantities) {
        for (let k = 0; k < pset.Quantities.length; k++) {
          const qRef = pset.Quantities[k];
          const qId = qRef?.value ?? qRef;
          try {
            const q = api.GetLine(modelId, qId);
            if (q) {
              const qName = getIFCVal(q.Name) || "";
              const qVal = getIFCVal(q.LengthValue) ?? getIFCVal(q.AreaValue) ??
                getIFCVal(q.VolumeValue) ?? getIFCVal(q.WeightValue) ??
                getIFCVal(q.CountValue) ?? getIFCVal(q.TimeValue) ?? null;
              props.set(qName, qVal);
            }
          } catch { /* skip */ }
        }
      }

      if (props.size === 0) continue;

      for (let j = 0; j < rel.RelatedObjects.length; j++) {
        const ref = rel.RelatedObjects[j];
        const elemId = ref?.value ?? ref;
        if (!cache.has(elemId)) cache.set(elemId, new Map());
        const elemCache = cache.get(elemId);
        if (!elemCache.has(psetName)) elemCache.set(psetName, new Map());
        const existing = elemCache.get(psetName);
        for (const [k, v] of props) existing.set(k, v);
      }
    }
  } catch (e) { console.warn("Erreur cache propriétés:", e); }

  return cache;
}

function findApplicableElements(api, modelId, applicability, allExpressIDs, propCache) {
  if (!applicability.facets || applicability.facets.length === 0) {
    return [...allExpressIDs];
  }

  let candidates = null;

  for (const facet of applicability.facets) {
    let matched = new Set();

    if (facet.type === "entity") {
      const typeName = facet.name?.value?.toUpperCase();
      if (typeName) {
        // Try exact match first
        const typeCode = IFC_TYPE_MAP[typeName];
        if (typeCode !== undefined) {
          try {
            const ids = api.GetLineIDsWithType(modelId, typeCode);
            for (let i = 0; i < ids.size(); i++) {
              const id = ids.get(i);
              if (allExpressIDs.has(id)) matched.add(id);
            }
          } catch { /* skip */ }
        }
        // Also try partial match (e.g. IFCWALL matches IFCWALLSTANDARDCASE)
        if (typeName === "IFCWALL") {
          const scCode = IFC_TYPE_MAP["IFCWALLSTANDARDCASE"];
          if (scCode !== undefined) {
            try {
              const ids = api.GetLineIDsWithType(modelId, scCode);
              for (let i = 0; i < ids.size(); i++) {
                const id = ids.get(i);
                if (allExpressIDs.has(id)) matched.add(id);
              }
            } catch { /* skip */ }
          }
        }
      }
    } else if (facet.type === "attribute") {
      for (const eid of (candidates || allExpressIDs)) {
        try {
          const line = api.GetLine(modelId, eid);
          if (line && checkAttributeFacet(line, facet)) matched.add(eid);
        } catch { /* skip */ }
      }
    } else if (facet.type === "property") {
      for (const eid of (candidates || allExpressIDs)) {
        if (checkPropertyFacet(eid, facet, propCache)) matched.add(eid);
      }
    }

    // Intersect
    if (candidates === null) {
      candidates = matched;
    } else {
      candidates = new Set([...candidates].filter((id) => matched.has(id)));
    }
  }

  return [...(candidates || [])];
}

function checkRequirements(api, modelId, expressID, requirements, propCache) {
  if (!requirements.facets || requirements.facets.length === 0) {
    return [{ name: "Aucune exigence", pass: true }];
  }

  const results = [];

  for (const facet of requirements.facets) {
    const isOptional = facet.minOccurs === "0";

    if (facet.type === "attribute") {
      let line;
      try { line = api.GetLine(modelId, expressID); } catch { /* skip */ }

      if (!line) {
        results.push({ name: `Attribut: ${facet.name?.value || "?"}`, pass: isOptional, reason: "Élément introuvable" });
        continue;
      }

      const pass = checkAttributeFacet(line, facet);
      results.push({
        name: `Attribut: ${facet.name?.value || "?"}`,
        pass: pass || isOptional,
        reason: pass ? "OK" : `Attribut manquant ou valeur incorrecte`,
      });
    } else if (facet.type === "property") {
      const pass = checkPropertyFacet(expressID, facet, propCache);
      const psetName = facet.propertySet?.value || "?";
      const propName = facet.baseName?.value || "?";
      results.push({
        name: `${psetName} / ${propName}`,
        pass: pass || isOptional,
        reason: pass ? "OK" : `Propriété manquante ou valeur incorrecte`,
      });
    } else if (facet.type === "entity") {
      let line;
      try { line = api.GetLine(modelId, expressID); } catch { /* skip */ }
      const typeName = line?.constructor?.name?.toUpperCase() || "";
      const expected = facet.name?.value?.toUpperCase() || "";
      const pass = typeName.includes(expected);
      results.push({
        name: `Type: ${expected}`,
        pass,
        reason: pass ? "OK" : `Type ${typeName} ≠ ${expected}`,
      });
    } else {
      results.push({
        name: `${facet.type}: non supporté`,
        pass: true,
        reason: "Vérification non implémentée",
      });
    }
  }

  return results;
}

function checkAttributeFacet(line, facet) {
  const attrName = facet.name?.value;
  if (!attrName) return true;

  const val = getIFCVal(line[attrName]);
  if (val === null || val === undefined) return false;

  if (facet.value) {
    return matchValue(String(val), facet.value);
  }

  return String(val).length > 0;
}

function checkPropertyFacet(expressID, facet, propCache) {
  const psetName = facet.propertySet?.value;
  const propName = facet.baseName?.value;
  if (!psetName || !propName) return true;

  const elemProps = propCache.get(expressID);
  if (!elemProps) return false;

  // Try exact pset match or case-insensitive
  let psetProps = elemProps.get(psetName);
  if (!psetProps) {
    const lower = psetName.toLowerCase();
    for (const [k, v] of elemProps) {
      if (k.toLowerCase() === lower) { psetProps = v; break; }
    }
  }
  if (!psetProps) return false;

  // Try exact prop match or case-insensitive
  let propVal = psetProps.get(propName);
  if (propVal === undefined) {
    const lower = propName.toLowerCase();
    for (const [k, v] of psetProps) {
      if (k.toLowerCase() === lower) { propVal = v; break; }
    }
  }
  if (propVal === undefined || propVal === null) return false;

  if (facet.value) {
    return matchValue(String(propVal), facet.value);
  }

  return true; // Property exists
}

function matchValue(actual, expected) {
  if (!expected) return true;

  if (expected.type === "simple") {
    const ev = expected.value;
    if (!ev) return actual.length > 0;
    return actual.toLowerCase() === ev.toLowerCase() ||
      actual === ev ||
      actual.replace(/\s/g, "") === ev.replace(/\s/g, "");
  }

  if (expected.type === "enumeration") {
    return expected.values.some((v) =>
      actual.toLowerCase() === v.toLowerCase()
    );
  }

  if (expected.type === "pattern") {
    try {
      return new RegExp(expected.value, "i").test(actual);
    } catch {
      return actual.includes(expected.value);
    }
  }

  if (expected.type === "range") {
    const num = parseFloat(actual);
    if (isNaN(num)) return false;
    if (expected.min !== null && num < expected.min) return false;
    if (expected.max !== null && num > expected.max) return false;
    return true;
  }

  return true;
}

function getIFCVal(v) {
  if (v === null || v === undefined) return null;
  if (typeof v === "string" || typeof v === "number" || typeof v === "boolean") return v;
  if (typeof v === "object" && "value" in v) return v.value;
  return null;
}

/* ==== 3D Colorization ==== */

export function applyValidationColors(elementStatus) {
  const group = getCurrentModel();
  if (!group) return;

  validationActive = true;

  group.traverse((child) => {
    if (!child.isMesh) return;
    const eid = child.userData.expressID;
    if (eid == null) return;

    const status = elementStatus.get(eid);
    if (status === "pass") {
      child.material = MAT_PASS;
    } else if (status === "fail") {
      child.material = MAT_FAIL;
    } else {
      child.material = MAT_UNTESTED;
    }
  });
}

export function clearValidationColors() {
  const group = getCurrentModel();
  if (!group) return;

  validationActive = false;

  group.traverse((child) => {
    if (!child.isMesh) return;
    if (child.userData.originalMaterial) {
      child.material = child.userData.originalMaterial;
    }
  });
}

export function isValidationActive() { return validationActive; }
export function getLastResults() { return lastResults; }
