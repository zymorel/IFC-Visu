/**
 * viewer.js — Viewer IFC basé sur web-ifc + Three.js pur
 */

import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import * as WebIFC from "web-ifc";

let renderer = null;
let scene = null;
let camera = null;
let controls = null;
let ifcApi = null;
let currentGroup = null;
let currentModelId = null;
const renderCallbacks = [];

export async function initViewer(canvas) {
  renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setSize(canvas.clientWidth, canvas.clientHeight);
  renderer.localClippingEnabled = true;

  scene = new THREE.Scene();
  scene.background = new THREE.Color("#1a1d23");

  camera = new THREE.PerspectiveCamera(
    45, canvas.clientWidth / canvas.clientHeight, 0.1, 1e6
  );
  camera.position.set(30, 30, 30);

  controls = new OrbitControls(camera, canvas);
  controls.enableDamping = true;
  controls.dampingFactor = 0.1;
  controls.target.set(0, 0, 0);

  const ambientLight = new THREE.AmbientLight(0xffffff, 0.6);
  scene.add(ambientLight);
  const dirLight = new THREE.DirectionalLight(0xffffff, 1.0);
  dirLight.position.set(50, 80, 50);
  scene.add(dirLight);
  const hemiLight = new THREE.HemisphereLight(0xffffff, 0x444444, 0.4);
  scene.add(hemiLight);

  const grid = new THREE.GridHelper(100, 50, 0x444444, 0x333333);
  grid.name = "grid";
  scene.add(grid);

  const base = import.meta.env.BASE_URL || "/";
  ifcApi = new WebIFC.IfcAPI();
  ifcApi.SetWasmPath(base, true);
  await ifcApi.Init();
  try { ifcApi.SetLogLevel(6); } catch { /* */ }

  function animate() {
    requestAnimationFrame(animate);
    controls.update();
    for (const cb of renderCallbacks) cb();
    renderer.render(scene, camera);
  }
  animate();

  const resizeObserver = new ResizeObserver(() => {
    const w = canvas.clientWidth;
    const h = canvas.clientHeight;
    renderer.setSize(w, h);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  });
  resizeObserver.observe(canvas.parentElement);

  return { scene, camera, controls, ifcApi, renderer };
}

export async function loadIFC(file, onLoad) {
  if (!ifcApi || !scene) throw new Error("Viewer non initialisé");

  const buffer = await file.arrayBuffer();
  const data = new Uint8Array(buffer);

  if (currentGroup) {
    scene.remove(currentGroup);
    currentGroup.traverse((child) => {
      if (child.isMesh) {
        child.geometry.dispose();
        if (child.material !== child.userData.originalMaterial) {
          child.material.dispose();
        }
      }
    });
    currentGroup = null;
  }
  if (currentModelId !== null) {
    ifcApi.CloseModel(currentModelId);
    currentModelId = null;
  }

  currentModelId = ifcApi.OpenModel(data);

  currentGroup = new THREE.Group();
  const meshMaterials = new Map();

  ifcApi.StreamAllMeshes(currentModelId, (mesh) => {
    const placedGeometries = mesh.geometries;
    for (let i = 0; i < placedGeometries.size(); i++) {
      const pg = placedGeometries.get(i);
      const geomData = ifcApi.GetGeometry(currentModelId, pg.geometryExpressID);

      const verts = ifcApi.GetVertexArray(
        geomData.GetVertexData(), geomData.GetVertexDataSize()
      );
      const indices = ifcApi.GetIndexArray(
        geomData.GetIndexData(), geomData.GetIndexDataSize()
      );
      if (verts.length === 0 || indices.length === 0) continue;

      const geometry = new THREE.BufferGeometry();
      const posArr = new Float32Array(verts.length / 2);
      const normArr = new Float32Array(verts.length / 2);
      for (let j = 0; j < verts.length; j += 6) {
        const idx = j / 2;
        posArr[idx] = verts[j];
        posArr[idx + 1] = verts[j + 1];
        posArr[idx + 2] = verts[j + 2];
        normArr[idx] = verts[j + 3];
        normArr[idx + 1] = verts[j + 4];
        normArr[idx + 2] = verts[j + 5];
      }
      geometry.setAttribute("position", new THREE.BufferAttribute(posArr, 3));
      geometry.setAttribute("normal", new THREE.BufferAttribute(normArr, 3));
      geometry.setIndex(new THREE.BufferAttribute(indices, 1));

      const color = pg.color;
      const colorKey = `${color.x.toFixed(3)}_${color.y.toFixed(3)}_${color.z.toFixed(3)}_${color.w.toFixed(3)}`;

      let material;
      if (meshMaterials.has(colorKey)) {
        material = meshMaterials.get(colorKey);
      } else {
        material = new THREE.MeshPhongMaterial({
          color: new THREE.Color(color.x, color.y, color.z),
          opacity: color.w,
          transparent: color.w < 1.0,
          side: THREE.DoubleSide,
          depthWrite: color.w >= 1.0,
        });
        meshMaterials.set(colorKey, material);
      }

      const threeMesh = new THREE.Mesh(geometry, material);
      threeMesh.userData.expressID = mesh.expressID;
      threeMesh.userData.originalMaterial = material;
      threeMesh.userData.originalOpacity = color.w;

      const mat = pg.flatTransformation;
      const matrix = new THREE.Matrix4().fromArray(mat);
      threeMesh.applyMatrix4(matrix);

      currentGroup.add(threeMesh);
    }
  });

  scene.add(currentGroup);
  console.log("[IFC] Meshes créés:", currentGroup.children.length);

  if (onLoad) onLoad(currentGroup);
  return currentGroup;
}

export function fitToModel() {
  if (!currentGroup || !camera || !controls) return;
  const box = new THREE.Box3().setFromObject(currentGroup);
  if (box.isEmpty()) return;
  const center = box.getCenter(new THREE.Vector3());
  const size = box.getSize(new THREE.Vector3());
  const maxDim = Math.max(size.x, size.y, size.z);
  const distance = maxDim * 1.5;
  camera.position.set(
    center.x + distance,
    center.y + distance * 0.7,
    center.z + distance
  );
  controls.target.copy(center);
  camera.near = maxDim * 0.001;
  camera.far = maxDim * 100;
  camera.updateProjectionMatrix();
  controls.update();
}

export function toggleWireframe(enabled) {
  if (!currentGroup) return false;
  currentGroup.traverse((child) => {
    if (child.isMesh) {
      child.userData.originalMaterial.wireframe = enabled;
    }
  });
  return true;
}

export function onRenderLoop(cb) { renderCallbacks.push(cb); }
export function getCurrentModel() { return currentGroup; }
export function getCurrentModelId() { return currentModelId; }
export function getIfcApi() { return ifcApi; }
export function getScene() { return scene; }
export function getCamera() { return camera; }
export function getRenderer() { return renderer; }
export function getControls() { return controls; }
