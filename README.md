# IFC Visu v2

Visualiseur 3D pour fichiers IFC avec validation IDS et export Power BI.
Fonctionne en local et sur GitHub Pages — aucun serveur requis.

![IFC Visu v2](https://img.shields.io/badge/IFC-Visu_v2-blue) ![Three.js](https://img.shields.io/badge/Three.js-0.175-green) ![web--ifc](https://img.shields.io/badge/web--ifc-0.0.74-orange)

## Fonctionnalites

- **Viewer 3D** — Rendu IFC complet (web-ifc + Three.js)
- **Arborescence IFC** — Project > Site > Building > Storey > Elements
- **Selection** — Clic 3D avec synchronisation arborescence
- **Mesures** — Distance point-a-point en 3D
- **Plans de coupe** — Sectioning X/Y/Z avec slider
- **X-Ray** — Mode transparence
- **Isoler / Masquer** — Affichage selectif
- **Validation IDS** — Conformite par fichier `.ids` (rouge/vert/gris)
- **Dashboard IDS** — Jauge, graphiques, tableau filtrable
- **Export Power BI** — Fichier XLSX 5 onglets (elements, proprietes, materiaux, synthese, guide)
- **Panneaux redimensionnables** — Glisser pour ajuster la largeur

## Demarrage rapide

### Prerequis

- [Node.js](https://nodejs.org) v18 ou superieur (inclut npm)

### Installation

```bash
git clone https://github.com/VOTRE_USERNAME/IFC-Visu.git
cd IFC-Visu
npm install
```

> `npm install` copie automatiquement les fichiers WASM de web-ifc dans `public/`.

### Lancer le serveur de dev

```bash
npm run dev
```

Ouvrir http://localhost:5173/IFC-Visu/

### Build pour production

```bash
npm run build
```

Le dossier `dist/` est pret pour le deploiement.

## Utilisation

1. **Charger IFC** — Cliquer le bouton ou glisser un fichier `.ifc`
2. **Explorer** — Arborescence a gauche, clic 3D pour selectionner
3. **Outils** — Selection (S), Mesurer (M), Coupe (C), X-Ray (X)
4. **Affichage** — Isoler (I), Masquer (H), Afficher tout (A), Filaire (W)
5. **IDS** — Charger un `.ids` pour valider la conformite
6. **Export** — XLSX pour Power BI, JSON pour integration

### Raccourcis clavier

| Touche | Action |
|--------|--------|
| S | Selection |
| M | Mesurer |
| C | Coupe |
| X | X-Ray |
| W | Filaire |
| I | Isoler |
| H | Masquer |
| A | Tout afficher |
| F | Ajuster vue |
| Escape | Deselectionner |

## Export Power BI (XLSX)

Le fichier XLSX genere contient 5 onglets :

| Onglet | Contenu |
|--------|---------|
| 01_Elements | 26 colonnes par element IFC (ID, GUID, type, niveau, materiau, completude...) |
| 02_Proprietes | 1 ligne par propriete (jointure sur ExpressID) |
| 03_Materiaux | Associations element-materiau |
| 04_Synthese | Tableaux croises, audit completude, top materiaux |
| 05_Guide_PowerBI | Mode d'emploi pour importer dans Power BI Desktop |

## Structure du projet

```
IFC-Visu/
├── index.html              # Page principale
├── vite.config.js          # Configuration Vite
├── package.json            # Dependances
├── public/
│   └── favicon.svg         # Icone
├── src/
│   ├── main.js             # Point d'entree — wiring de tous les modules
│   ├── style.css           # Styles (dark theme)
│   ├── viewer/
│   │   └── viewer.js       # Core viewer (Three.js + web-ifc)
│   ├── tools/
│   │   ├── selection.js    # Selection 3D (raycaster)
│   │   ├── clipping.js     # Plans de coupe
│   │   ├── measurement.js  # Mesures distance
│   │   ├── transparency.js # Mode X-Ray
│   │   └── panel-resize.js # Panneaux redimensionnables
│   ├── panels/
│   │   ├── properties.js   # Panneau proprietes IFC
│   │   ├── tree.js         # Arborescence IFC
│   │   ├── ids-validator.js # Validation IDS
│   │   └── ids-dashboard.js # Dashboard IDS
│   └── export/
│       └── powerbi.js      # Export XLSX / JSON Power BI
├── scripts/
│   └── copy-wasm.js        # Copie automatique des WASM (postinstall)
└── examples/
    └── convention-nommage.ids  # Exemple de fichier IDS
```

## Deploiement GitHub Pages

```bash
npm run build
```

Puis dans les settings du repo GitHub :
**Settings > Pages > Source > Deploy from branch > main > /dist**

L'app sera accessible a `https://VOTRE_USERNAME.github.io/IFC-Visu/`

## Technologies

- **[Three.js](https://threejs.org/)** v0.175 — Moteur 3D WebGL
- **[web-ifc](https://github.com/IFCjs/web-ifc)** v0.0.74 — Parser IFC (WASM)
- **[Chart.js](https://www.chartjs.org/)** v4.5 — Graphiques dashboard
- **[SheetJS](https://sheetjs.com/)** — Export Excel XLSX
- **[Vite](https://vitejs.dev/)** v6 — Build tool

## Licence

MIT
