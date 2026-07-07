# Ons Nieuwe Huis — ZoekDePot

Een 3D-walkthrough van appartement **type R3.sp, bouwnummer 25** (Ypsilon Park,
Den Haag), gebouwd met [Three.js](https://threejs.org/). Loop door de
plattegrond, probeer muurkleuren, vloeren en lichtsferen — en deel je favoriete
combinatie via een link.

## Openen

De app is één statisch bestand. Open `index.html` direct in de browser, of
serveer de map lokaal:

```sh
python3 -m http.server
# → http://localhost:8000/
```

Three.js wordt via CDN (unpkg) geladen, dus er is een internetverbinding nodig.

## Besturing

| | Desktop | Mobiel |
|---|---|---|
| Lopen | WASD / pijltjes | joystick (linksonder) of **tik waar je heen wilt** |
| Rondkijken | muis (klik voor pointer lock) | vegen op de rechterhelft |
| Plattegrond | **M** | knop "Kaart" — **tik op de kaart om ernaartoe te springen** |
| Ontwerp-paneel | **I** | knop "Ontwerp" |

Het ontwerp-paneel kiest per kamer muurverf, accentmuur (tik een muur aan),
vloerafwerking en de lichtsfeer (ochtend/dag/avond/nacht). "Bewaar & deel"
zet de keuzes in de URL zodat je ze kunt delen.

## Mappen

| Pad | Inhoud |
|---|---|
| `index.html` | De volledige app: HTML, CSS en de Three.js-module, inclusief alle geometrie- en kamerdata. |
| `compare.html` | Dev-viewer: PDF, gegenereerde SVG en model-overlay naast elkaar. |
| `plans/` | Bronbestanden: de verkooptekening (`YP_bouwnummer_25.pdf`) en de technische omschrijving. |
| `floorplan/` | `apartment.json` (maatvoering als data) + gegenereerde SVG/PNG-overlays. |
| `tools/` | Python-scripts die het 3D-model tegen de PDF verifiëren (zie hieronder). |

## Verificatie-pipeline (`tools/`)

Het model in `index.html` is gereconstrueerd uit de vectorlijnen van de PDF.
De scripts (vereisen `pymupdf` en `Pillow`) controleren dat het zo blijft:

```sh
python3 tools/compare-to-pdf.py   # meet elke muur tegen de PDF-vectoren
python3 tools/plan-overlay.py     # legt APARTMENT_GEOM uit index.html over apartment.json
python3 tools/pdf-overlay.py      # tekent het model over de PDF-scan heen
python3 tools/render-floorplan.py # genereert floorplan/floorplan.svg uit apartment.json
```

Huidige status: elke muur ligt binnen **0,12 m** van de brontekening. Draai
`compare-to-pdf.py` en `plan-overlay.py` opnieuw na elke wijziging aan de
geometrie.

## Voor ontwikkelaars

- Testhooks: `?pos=x,z,yaw` zet een startpositie (voor screenshots) en
  `window.__state()` geeft de spelerspositie/kamer terug.
- Wanden zijn hartlijnen (`APARTMENT_GEOM`); kamers met vloer-rects/-polygonen
  staan in `ROOMS`. Beide leven in `index.html` en worden door de tools
  geparset — hernoem die constanten niet zomaar.
- Schaduwen en de zon staan op mobiel uit (performance).
