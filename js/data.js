import { S } from './state.js';
import { rectArea, polyArea } from './rooms.js';
import { WALL_HEIGHT } from './constants.js';

// Apartment geometry (walls, doors, side lights, sliding doors, windows,
// railings, privacy screens) and the room definitions live in data/model.json
// — the single source of truth that the Python verification tools
// (tools/*.py) read as well. Coordinates are wall CENTRELINES at the centre of
// the PDF's wall slabs, so both faces land within ~5 cm of the source drawing
// (verified with tools/compare-to-pdf.py). Rows may carry `t` (wall thickness;
// facade/structural default WALL_THICK 0.20 m, interior partitions 0.10 m).
// `kind` chooses the builder: wall = solid wall (adds collision segment),
// door = nestelkozijn + hinged leaf (no collision in span; x1,z1 is the hinge
// jamb, `open_to` the point the leaf swings toward), sidelight = fixed glass
// beside a door (collision), sliding = hef-schuifpui (fixed pane collides, the
// open sliding pane is the walkable gap), window = fixed glazing with sill
// (collision), railing = balcony balustrade (collision), screen = privacy
// screen between balconies (collision).
export async function loadModel() {
  let MODEL;
  try {
    MODEL = await (await fetch('./data/model.json')).json();
  } catch (err) {
    document.getElementById('introOverlay').innerHTML =
      '<h1>Ons Nieuwe Huis</h1><p>Kon de plattegrond (data/model.json) niet laden.</p>';
    throw err;
  }
  if (MODEL.version !== 1) {
    console.warn('data/model.json heeft versie', MODEL.version, '— deze app verwacht versie 1.');
  }
  S.MODEL = MODEL;
  S.geom = MODEL.geom;

  /* ===== ROOMS =====
   * Each room groups the floor rectangles + polygons (from buildApartment) it owns,
   * plus a default floor kind and its ceiling height (`ceil`, default 2.80 m;
   * badkamers/verkeersruimten 2.55 m per the Technische Omschrijving).
   * walls[] and floorMeshes[] are filled at build time so the design panel can
   * recolour/refloor a single room. Shapes match the PDF inner faces (verified
   * by tools/compare-to-pdf.py). `polys` carry the areas with diagonal/curved
   * boundaries (NW tip, SW corners, balcony curves). Enclosed rooms (toilet,
   * bergingen, kasten, badkklein) are listed before their container so the
   * "which room am I in" lookup prefers the smaller space. */
  S.rooms = MODEL.rooms;
  S.rooms.forEach(r => {
    r.walls = []; r.floorMeshes = []; r.polys = r.polys || [];
    r.ceil = r.ceil || WALL_HEIGHT;
    // Floor area for the HUD — rects and polys of one room never overlap.
    r.area = r.rects.reduce((a, rc) => a + rectArea(rc), 0)
           + r.polys.reduce((a, p) => a + polyArea(p), 0);
  });
}
