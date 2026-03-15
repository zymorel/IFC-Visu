/**
 * measurement.js — Outil de mesure de distance entre deux points
 */

import * as THREE from "three";
import { getCamera, getScene, getCurrentModel, onRenderLoop } from "../viewer/viewer.js";

const raycaster = new THREE.Raycaster();
const pointer = new THREE.Vector2();
const markerMat = new THREE.MeshBasicMaterial({ color: 0xff4444, depthTest: false });
const lineMat = new THREE.LineBasicMaterial({ color: 0xff4444, depthTest: false });

let active = false;
let pointA = null;
let measurements = [];
let labelEl = null;

export function initMeasurement(canvas) {
  labelEl = document.getElementById("measurement-label");

  canvas.addEventListener("pointerup", (e) => {
    if (!active) return;
    const rect = canvas.getBoundingClientRect();
    pointer.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
    pointer.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;

    const camera = getCamera();
    const group = getCurrentModel();
    if (!camera || !group) return;

    raycaster.setFromCamera(pointer, camera);
    const intersects = raycaster.intersectObjects(group.children, false);
    const hit = intersects.find((i) => i.object.visible);
    if (!hit) return;

    if (!pointA) {
      pointA = hit.point.clone();
      addMarker(pointA);
    } else {
      const pointB = hit.point.clone();
      addMarker(pointB);
      addLine(pointA, pointB);
      const dist = pointA.distanceTo(pointB);
      addMeasurementLabel(pointA, pointB, dist);
      pointA = null;
    }
  });

  onRenderLoop(updateLabels);
}

function addMarker(position) {
  const sphere = new THREE.Mesh(
    new THREE.SphereGeometry(0.08, 12, 12),
    markerMat
  );
  sphere.position.copy(position);
  sphere.renderOrder = 999;
  sphere.name = "measureMarker";
  getScene().add(sphere);
  measurements.push(sphere);
}

function addLine(a, b) {
  const geometry = new THREE.BufferGeometry().setFromPoints([a, b]);
  const line = new THREE.Line(geometry, lineMat);
  line.renderOrder = 999;
  line.name = "measureLine";
  getScene().add(line);
  measurements.push(line);
}

function addMeasurementLabel(a, b, dist) {
  const mid = a.clone().add(b).multiplyScalar(0.5);
  const label = document.createElement("div");
  label.className = "measure-label";
  label.textContent = formatDistance(dist);
  label.dataset.wx = mid.x;
  label.dataset.wy = mid.y;
  label.dataset.wz = mid.z;
  document.getElementById("viewer-container").appendChild(label);
  measurements.push({ type: "label", el: label, pos: mid });
}

function formatDistance(d) {
  if (d >= 1) return d.toFixed(2) + " m";
  return (d * 100).toFixed(1) + " cm";
}

function updateLabels() {
  const camera = getCamera();
  if (!camera) return;
  for (const item of measurements) {
    if (item.type !== "label") continue;
    const pos = item.pos.clone().project(camera);
    const canvas = document.getElementById("three-canvas");
    if (!canvas) continue;
    const x = (pos.x * 0.5 + 0.5) * canvas.clientWidth;
    const y = (-pos.y * 0.5 + 0.5) * canvas.clientHeight;
    if (pos.z > 1) {
      item.el.style.display = "none";
    } else {
      item.el.style.display = "";
      item.el.style.left = x + "px";
      item.el.style.top = y + "px";
    }
  }
}

export function toggleMeasureTool() {
  active = !active;
  pointA = null;
  const canvas = document.getElementById("three-canvas");
  if (canvas) canvas.style.cursor = active ? "crosshair" : "";
  return active;
}

export function isMeasureActive() { return active; }

export function clearMeasurements() {
  const scene = getScene();
  for (const item of measurements) {
    if (item.type === "label") {
      item.el.remove();
    } else {
      scene.remove(item);
      if (item.geometry) item.geometry.dispose();
    }
  }
  measurements = [];
  pointA = null;
}
