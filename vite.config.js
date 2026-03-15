import { defineConfig } from "vite";

export default defineConfig({
  // Changer "IFC-Visu" par le nom exact de ton repo GitHub pour GitHub Pages
  base: "/IFC-Visu/",

  build: {
    outDir: "dist",
    target: "esnext",
  },

  optimizeDeps: {
    exclude: ["web-ifc"],
  },

  // Pas de headers COOP/COEP → web-ifc utilise le mode single-thread
  // (plus simple, suffisant pour la visualisation, évite les bugs MT)
});
