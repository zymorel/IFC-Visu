/**
 * ids-validator.js — Validateur IDS complet
 * Couvre : entity, attribute, property (instance + type), classification, material
 * Compatible IDS 0.9.x / 1.0 / 1.x (minOccurs et cardinality)
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

/* ══════════════════════════════════════════════════════════════════════
   PARSING IDS XML
══════════════════════════════════════════════════════════════════════ */

export function parseIDS(xmlString) {
  const parser = new DOMParser();
  const doc = parser.parseFromString(xmlString, "application/xml");
  if (doc.querySelector("parsererror")) throw new Error("Fichier IDS invalide (XML mal formé)");

  const specs = [];
  for (const specEl of doc.querySelectorAll("specification")) {
    specs.push({
      name:        specEl.getAttribute("name") || qs(specEl, "name") || "Sans nom",
      description: specEl.getAttribute("description") || qs(specEl, "description") || "",
      ifcVersion:  specEl.getAttribute("ifcVersion") || "",
      applicability: { facets: parseFacets(specEl.querySelector("applicability")) },
      requirements:  { facets: parseFacets(specEl.querySelector("requirements")) },
    });
  }

  const infoEl = doc.querySelector("info");
  return {
    info: {
      title:   qs(infoEl, "title")   || "IDS",
      version: qs(infoEl, "version") || "",
      author:  qs(infoEl, "author")  || "",
    },
    specifications: specs,
  };
}

function parseFacets(parentEl) {
  if (!parentEl) return [];
  const facets = [];

  for (const el of parentEl.querySelectorAll(":scope > entity")) {
    facets.push({
      type:          "entity",
      name:          getFacetValue(el, "name"),
      predefinedType: getFacetValue(el, "predefinedType"),
    });
  }

  for (const el of parentEl.querySelectorAll(":scope > attribute")) {
    facets.push({
      type:        "attribute",
      name:        getFacetValue(el, "name"),
      value:       getFacetValue(el, "value"),
      cardinality: el.getAttribute("cardinality"),
      minOccurs:   el.getAttribute("minOccurs"),
    });
  }

  for (const el of parentEl.querySelectorAll(":scope > property")) {
    facets.push({
      type:         "property",
      propertySet:  getFacetValue(el, "propertySet"),
      baseName:     getFacetValue(el, "baseName") || getFacetValue(el, "name"),
      value:        getFacetValue(el, "value"),
      dataType:     el.getAttribute("dataType") || null,
      cardinality:  el.getAttribute("cardinality"),
      minOccurs:    el.getAttribute("minOccurs"),
    });
  }

  for (const el of parentEl.querySelectorAll(":scope > classification")) {
    facets.push({
      type:        "classification",
      system:      getFacetValue(el, "system"),
      value:       getFacetValue(el, "value"),
      cardinality: el.getAttribute("cardinality"),
      minOccurs:   el.getAttribute("minOccurs"),
    });
  }

  for (const el of parentEl.querySelectorAll(":scope > material")) {
    facets.push({
      type:        "material",
      value:       getFacetValue(el, "value"),
      cardinality: el.getAttribute("cardinality"),
      minOccurs:   el.getAttribute("minOccurs"),
    });
  }

  return facets;
}

function getFacetValue(el, childName) {
  if (!el) return null;
  const child = el.querySelector(`:scope > ${childName}`);
  if (!child) return null;

  const sv = child.querySelector("simpleValue");
  if (sv) return { type: "simple", value: sv.textContent.trim() };

  const restriction = child.querySelector("restriction");
  if (restriction) {
    const enums = [...restriction.querySelectorAll("enumeration")].map(
      e => e.getAttribute("value") || e.textContent.trim()
    );
    if (enums.length) return { type: "enumeration", values: enums };

    const pat = restriction.querySelector("pattern");
    if (pat) return { type: "pattern", value: pat.getAttribute("value") || pat.textContent.trim() };

    const minI = restriction.querySelector("minInclusive");
    const maxI = restriction.querySelector("maxInclusive");
    const minE = restriction.querySelector("minExclusive");
    const maxE = restriction.querySelector("maxExclusive");
    if (minI || maxI || minE || maxE) {
      return {
        type: "range",
        min:        minI ? parseFloat(minI.getAttribute("value")) : null,
        max:        maxI ? parseFloat(maxI.getAttribute("value")) : null,
        minExcl:    minE ? parseFloat(minE.getAttribute("value")) : null,
        maxExcl:    maxE ? parseFloat(maxE.getAttribute("value")) : null,
      };
    }
  }

  const text = child.textContent.trim();
  if (text) return { type: "simple", value: text };
  return null;
}

function qs(el, tag) {
  if (!el) return null;
  const found = el.querySelector(tag);
  return found ? found.textContent.trim() : null;
}

/* ══════════════════════════════════════════════════════════════════════
   IFC TYPE MAP
══════════════════════════════════════════════════════════════════════ */

const IFC_TYPE_MAP = {
  IFCWALL:                   WebIFC.IFCWALL,
  IFCWALLSTANDARDCASE:       WebIFC.IFCWALLSTANDARDCASE,
  IFCSLAB:                   WebIFC.IFCSLAB,
  IFCSLABSTANDARDCASE:       WebIFC.IFCSLABSTANDARDCASE,
  IFCBEAM:                   WebIFC.IFCBEAM,
  IFCBEAMSTANDARDCASE:       WebIFC.IFCBEAMSTANDARDCASE,
  IFCCOLUMN:                 WebIFC.IFCCOLUMN,
  IFCCOLUMNSTANDARDCASE:     WebIFC.IFCCOLUMNSTANDARDCASE,
  IFCDOOR:                   WebIFC.IFCDOOR,
  IFCWINDOW:                 WebIFC.IFCWINDOW,
  IFCROOF:                   WebIFC.IFCROOF,
  IFCSTAIR:                  WebIFC.IFCSTAIR,
  IFCSTAIRFLIGHT:            WebIFC.IFCSTAIRFLIGHT,
  IFCRAILING:                WebIFC.IFCRAILING,
  IFCCURTAINWALL:            WebIFC.IFCCURTAINWALL,
  IFCPLATE:                  WebIFC.IFCPLATE,
  IFCMEMBER:                 WebIFC.IFCMEMBER,
  IFCFOOTING:                WebIFC.IFCFOOTING,
  IFCFURNISHINGELEMENT:      WebIFC.IFCFURNISHINGELEMENT,
  IFCBUILDINGELEMENTPROXY:   WebIFC.IFCBUILDINGELEMENTPROXY,
  IFCCOVERING:               WebIFC.IFCCOVERING,
  IFCSPACE:                  WebIFC.IFCSPACE,
  IFCOPENINGELEMENT:         WebIFC.IFCOPENINGELEMENT,
  IFCFLOWSEGMENT:            WebIFC.IFCFLOWSEGMENT,
  IFCFLOWTERMINAL:           WebIFC.IFCFLOWTERMINAL,
  IFCFLOWFITTING:            WebIFC.IFCFLOWFITTING,
  IFCFLOWCONTROLLER:         WebIFC.IFCFLOWCONTROLLER,
  IFCDISTRIBUTIONELEMENT:    WebIFC.IFCDISTRIBUTIONELEMENT,
  IFCPILE:                   WebIFC.IFCPILE,
  IFCREINFORCINGBAR:         WebIFC.IFCREINFORCINGBAR,
  IFCSITE:                   WebIFC.IFCSITE,
  IFCBUILDING:               WebIFC.IFCBUILDING,
  IFCBUILDINGSTOREY:         WebIFC.IFCBUILDINGSTOREY,
  IFCZONE:                   WebIFC.IFCZONE,
  IFCDUCT:                   WebIFC.IFCDUCT,
  IFCPIPE:                   WebIFC.IFCPIPE,
  IFCPIPEFITTING:            WebIFC.IFCPIPEFITTING,
  IFCDUCTFITTING:            WebIFC.IFCDUCTFITTING,
};

/* Sous-types connus : si on cherche IFCWALL on inclut aussi IFCWALLSTANDARDCASE */
const SUBTYPES = {
  IFCWALL:   ["IFCWALLSTANDARDCASE"],
  IFCSLAB:   ["IFCSLABSTANDARDCASE"],
  IFCBEAM:   ["IFCBEAMSTANDARDCASE"],
  IFCCOLUMN: ["IFCCOLUMNSTANDARDCASE"],
};

/* ══════════════════════════════════════════════════════════════════════
   MOTEUR DE VALIDATION
══════════════════════════════════════════════════════════════════════ */

export function validateIDS(idsData) {
  const api     = getIfcApi();
  const modelId = getCurrentModelId();
  if (!api || modelId === null) throw new Error("Aucun modèle IFC chargé");

  const group = getCurrentModel();
  if (!group) throw new Error("Aucun modèle 3D");

  // Tous les expressIDs visibles dans le modèle 3D
  const allExpressIDs = new Set();
  group.traverse(child => {
    if (child.isMesh && child.userData.expressID != null)
      allExpressIDs.add(child.userData.expressID);
  });

  // Caches
  const propCache   = buildPropertyCache(api, modelId);
  const classifCache = buildClassificationCache(api, modelId);
  const matCache    = buildMaterialCache(api, modelId);

  const elementStatus = new Map();
  const specResults   = [];

  for (const spec of idsData.specifications) {
    const applicableIDs = findApplicableElements(
      api, modelId, spec.applicability, allExpressIDs, propCache, classifCache, matCache
    );
    const results = [];

    for (const expressID of applicableIDs) {
      const reqResults = checkRequirements(
        api, modelId, expressID, spec.requirements, propCache, classifCache, matCache
      );
      const allPass = reqResults.every(r => r.pass);

      results.push({ expressID, pass: allPass, details: reqResults });

      const current = elementStatus.get(expressID);
      if (current !== "fail")
        elementStatus.set(expressID, allPass ? "pass" : "fail");
    }

    specResults.push({
      name:        spec.name,
      description: spec.description,
      applicable:  applicableIDs.length,
      passed:      results.filter(r =>  r.pass).length,
      failed:      results.filter(r => !r.pass).length,
      results,
    });
  }

  lastResults = { specResults, elementStatus };
  return lastResults;
}

/* ══════════════════════════════════════════════════════════════════════
   CACHES IFC
══════════════════════════════════════════════════════════════════════ */

/** Propriétés d'instance (IfcRelDefinesByProperties) + héritage du type (IfcRelDefinesByType) */
function buildPropertyCache(api, modelId) {
  const cache = new Map(); // expressID → Map<psetName, Map<propName, value>>

  const addPsetToCache = (elemId, psetId) => {
    let pset;
    try { pset = api.GetLine(modelId, psetId); } catch { return; }
    if (!pset) return;

    const psetName = getIFCVal(pset.Name) || "";
    const props = new Map();

    if (pset.HasProperties) {
      for (const propRef of pset.HasProperties) {
        const propId = propRef?.value ?? propRef;
        try {
          const prop = api.GetLine(modelId, propId);
          if (!prop) continue;
          const name = getIFCVal(prop.Name) || "";
          // NominalValue est un objet typé : { type, value }
          const val = prop.NominalValue != null
            ? getIFCVal(prop.NominalValue)
            : getIFCVal(prop.Value);
          if (name) props.set(name, val ?? null);
        } catch { /* skip */ }
      }
    }

    if (pset.Quantities) {
      for (const qRef of pset.Quantities) {
        const qId = qRef?.value ?? qRef;
        try {
          const q = api.GetLine(modelId, qId);
          if (!q) continue;
          const name = getIFCVal(q.Name) || "";
          const val = getIFCVal(q.LengthValue) ?? getIFCVal(q.AreaValue) ??
            getIFCVal(q.VolumeValue) ?? getIFCVal(q.WeightValue) ??
            getIFCVal(q.CountValue)  ?? getIFCVal(q.TimeValue) ?? null;
          if (name) props.set(name, val);
        } catch { /* skip */ }
      }
    }

    if (props.size === 0) return;

    if (!cache.has(elemId)) cache.set(elemId, new Map());
    const elemCache = cache.get(elemId);
    if (!elemCache.has(psetName)) elemCache.set(psetName, new Map());
    const existing = elemCache.get(psetName);
    for (const [k, v] of props) existing.set(k, v);
  };

  try {
    // Propriétés d'instance
    const rels = api.GetLineIDsWithType(modelId, WebIFC.IFCRELDEFINESBYPROPERTIES);
    for (let i = 0; i < rels.size(); i++) {
      let rel;
      try { rel = api.GetLine(modelId, rels.get(i)); } catch { continue; }
      if (!rel?.RelatedObjects) continue;

      const psetId = rel.RelatingPropertyDefinition?.value ?? rel.RelatingPropertyDefinition;
      if (!psetId) continue;

      for (const objRef of rel.RelatedObjects) {
        const elemId = objRef?.value ?? objRef;
        if (typeof elemId === "number") addPsetToCache(elemId, psetId);
      }
    }
  } catch (e) { console.warn("Erreur cache propriétés instance:", e); }

  try {
    // Propriétés héritées du type (IfcRelDefinesByType)
    const typeRels = api.GetLineIDsWithType(modelId, WebIFC.IFCRELDEFINESBYTYPE);
    for (let i = 0; i < typeRels.size(); i++) {
      let rel;
      try { rel = api.GetLine(modelId, typeRels.get(i)); } catch { continue; }
      if (!rel?.RelatedObjects || !rel.RelatingType) continue;

      const typeId = rel.RelatingType?.value ?? rel.RelatingType;
      if (typeof typeId !== "number") continue;

      let typeObj;
      try { typeObj = api.GetLine(modelId, typeId); } catch { continue; }
      if (!typeObj?.HasPropertySets) continue;

      // Lister tous les psets du type
      const typePsetIds = typeObj.HasPropertySets.map(r => r?.value ?? r).filter(id => typeof id === "number");

      for (const objRef of rel.RelatedObjects) {
        const elemId = objRef?.value ?? objRef;
        if (typeof elemId !== "number") continue;
        for (const psetId of typePsetIds) addPsetToCache(elemId, psetId);
      }
    }
  } catch (e) { console.warn("Erreur cache propriétés type:", e); }

  return cache;
}

/** Classifications via IfcRelAssociatesClassification */
function buildClassificationCache(api, modelId) {
  const cache = new Map(); // expressID → [{system, value}]
  try {
    const typeCode = WebIFC.IFCRELASSOCIATESCLASSIFICATION;
    if (!typeCode) return cache;

    const rels = api.GetLineIDsWithType(modelId, typeCode);
    for (let i = 0; i < rels.size(); i++) {
      let rel;
      try { rel = api.GetLine(modelId, rels.get(i)); } catch { continue; }
      if (!rel?.RelatedObjects) continue;

      const classRefId = rel.RelatingClassification?.value ?? rel.RelatingClassification;
      if (typeof classRefId !== "number") continue;

      let classRef;
      try { classRef = api.GetLine(modelId, classRefId); } catch { continue; }
      if (!classRef) continue;

      // Système depuis ReferencedSource (IfcClassification)
      let systemName = "";
      const srcRef = classRef.ReferencedSource;
      if (srcRef) {
        const srcId = srcRef?.value ?? srcRef;
        if (typeof srcId === "number") {
          try {
            const src = api.GetLine(modelId, srcId);
            systemName = getIFCVal(src?.Name) || "";
          } catch { /* skip */ }
        }
      }

      // Code : IFC4 → Identification, IFC2X3 → ItemReference
      const classValue = getIFCVal(classRef.Identification)
                      || getIFCVal(classRef.ItemReference)
                      || getIFCVal(classRef.Name)
                      || "";

      const entry = { system: systemName, value: classValue };

      for (const ref of rel.RelatedObjects) {
        const elemId = ref?.value ?? ref;
        if (typeof elemId !== "number") continue;
        if (!cache.has(elemId)) cache.set(elemId, []);
        cache.get(elemId).push(entry);
      }
    }
  } catch (e) { console.warn("Erreur cache classification:", e); }
  return cache;
}

/** Matériaux via IfcRelAssociatesMaterial — supporte tous les sous-types */
function buildMaterialCache(api, modelId) {
  const cache = new Map(); // expressID → string[]
  try {
    const typeCode = WebIFC.IFCRELASSOCIATESMATERIAL;
    if (!typeCode) return cache;

    const rels = api.GetLineIDsWithType(modelId, typeCode);
    for (let i = 0; i < rels.size(); i++) {
      let rel;
      try { rel = api.GetLine(modelId, rels.get(i)); } catch { continue; }
      if (!rel?.RelatedObjects) continue;

      const matId = rel.RelatingMaterial?.value ?? rel.RelatingMaterial;
      if (typeof matId !== "number") continue;

      let matLine;
      try { matLine = api.GetLine(modelId, matId); } catch { continue; }
      if (!matLine) continue;

      const names = extractMaterialNames(api, modelId, matLine);
      if (names.length === 0) continue;

      for (const ref of rel.RelatedObjects) {
        const elemId = ref?.value ?? ref;
        if (typeof elemId !== "number") continue;
        if (!cache.has(elemId)) cache.set(elemId, []);
        cache.get(elemId).push(...names);
      }
    }
  } catch (e) { console.warn("Erreur cache matériaux:", e); }
  return cache;
}

function extractMaterialNames(api, modelId, line) {
  const names = [];
  if (!line) return names;

  const resolve = id => {
    if (typeof id !== "number") return null;
    try { return api.GetLine(modelId, id); } catch { return null; }
  };

  // IfcMaterialLayerSetUsage → ForLayerSet
  if (line.ForLayerSet != null) {
    const ls = resolve(line.ForLayerSet?.value ?? line.ForLayerSet);
    if (ls) names.push(...extractMaterialNames(api, modelId, ls));
    return names;
  }

  // IfcMaterialProfileSetUsage → ForProfileSet
  if (line.ForProfileSet != null) {
    const ps = resolve(line.ForProfileSet?.value ?? line.ForProfileSet);
    if (ps) names.push(...extractMaterialNames(api, modelId, ps));
    return names;
  }

  // IfcMaterialLayerSet → MaterialLayers
  if (line.MaterialLayers) {
    for (const ref of line.MaterialLayers) {
      const layer = resolve(ref?.value ?? ref);
      if (!layer) continue;
      const mat = resolve(layer.Material?.value ?? layer.Material);
      const n = mat ? getIFCVal(mat.Name) : null;
      if (n) names.push(String(n));
    }
    return names;
  }

  // IfcMaterialProfileSet → MaterialProfiles
  if (line.MaterialProfiles) {
    for (const ref of line.MaterialProfiles) {
      const prof = resolve(ref?.value ?? ref);
      if (!prof) continue;
      const mat = resolve(prof.Material?.value ?? prof.Material);
      const n = mat ? getIFCVal(mat.Name) : null;
      if (n) names.push(String(n));
    }
    return names;
  }

  // IfcMaterialConstituentSet → MaterialConstituents (IFC4)
  if (line.MaterialConstituents) {
    for (const ref of line.MaterialConstituents) {
      const constit = resolve(ref?.value ?? ref);
      if (!constit) continue;
      const mat = resolve(constit.Material?.value ?? constit.Material);
      const n = mat ? getIFCVal(mat.Name) : null;
      if (n) names.push(String(n));
    }
    return names;
  }

  // IfcMaterialList → Materials
  if (line.Materials) {
    for (const ref of line.Materials) {
      const mat = resolve(ref?.value ?? ref);
      const n = mat ? getIFCVal(mat.Name) : null;
      if (n) names.push(String(n));
    }
    return names;
  }

  // IfcMaterial (direct)
  const n = getIFCVal(line.Name);
  if (n) names.push(String(n));

  return names;
}

/* ══════════════════════════════════════════════════════════════════════
   FILTRE APPLICABILITÉ
══════════════════════════════════════════════════════════════════════ */

function findApplicableElements(api, modelId, applicability, allExpressIDs, propCache, classifCache, matCache) {
  if (!applicability.facets || applicability.facets.length === 0) return [...allExpressIDs];

  let candidates = null;

  for (const facet of applicability.facets) {
    const matched = new Set();

    if (facet.type === "entity") {
      const typeName = facet.name?.value?.toUpperCase();
      if (typeName) {
        // Type exact
        const code = IFC_TYPE_MAP[typeName];
        if (code !== undefined) {
          try {
            const ids = api.GetLineIDsWithType(modelId, code);
            for (let i = 0; i < ids.size(); i++) {
              if (allExpressIDs.has(ids.get(i))) matched.add(ids.get(i));
            }
          } catch { /* skip */ }
        }
        // Sous-types
        for (const subType of (SUBTYPES[typeName] || [])) {
          const subCode = IFC_TYPE_MAP[subType];
          if (subCode !== undefined) {
            try {
              const ids = api.GetLineIDsWithType(modelId, subCode);
              for (let i = 0; i < ids.size(); i++) {
                if (allExpressIDs.has(ids.get(i))) matched.add(ids.get(i));
              }
            } catch { /* skip */ }
          }
        }
      }

      // Filtrer par predefinedType si spécifié
      if (facet.predefinedType && matched.size > 0) {
        const expected = facet.predefinedType.value?.toUpperCase();
        if (expected) {
          for (const eid of [...matched]) {
            try {
              const line = api.GetLine(modelId, eid);
              const pt = getIFCVal(line?.PredefinedType)?.toUpperCase() || "";
              if (pt !== expected) matched.delete(eid);
            } catch { matched.delete(eid); }
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

    } else if (facet.type === "classification") {
      for (const eid of (candidates || allExpressIDs)) {
        const entries = classifCache.get(eid) || [];
        const sysOk = !facet.system || entries.some(e => matchValue(e.system, facet.system));
        const valOk = !facet.value  || entries.some(e => matchValue(e.value,  facet.value));
        if (entries.length > 0 && sysOk && valOk) matched.add(eid);
      }

    } else if (facet.type === "material") {
      for (const eid of (candidates || allExpressIDs)) {
        const names = matCache.get(eid) || [];
        if (!facet.value || names.some(n => matchValue(n, facet.value))) {
          if (names.length > 0) matched.add(eid);
        }
      }
    }

    candidates = candidates === null
      ? matched
      : new Set([...candidates].filter(id => matched.has(id)));
  }

  return [...(candidates || [])];
}

/* ══════════════════════════════════════════════════════════════════════
   VÉRIFICATION DES EXIGENCES
══════════════════════════════════════════════════════════════════════ */

function checkRequirements(api, modelId, expressID, requirements, propCache, classifCache, matCache) {
  if (!requirements.facets || requirements.facets.length === 0)
    return [{ name: "Aucune exigence", pass: true, reason: "—" }];

  const results = [];

  for (const facet of requirements.facets) {
    const isOptional = facet.cardinality === "optional" || facet.minOccurs === "0";

    if (facet.type === "attribute") {
      let line;
      try { line = api.GetLine(modelId, expressID); } catch { /* skip */ }
      if (!line) {
        results.push({ name: `Attribut: ${facet.name?.value || "?"}`, pass: isOptional, reason: "Élément introuvable" });
        continue;
      }
      const pass = checkAttributeFacet(line, facet);
      const attrVal = getIFCVal(line[facet.name?.value]);
      results.push({
        name:   `Attribut: ${facet.name?.value || "?"}`,
        pass:   pass || isOptional,
        reason: pass ? `OK (${attrVal})` : `Valeur "${attrVal ?? "null"}" ne correspond pas`,
      });

    } else if (facet.type === "property") {
      const { pass, found, actual } = checkPropertyFacetDetail(expressID, facet, propCache);
      const psetName = facet.propertySet?.value || "?";
      const propName = facet.baseName?.value || "?";
      results.push({
        name:   `${psetName} / ${propName}`,
        pass:   pass || isOptional,
        reason: pass
          ? `OK (${actual})`
          : found
            ? `Valeur "${actual}" ne correspond pas`
            : "Propriété absente",
      });

    } else if (facet.type === "classification") {
      const entries = classifCache.get(expressID) || [];
      if (entries.length === 0) {
        results.push({
          name:   `Classification: ${facet.system?.value || "?"}`,
          pass:   isOptional,
          reason: "Aucune classification associée",
        });
        continue;
      }

      let pass = false;
      for (const entry of entries) {
        const sysOk = !facet.system || matchValue(entry.system, facet.system);
        const valOk = !facet.value  || matchValue(entry.value,  facet.value);
        if (sysOk && valOk) { pass = true; break; }
      }
      results.push({
        name:   `Classification: ${facet.system?.value || "?"}`,
        pass:   pass || isOptional,
        reason: pass
          ? `OK`
          : `Non trouvé (présent: ${entries.map(e => `${e.system}/${e.value}`).join(", ") || "rien"})`,
      });

    } else if (facet.type === "material") {
      const names = matCache.get(expressID) || [];
      if (names.length === 0) {
        results.push({
          name:   `Matériau: ${facet.value?.value || "?"}`,
          pass:   isOptional,
          reason: "Aucun matériau associé",
        });
        continue;
      }
      const pass = !facet.value || names.some(n => matchValue(n, facet.value));
      results.push({
        name:   `Matériau: ${facet.value?.value || "(présent)"}`,
        pass:   pass || isOptional,
        reason: pass
          ? `OK (${names.join(", ")})`
          : `Non trouvé (présent: ${names.join(", ")})`,
      });

    } else if (facet.type === "entity") {
      let line;
      try { line = api.GetLine(modelId, expressID); } catch { /* skip */ }
      // L'entity dans les requirements vérifie juste le type
      const typeName = facet.name?.value?.toUpperCase() || "";
      const code = typeName ? IFC_TYPE_MAP[typeName] : null;
      let pass = false;
      if (code !== undefined) {
        try {
          const ids = api.GetLineIDsWithType(modelId, code);
          for (let i = 0; i < ids.size(); i++) {
            if (ids.get(i) === expressID) { pass = true; break; }
          }
        } catch { /* skip */ }
        // Sous-types
        if (!pass) {
          for (const subType of (SUBTYPES[typeName] || [])) {
            const subCode = IFC_TYPE_MAP[subType];
            if (subCode === undefined) continue;
            try {
              const ids = api.GetLineIDsWithType(modelId, subCode);
              for (let i = 0; i < ids.size(); i++) {
                if (ids.get(i) === expressID) { pass = true; break; }
              }
            } catch { /* skip */ }
            if (pass) break;
          }
        }
      }
      results.push({
        name:   `Type: ${typeName}`,
        pass,
        reason: pass ? "OK" : `Type inattendu`,
      });

    } else {
      results.push({
        name:   `${facet.type}: non supporté`,
        pass:   true,
        reason: "Vérification non implémentée",
      });
    }
  }

  return results;
}

/* ══════════════════════════════════════════════════════════════════════
   VÉRIFICATIONS ATOMIQUES
══════════════════════════════════════════════════════════════════════ */

function checkAttributeFacet(line, facet) {
  const attrName = facet.name?.value;
  if (!attrName) return true;

  const val = getIFCVal(line[attrName]);
  if (val === null || val === undefined) return false;

  if (facet.value) return matchValue(String(val), facet.value);
  return String(val).length > 0;
}

function checkPropertyFacet(expressID, facet, propCache) {
  return checkPropertyFacetDetail(expressID, facet, propCache).pass;
}

function checkPropertyFacetDetail(expressID, facet, propCache) {
  const psetName = facet.propertySet?.value;
  const propName = facet.baseName?.value;
  if (!psetName || !propName) return { pass: true, found: true, actual: null };

  const elemProps = propCache.get(expressID);
  if (!elemProps) return { pass: false, found: false, actual: null };

  // Recherche du pset (exacte puis insensible à la casse, puis pattern/enum)
  let psetProps = findInMap(elemProps, psetName, facet.propertySet);
  if (!psetProps) return { pass: false, found: false, actual: null };

  // Recherche de la propriété
  let propVal = findInMap(psetProps, propName, facet.baseName);
  if (propVal === undefined || propVal === null)
    return { pass: false, found: false, actual: null };

  const actual = String(propVal);
  if (!facet.value) return { pass: true, found: true, actual };

  const pass = matchValue(actual, facet.value);
  return { pass, found: true, actual };
}

/** Cherche une clé dans une Map par correspondance exacte, puis insensible à la casse, puis matchValue */
function findInMap(map, keySimple, keyFacet) {
  // Exact
  if (map.has(keySimple)) return map.get(keySimple);
  // Insensible à la casse
  const lower = keySimple.toLowerCase();
  for (const [k, v] of map) {
    if (k.toLowerCase() === lower) return v;
  }
  // Si le facet a un pattern/enum, chercher par matchValue
  if (keyFacet && keyFacet.type !== "simple") {
    for (const [k, v] of map) {
      if (matchValue(k, keyFacet)) return v;
    }
  }
  return undefined;
}

/* ══════════════════════════════════════════════════════════════════════
   CORRESPONDANCE DE VALEURS
══════════════════════════════════════════════════════════════════════ */

function matchValue(actual, expected) {
  if (!expected) return true;
  const s = String(actual ?? "");

  switch (expected.type) {
    case "simple": {
      const ev = expected.value;
      if (!ev) return s.length > 0;
      // Comparaison exacte (sensible à la casse pour les strings IFC significatives)
      // puis insensible (fallback)
      return s === ev || s.toLowerCase() === ev.toLowerCase();
    }
    case "enumeration":
      return expected.values.some(v => s === v || s.toLowerCase() === v.toLowerCase());

    case "pattern":
      try {
        // Les patterns XSD sont ancrés implicitement (toute la valeur doit matcher)
        return new RegExp(`^(?:${expected.value})$`).test(s);
      } catch {
        return s.includes(expected.value);
      }

    case "range": {
      const num = parseFloat(s);
      if (isNaN(num)) return false;
      if (expected.min     !== null && num <  expected.min)     return false;
      if (expected.max     !== null && num >  expected.max)     return false;
      if (expected.minExcl !== null && num <= expected.minExcl) return false;
      if (expected.maxExcl !== null && num >= expected.maxExcl) return false;
      return true;
    }
  }
  return true;
}

/* ══════════════════════════════════════════════════════════════════════
   UTILITAIRES IFC
══════════════════════════════════════════════════════════════════════ */

function getIFCVal(v) {
  if (v === null || v === undefined) return null;
  if (typeof v === "string" || typeof v === "number" || typeof v === "boolean") return v;
  if (typeof v === "object" && "value" in v) return v.value;
  return null;
}

/* ══════════════════════════════════════════════════════════════════════
   COLORISATION 3D
══════════════════════════════════════════════════════════════════════ */

export function applyValidationColors(elementStatus) {
  const group = getCurrentModel();
  if (!group) return;
  validationActive = true;

  group.traverse(child => {
    if (!child.isMesh) return;
    const eid = child.userData.expressID;
    if (eid == null) return;
    const status = elementStatus.get(eid);
    if (status === "pass")       child.material = MAT_PASS;
    else if (status === "fail")  child.material = MAT_FAIL;
    else                         child.material = MAT_UNTESTED;
  });
}

export function clearValidationColors() {
  const group = getCurrentModel();
  if (!group) return;
  validationActive = false;

  group.traverse(child => {
    if (!child.isMesh) return;
    if (child.userData.originalMaterial)
      child.material = child.userData.originalMaterial;
  });
}

export function isValidationActive() { return validationActive; }
export function getLastResults()     { return lastResults; }
