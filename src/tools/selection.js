/**
 * selection.js — Sélection par clic + highlight + isoler/masquer
 */

import * as THREE from "three";
import { getCamera, getScene, getCurrentModel } from "../viewer/viewer.js";

const raycaster = new THREE.Raycaster();
const pointer = new THREE.Vector2();
const highlightMat = new THREE.MeshPhongMaterial({
  color: 0x4a9eff,
  emissive: 0x1a3a6a,
  opacity: 0.85,
  transparent: true,
  side: THREE.DoubleSide,
  depthWrite: true,
});

let selectedExpressID = null;
let hiddenMeshes = new Set();
let enabled = true;
let pointerDownPos = null;

export function initSelection(canvas) {
  canvas.addEventListener("pointerdown", (e) => {
    pointerDownPos = { x: e.clientX, y: e.clientY };
  });

  canvas.addEventListener("pointerup", (e) => {
    if (!enabled || !pointerDownPos) return;
    const dx = e.clientX - pointerDownPos.x;
    const dy = e.clientY - pointerDownPos.y;
    if (Math.abs(dx) > 5 || Math.abs(dy) > 5) return;

    const rect = canvas.getBoundingClientRect();
    pointer.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
    pointer.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;

    const camera = getCamera();
    const group = getCurrentModel();
    if (!camera || !group) return;

    raycaster.setFromCamera(pointer, camera);
    const intersects = raycaster.intersectObjects(group.children, false);
    const hit = intersects.find((i) => i.object.visible);

    if (hit) {
      const expressID = hit.object.userData.expressID;
      selectByExpressID(expressID);
      window.dispatchEvent(
        new CustomEvent("element-selected", { detail: { expressID, point: hit.point } })
      );
    } else {
      deselectAll();
      window.dispatchEvent(new CustomEvent("element-deselected"));
    }
  });
}

export function selectByExpressID(expressID) {
  deselectAll(false);
  selectedExpressID = expressID;
  const group = getCurrentModel();
  if (!group) return;
  group.traverse((child) => {
    if (child.isMesh && child.userData.expressID === expressID) {
      child.material = highlightMat;
    }
  });
}

export function deselectAll(fireEvent = true) {
  if (selectedExpressID === null) return;
  const group = getCurrentModel();
  if (group) {
    group.traverse((child) => {
      if (child.isMesh && child.userData.expressID === selectedExpressID) {
        child.material = child.userData.originalMaterial;
      }
    });
  }
  selectedExpressID = null;
  if (fireEvent) {
    window.dispatchEvent(new CustomEvent("element-deselected"));
  }
}

export function getSelectedExpressID() { return selectedExpressID; }

export function isolateSelected() {
  const group = getCurrentModel();
  if (!group || selectedExpressID === null) return;
  group.traverse((child) => {
    if (child.isMesh) {
      if (child.userData.expressID !== selectedExpressID) {
        child.visible = false;
        hiddenMeshes.add(child);
      }
    }
  });
}

export function hideSelected() {
  const group = getCurrentModel();
  if (!group || selectedExpressID === null) return;
  group.traverse((child) => {
    if (child.isMesh && child.userData.expressID === selectedExpressID) {
      child.visible = false;
      hiddenMeshes.add(child);
    }
  });
  deselectAll();
}

export function showAll() {
  for (const mesh of hiddenMeshes) {
    mesh.visible = true;
  }
  hiddenMeshes.clear();
}

export function setSelectionEnabled(val) { enabled = val; }
