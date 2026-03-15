/**
 * transparency.js — Mode X-Ray (transparence globale)
 */

import { getCurrentModel } from "../viewer/viewer.js";

let active = false;
const XRAY_OPACITY = 0.15;

export function toggleTransparency() {
  active = !active;
  const group = getCurrentModel();
  if (!group) return active;

  group.traverse((child) => {
    if (!child.isMesh) return;
    const mat = child.userData.originalMaterial;
    if (!mat) return;

    if (active) {
      mat.transparent = true;
      mat.opacity = XRAY_OPACITY;
      mat.depthWrite = false;
    } else {
      const origOpacity = child.userData.originalOpacity ?? 1;
      mat.opacity = origOpacity;
      mat.transparent = origOpacity < 1.0;
      mat.depthWrite = origOpacity >= 1.0;
    }
    mat.needsUpdate = true;
  });

  return active;
}

export function isTransparencyActive() { return active; }
