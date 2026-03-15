/**
 * clipping.js — Plan de coupe interactif
 */

import * as THREE from "three";
import { getRenderer, getScene, getCamera, getControls, getCurrentModel, onRenderLoop } from "../viewer/viewer.js";

let clipPlane = null;
let planeHelper = null;
let active = false;
let flipped = false;
let currentAxis = "y";
let sliderValue = 0.5;

export function initClipping() {
  clipPlane = new THREE.Plane(new THREE.Vector3(0, -1, 0), 0);
}

export function toggleClipping() {
  active = !active;
  const renderer = getRenderer();
  if (active) {
    renderer.clippingPlanes = [clipPlane];
    updatePlaneFromSlider();
    showHelper();
  } else {
    renderer.clippingPlanes = [];
    hideHelper();
  }
  return active;
}

export function isClippingActive() { return active; }

export function setClipAxis(axis) {
  currentAxis = axis;
  flipped = false;
  updatePlaneFromSlider();
}

export function flipClipDirection() {
  flipped = !flipped;
  updatePlaneFromSlider();
}

export function setClipSlider(value) {
  sliderValue = value;
  if (active) updatePlaneFromSlider();
}

function updatePlaneFromSlider() {
  const group = getCurrentModel();
  if (!group) return;
  const box = new THREE.Box3().setFromObject(group);
  const min = box.min;
  const max = box.max;

  const normal = new THREE.Vector3();
  let constant;
  const t = sliderValue;

  if (currentAxis === "x") {
    normal.set(flipped ? 1 : -1, 0, 0);
    constant = (flipped ? -1 : 1) * THREE.MathUtils.lerp(min.x, max.x, t);
  } else if (currentAxis === "y") {
    normal.set(0, flipped ? 1 : -1, 0);
    constant = (flipped ? -1 : 1) * THREE.MathUtils.lerp(min.y, max.y, t);
  } else {
    normal.set(0, 0, flipped ? 1 : -1);
    constant = (flipped ? -1 : 1) * THREE.MathUtils.lerp(min.z, max.z, t);
  }

  clipPlane.set(normal, constant);
  updateHelper();
}

function showHelper() {
  const scene = getScene();
  if (planeHelper) scene.remove(planeHelper);
  const group = getCurrentModel();
  if (!group) return;
  const box = new THREE.Box3().setFromObject(group);
  const size = box.getSize(new THREE.Vector3());
  const maxSize = Math.max(size.x, size.y, size.z) * 1.2;
  planeHelper = new THREE.PlaneHelper(clipPlane, maxSize, 0x4a9eff);
  planeHelper.name = "clipHelper";
  scene.add(planeHelper);
}

function updateHelper() {
  if (!planeHelper) return;
  const scene = getScene();
  scene.remove(planeHelper);
  showHelper();
}

function hideHelper() {
  if (planeHelper) {
    getScene().remove(planeHelper);
    planeHelper = null;
  }
}
