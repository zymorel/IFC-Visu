/**
 * panel-resize.js — Drag to resize panels
 */

export function initPanelResize() {
  setupResize("resize-tree", "tree-panel", "left");
  setupResize("resize-ids", "ids-panel", "right");
  setupResize("resize-props", "properties-panel", "right");

  // Observe panel visibility to show/hide resize handles
  observePanel("ids-panel", "resize-ids");
  observePanel("properties-panel", "resize-props");
}

function setupResize(handleId, panelId, side) {
  const handle = document.getElementById(handleId);
  const panel = document.getElementById(panelId);
  if (!handle || !panel) return;

  let startX = 0;
  let startWidth = 0;
  let dragging = false;

  handle.addEventListener("pointerdown", (e) => {
    e.preventDefault();
    dragging = true;
    startX = e.clientX;
    startWidth = panel.getBoundingClientRect().width;
    handle.classList.add("dragging");
    handle.setPointerCapture(e.pointerId);
    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";
  });

  handle.addEventListener("pointermove", (e) => {
    if (!dragging) return;
    const dx = e.clientX - startX;
    let newWidth;
    if (side === "left") {
      newWidth = startWidth + dx;
    } else {
      newWidth = startWidth - dx;
    }
    // Clamp
    const min = parseInt(getComputedStyle(panel).minWidth) || 150;
    const max = parseInt(getComputedStyle(panel).maxWidth) || 600;
    newWidth = Math.max(min, Math.min(max, newWidth));
    panel.style.width = newWidth + "px";
  });

  handle.addEventListener("pointerup", (e) => {
    if (!dragging) return;
    dragging = false;
    handle.classList.remove("dragging");
    handle.releasePointerCapture(e.pointerId);
    document.body.style.cursor = "";
    document.body.style.userSelect = "";
    // Trigger resize for Three.js canvas
    window.dispatchEvent(new Event("resize"));
  });
}

function observePanel(panelId, handleId) {
  const panel = document.getElementById(panelId);
  const handle = document.getElementById(handleId);
  if (!panel || !handle) return;

  const observer = new MutationObserver(() => {
    const isHidden = panel.classList.contains("hidden");
    handle.style.display = isHidden ? "none" : "block";
  });

  observer.observe(panel, { attributes: true, attributeFilter: ["class"] });

  // Initial state
  handle.style.display = panel.classList.contains("hidden") ? "none" : "block";
}
