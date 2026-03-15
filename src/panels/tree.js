/**
 * tree.js — Arborescence spatiale IFC (Project > Site > Building > Storey > éléments)
 */

import { getIfcApi, getCurrentModelId } from "../viewer/viewer.js";
import { selectByExpressID } from "../tools/selection.js";
import * as WebIFC from "web-ifc";

const treeContainer = document.getElementById("tree-content");

const SPATIAL_TYPES = [
  WebIFC.IFCPROJECT,
  WebIFC.IFCSITE,
  WebIFC.IFCBUILDING,
  WebIFC.IFCBUILDINGSTOREY,
];

// expressID → { row: HTMLElement, li: HTMLElement }
let nodeMap = new Map();

// Cache for aggregation and containment relationships
let aggregatesMap = null;
let containsMap = null;

export function buildTree() {
  if (!treeContainer) return;
  treeContainer.innerHTML = "";
  nodeMap = new Map();

  const api = getIfcApi();
  const modelId = getCurrentModelId();
  if (!api || modelId === null) {
    treeContainer.innerHTML = "<p class='tree-empty'>Aucun modèle chargé</p>";
    return;
  }

  aggregatesMap = new Map();
  containsMap = new Map();

  try {
    const aggRels = api.GetLineIDsWithType(modelId, WebIFC.IFCRELAGGREGATES);
    for (let i = 0; i < aggRels.size(); i++) {
      const rel = api.GetLine(modelId, aggRels.get(i));
      if (!rel) continue;
      const parentId = rel.RelatingObject?.value ?? rel.RelatingObject;
      if (!parentId) continue;
      const children = [];
      if (rel.RelatedObjects) {
        for (let j = 0; j < rel.RelatedObjects.length; j++) {
          const ref = rel.RelatedObjects[j];
          children.push(ref?.value ?? ref);
        }
      }
      if (children.length > 0) {
        const existing = aggregatesMap.get(parentId) || [];
        aggregatesMap.set(parentId, existing.concat(children));
      }
    }
  } catch (e) { console.warn("Erreur IfcRelAggregates:", e); }

  try {
    const contRels = api.GetLineIDsWithType(modelId, WebIFC.IFCRELCONTAINEDINSPATIALSTRUCTURE);
    for (let i = 0; i < contRels.size(); i++) {
      const rel = api.GetLine(modelId, contRels.get(i));
      if (!rel) continue;
      const spatialId = rel.RelatingStructure?.value ?? rel.RelatingStructure;
      if (!spatialId) continue;
      const elements = [];
      if (rel.RelatedElements) {
        for (let j = 0; j < rel.RelatedElements.length; j++) {
          const ref = rel.RelatedElements[j];
          elements.push(ref?.value ?? ref);
        }
      }
      if (elements.length > 0) {
        const existing = containsMap.get(spatialId) || [];
        containsMap.set(spatialId, existing.concat(elements));
      }
    }
  } catch (e) { console.warn("Erreur IfcRelContained:", e); }

  try {
    const projectIds = api.GetLineIDsWithType(modelId, WebIFC.IFCPROJECT);
    if (projectIds.size() > 0) {
      const projectId = projectIds.get(0);
      const node = buildNodeRecursive(api, modelId, projectId, 0);
      if (node) treeContainer.appendChild(node);
    } else {
      treeContainer.innerHTML = "<p class='tree-empty'>Structure IFC introuvable</p>";
    }
  } catch (e) {
    console.warn("Erreur construction arbre:", e);
    treeContainer.innerHTML = "<p class='tree-empty'>Erreur de lecture</p>";
  }
}

function buildNodeRecursive(api, modelId, expressID, depth) {
  let line;
  try {
    line = api.GetLine(modelId, expressID);
  } catch { return null; }
  if (!line) return null;

  const name = getVal(line.Name) || getVal(line.LongName) || `#${expressID}`;
  const typeName = getTypeName(line);

  const aggChildren = aggregatesMap.get(expressID) || [];
  const contChildren = containsMap.get(expressID) || [];
  const hasChildren = aggChildren.length > 0 || contChildren.length > 0;

  const li = document.createElement("li");
  li.className = "tree-node";

  const row = document.createElement("div");
  row.className = "tree-row";
  if (depth === 0) row.classList.add("tree-root");

  const arrow = document.createElement("span");
  arrow.className = "tree-arrow";
  if (hasChildren) {
    arrow.textContent = "\u25B6";
    arrow.classList.add("has-children");
  }
  row.appendChild(arrow);

  const icon = document.createElement("span");
  icon.className = "tree-icon";
  icon.textContent = getIcon(typeName);
  row.appendChild(icon);

  const label = document.createElement("span");
  label.className = "tree-label";
  label.textContent = name;
  label.title = `${typeName} #${expressID}`;
  row.appendChild(label);

  const badge = document.createElement("span");
  badge.className = "tree-type";
  badge.textContent = typeName;
  row.appendChild(badge);

  li.appendChild(row);

  // Register in nodeMap
  nodeMap.set(expressID, { row, li });

  let childrenUl = null;
  let expanded = depth < 2;

  if (hasChildren) {
    childrenUl = document.createElement("ul");
    childrenUl.className = "tree-children";

    // Always build children eagerly
    loadChildren(childrenUl, api, modelId, aggChildren, contChildren, depth);

    if (expanded) {
      arrow.textContent = "\u25BC";
      arrow.classList.add("expanded");
    } else {
      childrenUl.style.display = "none";
    }

    li.appendChild(childrenUl);

    arrow.addEventListener("click", (e) => {
      e.stopPropagation();
      expanded = !expanded;
      if (expanded) {
        childrenUl.style.display = "";
        arrow.textContent = "\u25BC";
        arrow.classList.add("expanded");
      } else {
        childrenUl.style.display = "none";
        arrow.textContent = "\u25B6";
        arrow.classList.remove("expanded");
      }
    });
  }

  label.addEventListener("click", (e) => {
    e.stopPropagation();
    selectByExpressID(expressID);
    window.dispatchEvent(
      new CustomEvent("element-selected", { detail: { expressID } })
    );
  });

  return li;
}

function loadChildren(ul, api, modelId, aggChildren, contChildren, depth) {
  for (const childId of aggChildren) {
    const childNode = buildNodeRecursive(api, modelId, childId, depth + 1);
    if (childNode) ul.appendChild(childNode);
  }

  if (contChildren.length > 0) {
    const byType = new Map();
    for (const elemId of contChildren) {
      let line;
      try { line = api.GetLine(modelId, elemId); } catch { continue; }
      if (!line) continue;
      const typeName = getTypeName(line);
      if (!byType.has(typeName)) byType.set(typeName, []);
      byType.get(typeName).push({ id: elemId, line });
    }

    for (const [typeName, items] of byType) {
      if (items.length === 1) {
        const node = buildElementNode(items[0].id, items[0].line, typeName);
        if (node) ul.appendChild(node);
      } else {
        // Type group folder
        const groupLi = document.createElement("li");
        groupLi.className = "tree-node";

        const groupRow = document.createElement("div");
        groupRow.className = "tree-row tree-group";

        const arrow = document.createElement("span");
        arrow.className = "tree-arrow has-children";
        arrow.textContent = "\u25B6";
        groupRow.appendChild(arrow);

        const gicon = document.createElement("span");
        gicon.className = "tree-icon";
        gicon.textContent = getIcon(typeName);
        groupRow.appendChild(gicon);

        const glabel = document.createElement("span");
        glabel.className = "tree-label";
        glabel.textContent = `${typeName} (${items.length})`;
        groupRow.appendChild(glabel);

        groupLi.appendChild(groupRow);

        const groupUl = document.createElement("ul");
        groupUl.className = "tree-children";
        groupUl.style.display = "none";

        // Build all children eagerly
        for (const item of items) {
          const node = buildElementNode(item.id, item.line, typeName);
          if (node) groupUl.appendChild(node);
        }

        let groupExpanded = false;
        arrow.addEventListener("click", (e) => {
          e.stopPropagation();
          groupExpanded = !groupExpanded;
          if (groupExpanded) {
            groupUl.style.display = "";
            arrow.textContent = "\u25BC";
            arrow.classList.add("expanded");
          } else {
            groupUl.style.display = "none";
            arrow.textContent = "\u25B6";
            arrow.classList.remove("expanded");
          }
        });

        groupLi.appendChild(groupUl);
        ul.appendChild(groupLi);
      }
    }
  }
}

function buildElementNode(expressID, line, typeName) {
  const name = getVal(line.Name) || getVal(line.LongName) || `#${expressID}`;

  const li = document.createElement("li");
  li.className = "tree-node";

  const row = document.createElement("div");
  row.className = "tree-row tree-leaf";

  const arrow = document.createElement("span");
  arrow.className = "tree-arrow";
  row.appendChild(arrow);

  const icon = document.createElement("span");
  icon.className = "tree-icon";
  icon.textContent = getIcon(typeName);
  row.appendChild(icon);

  const label = document.createElement("span");
  label.className = "tree-label";
  label.textContent = name;
  label.title = `${typeName} #${expressID}`;
  row.appendChild(label);

  li.appendChild(row);

  // Register in nodeMap
  nodeMap.set(expressID, { row, li });

  label.addEventListener("click", (e) => {
    e.stopPropagation();
    selectByExpressID(expressID);
    window.dispatchEvent(
      new CustomEvent("element-selected", { detail: { expressID } })
    );
  });

  return li;
}

/**
 * Collapse all non-spatial groups (type groups like "WallStandardCase (5)")
 * that were auto-expanded by a previous selection.
 */
function collapseAutoExpanded() {
  if (!treeContainer) return;
  treeContainer.querySelectorAll(".tree-children[data-auto-expanded]").forEach((ul) => {
    ul.style.display = "none";
    ul.removeAttribute("data-auto-expanded");
    const parentLi = ul.parentElement;
    if (parentLi) {
      const arrow = parentLi.querySelector(":scope > .tree-row .tree-arrow");
      if (arrow) {
        arrow.textContent = "\u25B6";
        arrow.classList.remove("expanded");
      }
    }
  });
}

/**
 * Expand all collapsed ancestors of an element so it becomes visible.
 * Marks auto-expanded ULs so they can be collapsed on next selection.
 */
function expandToNode(li) {
  let el = li.parentElement;
  while (el && el !== treeContainer) {
    if (el.tagName === "UL" && el.classList.contains("tree-children") && el.style.display === "none") {
      el.style.display = "";
      el.setAttribute("data-auto-expanded", "1");
      const parentLi = el.parentElement;
      if (parentLi) {
        const parentArrow = parentLi.querySelector(":scope > .tree-row .tree-arrow");
        if (parentArrow) {
          parentArrow.textContent = "\u25BC";
          parentArrow.classList.add("expanded");
        }
      }
    }
    el = el.parentElement;
  }
}

export function highlightTreeByExpressID(expressID) {
  document.querySelectorAll(".tree-row.selected").forEach((el) => el.classList.remove("selected"));

  // Collapse previously auto-expanded groups
  collapseAutoExpanded();

  if (expressID === null) return;

  const entry = nodeMap.get(expressID);
  if (!entry) return;

  // Expand collapsed parents so the node is visible
  expandToNode(entry.li);

  entry.row.classList.add("selected");
  entry.row.scrollIntoView({ block: "nearest", behavior: "smooth" });
}

function getVal(v) {
  if (v === null || v === undefined) return null;
  if (typeof v === "string" || typeof v === "number") return v;
  if (typeof v === "object" && "value" in v) return v.value;
  return null;
}

function getTypeName(line) {
  const cname = line.constructor?.name || "";
  if (cname.startsWith("Ifc")) return cname.substring(3);
  if (cname) return cname;
  return "Element";
}

function isSpatialType(line) {
  const t = line.type;
  return SPATIAL_TYPES.includes(t);
}

function getIcon(typeName) {
  const t = typeName.toLowerCase();
  if (t.includes("project")) return "P";
  if (t.includes("site")) return "S";
  if (t.includes("building") && t.includes("storey")) return "N";
  if (t.includes("building")) return "B";
  if (t.includes("wall")) return "W";
  if (t.includes("slab") || t.includes("roof")) return "R";
  if (t.includes("column")) return "C";
  if (t.includes("beam")) return "=";
  if (t.includes("window")) return "#";
  if (t.includes("door")) return "D";
  if (t.includes("stair")) return "E";
  if (t.includes("railing")) return "|";
  if (t.includes("space")) return "~";
  if (t.includes("furnish")) return "F";
  if (t.includes("opening")) return "O";
  if (t.includes("flow") || t.includes("distrib")) return ">";
  return "*";
}

export function clearTree() {
  if (treeContainer) treeContainer.innerHTML = "";
  nodeMap = new Map();
  aggregatesMap = null;
  containsMap = null;
}
