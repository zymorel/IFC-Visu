/**
 * ids-editor.js — Visualiseur et éditeur de fichiers IDS
 */

let currentData = null;

/* ========== Public API ========== */

export function renderIDSEditor(container, parsedIDS) {
  currentData = JSON.parse(JSON.stringify(parsedIDS)); // deep clone
  container.innerHTML = "";
  container.appendChild(buildEditor(currentData));
}

export function exportIDS(data) {
  const src = data || currentData;
  if (!src) return;
  const xml  = generateIDS(src);
  const blob = new Blob([xml], { type: "application/xml;charset=utf-8" });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement("a");
  a.href     = url;
  a.download = `${(src.info?.title || "ids").replace(/[^a-z0-9]/gi, "_")}.ids`;
  a.click();
  URL.revokeObjectURL(url);
}

/* ========== Builder ========== */

function buildEditor(data) {
  const wrap = document.createElement("div");
  wrap.className = "ids-ed-wrap";

  // Header — IDS info
  const hdr = document.createElement("div");
  hdr.className = "ids-ed-header";
  hdr.innerHTML = `
    <div class="ids-ed-info-fields">
      <div class="ids-ed-field-row">
        <label class="ids-ed-lbl">Titre</label>
        <input class="ids-ed-input ids-ed-title" value="${esc(data.info?.title || "")}" placeholder="Titre de l'IDS" data-path="info.title"/>
      </div>
      <div class="ids-ed-field-row">
        <label class="ids-ed-lbl">Auteur</label>
        <input class="ids-ed-input" value="${esc(data.info?.author || "")}" placeholder="Auteur" data-path="info.author"/>
        <label class="ids-ed-lbl" style="margin-left:16px">Version</label>
        <input class="ids-ed-input ids-ed-short" value="${esc(data.info?.version || "")}" placeholder="0.1" data-path="info.version"/>
      </div>
    </div>
    <div class="ids-ed-header-actions">
      <button class="ids-ed-btn ids-ed-btn-secondary" id="ids-ed-add-spec">+ Ajouter spécification</button>
      <button class="ids-ed-btn ids-ed-btn-primary" id="ids-ed-export">⬇ Exporter IDS</button>
    </div>`;

  hdr.querySelectorAll("input[data-path]").forEach(inp => {
    inp.addEventListener("input", () => setPath(data, inp.dataset.path, inp.value));
  });

  wrap.appendChild(hdr);

  // Specs list
  const specsWrap = document.createElement("div");
  specsWrap.className = "ids-ed-specs";
  wrap.appendChild(specsWrap);

  const rerender = () => {
    specsWrap.innerHTML = "";
    data.specifications.forEach((spec, idx) => {
      specsWrap.appendChild(buildSpecCard(spec, idx, data, rerender));
    });
  };
  rerender();

  hdr.querySelector("#ids-ed-add-spec").addEventListener("click", () => {
    data.specifications.push({
      name: "Nouvelle spécification",
      description: "",
      ifcVersion: "IFC4X3",
      applicability: { facets: [{ type: "entity", name: { type: "simple", value: "IFCWALL" }, predefinedType: null }] },
      requirements: { facets: [] },
    });
    rerender();
    specsWrap.lastElementChild?.scrollIntoView({ behavior: "smooth" });
  });

  hdr.querySelector("#ids-ed-export").addEventListener("click", () => exportIDS(data));

  return wrap;
}

function buildSpecCard(spec, idx, data, rerender) {
  const card = document.createElement("div");
  card.className = "ids-ed-card";

  // Card header
  const cardHdr = document.createElement("div");
  cardHdr.className = "ids-ed-card-hdr";
  cardHdr.innerHTML = `
    <div class="ids-ed-card-title-row">
      <span class="ids-ed-num">Spéc ${idx + 1}</span>
      <input class="ids-ed-input ids-ed-spec-name" value="${esc(spec.name || "")}" placeholder="Nom de la spécification"/>
      <select class="ids-ed-select ids-ed-version">
        <option value="IFC2X3"  ${spec.ifcVersion === "IFC2X3"  ? "selected" : ""}>IFC2X3</option>
        <option value="IFC4"    ${spec.ifcVersion === "IFC4"    ? "selected" : ""}>IFC4</option>
        <option value="IFC4X3"  ${(!spec.ifcVersion || spec.ifcVersion === "IFC4X3") ? "selected" : ""}>IFC4X3</option>
      </select>
      <button class="ids-ed-btn-icon ids-ed-del-spec" title="Supprimer cette spécification">✕</button>
    </div>
    <textarea class="ids-ed-textarea" placeholder="Description (optionnel)">${esc(spec.description || "")}</textarea>`;

  cardHdr.querySelector(".ids-ed-spec-name").addEventListener("input", e => { spec.name = e.target.value; });
  cardHdr.querySelector(".ids-ed-version").addEventListener("change",  e => { spec.ifcVersion = e.target.value; });
  cardHdr.querySelector(".ids-ed-textarea").addEventListener("input",  e => { spec.description = e.target.value; });
  cardHdr.querySelector(".ids-ed-del-spec").addEventListener("click",  () => {
    data.specifications.splice(idx, 1);
    rerender();
  });
  card.appendChild(cardHdr);

  // Two-col: applicability + requirements
  const twoCol = document.createElement("div");
  twoCol.className = "ids-ed-two-col";

  twoCol.appendChild(buildFacetSection("Applicabilité", spec, "applicability"));
  twoCol.appendChild(buildFacetSection("Exigences",     spec, "requirements"));
  card.appendChild(twoCol);

  return card;
}

function buildFacetSection(label, spec, side) {
  const section = document.createElement("div");
  section.className = "ids-ed-facet-section";

  const title = document.createElement("div");
  title.className = "ids-ed-facet-title";
  title.textContent = label;
  section.appendChild(title);

  const list = document.createElement("div");
  list.className = "ids-ed-facet-list";
  section.appendChild(list);

  const addBtn = document.createElement("button");
  addBtn.className = "ids-ed-btn ids-ed-btn-sm";
  addBtn.textContent = "+ Ajouter";
  section.appendChild(addBtn);

  const renderFacets = () => {
    list.innerHTML = "";
    const facets = spec[side].facets;
    facets.forEach((facet, fi) => {
      list.appendChild(buildFacetRow(facet, fi, facets, renderFacets));
    });
  };
  renderFacets();

  addBtn.addEventListener("click", () => {
    spec[side].facets.push({ type: "property", propertySet: { type: "simple", value: "" }, baseName: { type: "simple", value: "" }, value: null });
    renderFacets();
  });

  return section;
}

function buildFacetRow(facet, fi, facets, renderFacets) {
  const row = document.createElement("div");
  row.className = "ids-ed-facet-row";

  // Type selector
  const typeEl = document.createElement("select");
  typeEl.className = "ids-ed-facet-type";
  const typeOpts = [
    ["entity",         "Entité"],
    ["attribute",      "Attribut"],
    ["property",       "Propriété"],
    ["classification", "Classification"],
    ["material",       "Matériau"],
  ];
  typeOpts.forEach(([val, lbl]) => {
    const opt = document.createElement("option");
    opt.value = val; opt.textContent = lbl;
    if (facet.type === val) opt.selected = true;
    typeEl.appendChild(opt);
  });
  typeEl.addEventListener("change", () => {
    // Reset and re-type
    const newType = typeEl.value;
    Object.keys(facet).forEach(k => { if (k !== "type") delete facet[k]; });
    facet.type = newType;
    renderFacets();
  });
  row.appendChild(typeEl);

  // Fields
  const fieldsEl = buildFacetFields(facet);
  row.appendChild(fieldsEl);

  // Delete
  const delBtn = document.createElement("button");
  delBtn.className = "ids-ed-btn-icon";
  delBtn.title = "Supprimer";
  delBtn.textContent = "✕";
  delBtn.addEventListener("click", () => {
    facets.splice(fi, 1);
    renderFacets();
  });
  row.appendChild(delBtn);

  return row;
}

function buildFacetFields(facet) {
  const wrap = document.createElement("div");
  wrap.className = "ids-ed-facet-fields";
  const sv = v => (v?.type === "simple" ? v.value : "") || "";

  const addField = (placeholder, fieldKey, value) => {
    const inp = document.createElement("input");
    inp.className = "ids-ed-input";
    inp.placeholder = placeholder;
    inp.value = value;
    inp.addEventListener("input", () => { facet[fieldKey] = { type: "simple", value: inp.value }; });
    wrap.appendChild(inp);
  };

  switch (facet.type) {
    case "entity":
      addField("Type IFC (ex: IFCWALL)", "name", sv(facet.name));
      break;
    case "attribute":
      addField("Attribut (ex: Name)",      "name",  sv(facet.name));
      addField("Valeur (optionnel)",        "value", sv(facet.value));
      break;
    case "property":
      addField("Pset (ex: Pset_WallCommon)", "propertySet", sv(facet.propertySet));
      addField("Propriété (ex: LoadBearing)","baseName",    sv(facet.baseName));
      addField("Valeur (optionnel)",         "value",       sv(facet.value));
      break;
    case "classification":
      addField("Système (ex: Uniformat)", "system", sv(facet.system));
      addField("Code (ex: B2010)",        "value",  sv(facet.value));
      break;
    case "material":
      addField("Matériau (ex: Concrete)", "value", sv(facet.value));
      break;
    default: {
      const s = document.createElement("span");
      s.className = "ids-ed-muted";
      s.textContent = "Type non supporté";
      wrap.appendChild(s);
    }
  }
  return wrap;
}

/* ========== IDS XML Generator ========== */

function generateIDS(data) {
  const info = data.info || {};
  let xml  = `<?xml version="1.0" encoding="UTF-8"?>\n`;
  xml += `<ids xmlns="http://standards.buildingsmart.org/IDS">\n`;
  xml += `  <info>\n`;
  xml += `    <title>${x(info.title || "IDS")}</title>\n`;
  if (info.version) xml += `    <version>${x(info.version)}</version>\n`;
  if (info.author)  xml += `    <author>${x(info.author)}</author>\n`;
  xml += `  </info>\n`;
  xml += `  <specifications>\n`;

  for (const spec of (data.specifications || [])) {
    const attrs = [
      `name="${x(spec.name || "")}"`,
      spec.description ? `description="${x(spec.description)}"` : "",
      `ifcVersion="${x(spec.ifcVersion || "IFC4X3")}"`,
    ].filter(Boolean).join(" ");

    xml += `    <specification ${attrs}>\n`;
    xml += `      <applicability>\n`;
    for (const f of (spec.applicability?.facets || [])) xml += facetXML(f, 8);
    xml += `      </applicability>\n`;
    xml += `      <requirements>\n`;
    for (const f of (spec.requirements?.facets || [])) xml += facetXML(f, 8);
    xml += `      </requirements>\n`;
    xml += `    </specification>\n`;
  }

  xml += `  </specifications>\n`;
  xml += `</ids>`;
  return xml;
}

function facetXML(facet, indent) {
  const pad = " ".repeat(indent);
  const sv  = v => v ? `<simpleValue>${x(v?.value ?? v)}</simpleValue>` : "";

  switch (facet.type) {
    case "entity":
      return `${pad}<entity>\n${pad}  <name>${sv(facet.name)}</name>\n${pad}</entity>\n`;
    case "attribute": {
      let out = `${pad}<attribute>\n${pad}  <name>${sv(facet.name)}</name>\n`;
      if (facet.value?.value) out += `${pad}  <value>${sv(facet.value)}</value>\n`;
      return out + `${pad}</attribute>\n`;
    }
    case "property": {
      let out = `${pad}<property>\n`;
      out += `${pad}  <propertySet>${sv(facet.propertySet)}</propertySet>\n`;
      out += `${pad}  <baseName>${sv(facet.baseName)}</baseName>\n`;
      if (facet.value?.value) out += `${pad}  <value>${sv(facet.value)}</value>\n`;
      return out + `${pad}</property>\n`;
    }
    case "classification": {
      let out = `${pad}<classification>\n`;
      if (facet.system?.value) out += `${pad}  <system>${sv(facet.system)}</system>\n`;
      if (facet.value?.value)  out += `${pad}  <value>${sv(facet.value)}</value>\n`;
      return out + `${pad}</classification>\n`;
    }
    case "material":
      return `${pad}<material>\n${pad}  <value>${sv(facet.value)}</value>\n${pad}</material>\n`;
    default:
      return "";
  }
}

/* ========== Utils ========== */

function setPath(obj, path, value) {
  const parts = path.split(".");
  let cur = obj;
  for (let i = 0; i < parts.length - 1; i++) {
    if (cur[parts[i]] == null) cur[parts[i]] = {};
    cur = cur[parts[i]];
  }
  cur[parts[parts.length - 1]] = value;
}

function esc(str) {
  return String(str || "")
    .replace(/&/g, "&amp;").replace(/</g, "&lt;")
    .replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function x(str) { return esc(str); }
