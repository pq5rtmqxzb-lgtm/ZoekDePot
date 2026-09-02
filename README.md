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

Three.js (r160) staat gevendored in `vendor/three/`, dus de app werkt volledig
offline en heeft geen CDN nodig. Netlify publiceert de repo-root zonder
buildstap (zie `netlify.toml`).

## Besturing

| | Desktop | Mobiel |
|---|---|---|
| Lopen | WASD / pijltjes | joystick (linksonder) of **tik waar je heen wilt** |
| Rondkijken | muis (klik voor pointer lock) of **Q/E** | vegen op de rechterhelft |
| Plattegrond | **M** | knop "Kaart" — **tik op de kaart om ernaartoe te springen** |
| Meten | **R** of knop "Meet" — twee klikken/tikken | idem |
| Foto | knop "Foto" → "Bewaar foto" (PNG) | idem |
| Inricht-paneel | **I** | knop "Inrichten" |

Deuren zwaaien vanzelf open als je dichterbij komt — naar de kant die de
verkooptekening aangeeft (een deur zwaait nooit dwars door je heen; sta je in
de draaicirkel, dan wacht hij tot je een stap terug doet). Het inricht-paneel kiest
per kamer muurverf, accentmuur (tik een muur aan), vloerafwerking en de
lichtsfeer (dag→avond→nacht, met schuifje voor elk moment ertussen). Onder
"Eigen meubel" zet je een blok met je eigen maten neer (verplaats/draai/
verwijder) om te zien of je spullen passen. "Bewaar & deel" zet alles in de
URL; "Bewaar als" bewaart genoemde schema's in je browser.

## Mappen

| Pad | Inhoud |
|---|---|
| `index.html` | De HTML-schil: CSS, DOM en de import map. |
| `js/` | De app als native ES-modules (`main.js` is het startpunt; gedeelde staat leeft in `state.js`). |
| `data/model.json` | Muur-hartlijnen, deuren (met draairichting), kamerdefinities + plafondhoogtes — gedeelde bron voor app én tools. |
| `vendor/three/` | Gevendorde Three.js r160. |
| `test/` | Playwright-rooktest (`npm test`, zie ook `.github/workflows/smoke.yml`). |
| `compare.html` | Dev-viewer: PDF, gegenereerde SVG en model-overlay naast elkaar. |
| `plans/` | Bronbestanden: de verkooptekening (`YP_bouwnummer_25.pdf`) en de technische omschrijving. |
| `floorplan/` | `apartment.json` (maatvoering als data) + gegenereerde SVG/PNG-overlays. |
| `tools/` | Python-scripts die het 3D-model tegen de PDF verifiëren (zie hieronder). |

## Verificatie-pipeline (`tools/`)

Het model in `index.html` is gereconstrueerd uit de vectorlijnen van de PDF.
De scripts (vereisen `pymupdf` en `Pillow`) controleren dat het zo blijft:

```sh
python3 tools/compare-to-pdf.py   # meet elke muur tegen de PDF-vectoren
python3 tools/plan-overlay.py     # legt data/model.json over apartment.json
python3 tools/pdf-overlay.py      # tekent het model over de PDF-scan heen
python3 tools/render-floorplan.py # genereert floorplan/floorplan.svg uit apartment.json
```

Huidige status: elke muur ligt binnen **0,12 m** van de brontekening (de
kolommen melden 0,25 m: hartlijn versus PDF-vlak, dat hoort zo). Ook de
deurposities én draairichtingen zijn uit de deurbogen van de PDF gelezen.
Draai `compare-to-pdf.py` en `plan-overlay.py` opnieuw na elke wijziging aan
de geometrie.

## Wat er in het model zit (en waar het vandaan komt)

- **Plattegrond** — muren, kolommen, deuren, schuifpuien, balkonranden uit de
  vectoren van `YP_bouwnummer_25.pdf`. De voordeur zit in de westwand van de
  gang (vanuit de gemeenschappelijke corridor); de kleine badkamer is een
  en-suite vanuit de nis van slaapkamer 2; de woonkamerdeur heeft een vast
  zijlicht.
- **Afwerking** — uit de Technische Omschrijving (15-12-2025): plafond 2,80 m,
  badkamers en gang 2,55 m; witte nestelkozijnen met stompe deuren; houten
  hef-schuifpuien (Red Grandis) met één vast en één schuivend deel; gevel in
  verticale Basralocus delen met zwart voegprofiel; balkonhek van glas met
  hardhouten handrail; betegelde badkamers met elektrische designradiator;
  hangtoiletten; vloerverwarmingsverdeler-, boiler- en WM/CD-kasten in de
  berging.
- **Inrichting** — indicatief (bed, bank, eettafel, kookeiland
  "keukenopstelling D" met spoelbak en inductie, enz.) zodat de maat van de
  ruimtes voelbaar is. Sanitair staat waar de verkooptekening het tekent.
- **Buiten** — de corridor met liften achter de voordeur, de gevel van de
  verdiepingen onder en boven, HWA, buitenkraan en wandlampen op de posities
  van de tekening.

## Voor ontwikkelaars

- Testhooks: `?pos=x,z,yaw` zet een startpositie (voor screenshots) en
  `window.__state()` geeft de spelerspositie/kamer terug.
- Wanden zijn hartlijnen (`geom`); kamers met vloer-rects/-polygonen staan in
  `rooms`. Beide leven in `data/model.json` — de gedeelde bron voor de app
  (fetch) én de Python-tools.
- Schaduwen en de zon staan op mobiel uit (performance).
