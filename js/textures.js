import * as THREE from 'three';
import { S } from './state.js';
import {
  WALL_MAT, FLOOR_MAT, CEIL_MAT, MARBLE_MAT, TILE_MAT, STONE_TILE_MAT,
  WALL_TILE_MAT, CARPET_MAT, CLADDING_MAT, LIMEWASH_MAT, LAMEL_CEIL_MAT,
} from './materials.js';

export let skyTex = null;

/* Procedural texture helper. drawFn paints into a 2D canvas of size w×h.
 * Returns a CanvasTexture with sRGB color space and tiling configured. */
export function makeTexture(drawFn, w, h, repU = 1, repV = 1) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  drawFn(c.getContext('2d'), w, h);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(repU, repV);
  return tex;
}

/* Grain noise over a base fill: adds ±amp per-pixel brightness noise. */
function noiseFill(ctx, w, h, base, amp) {
  ctx.fillStyle = base;
  ctx.fillRect(0, 0, w, h);
  const img = ctx.getImageData(0, 0, w, h);
  for (let i = 0; i < img.data.length; i += 4) {
    const n = (Math.random() - 0.5) * amp;
    img.data[i]   = Math.max(0, Math.min(255, img.data[i]   + n));
    img.data[i+1] = Math.max(0, Math.min(255, img.data[i+1] + n));
    img.data[i+2] = Math.max(0, Math.min(255, img.data[i+2] + n));
  }
  ctx.putImageData(img, 0, 0);
}

/* ===== PROCEDURAL TEXTURES ===== */
export function setupTextures(aniso) {
  S.texAniso = aniso;
  // Plaster wall — base off-white with low-contrast grain and a few blotches
  const plasterTex = makeTexture((ctx, w, h) => {
    // Fine-grained "sausklaar/behangklaar" plaster: light grain only, no
    // blotches (those read as a polka-dot wallpaper on a 10 m wall).
    noiseFill(ctx, w, h, '#f0ece4', 14);
    for (let i = 0; i < 400; i++) {
      ctx.fillStyle = `rgba(120,108,94,${0.02 + Math.random() * 0.03})`;
      ctx.fillRect(Math.random() * w, Math.random() * h, 1 + Math.random() * 3, 1 + Math.random() * 3);
    }
  }, 512, 512, 4, 2);
  plasterTex.anisotropy = aniso;
  WALL_MAT.map = plasterTex;
  WALL_MAT.needsUpdate = true;

  // Oak "lamel" strip floor — narrow staggered strips (~0.18 m wide, ~1 m
  // long at the room's tile cadence).
  const plankTex = makeTexture((ctx, w, h) =>
    drawLamelStrips(ctx, w, h,
      ['#d3b285', '#c9a87a', '#dcbc90', '#c19e6e', '#d0ae80'],
      '120, 85, 50', 'rgba(95, 70, 42, 0.45)'), 1024, 1024);
  plankTex.anisotropy = aniso;
  FLOOR_MAT.map = plankTex;
  FLOOR_MAT.needsUpdate = true;

  // Marble veining for the kitchen island monolith
  const marbleTex = makeTexture((ctx, w, h) => {
    ctx.fillStyle = '#ddd8cf';
    ctx.fillRect(0, 0, w, h);
    for (let v = 0; v < 26; v++) {
      ctx.strokeStyle = `rgba(120, 112, 100, ${0.10 + Math.random() * 0.18})`;
      ctx.lineWidth = 0.6 + Math.random() * 1.6;
      let vx = Math.random() * w, vy = Math.random() * h;
      ctx.beginPath();
      ctx.moveTo(vx, vy);
      for (let s = 0; s < 5; s++) {
        vx += (Math.random() - 0.35) * w * 0.18;
        vy += (Math.random() - 0.5) * h * 0.22;
        ctx.lineTo(vx, vy);
      }
      ctx.stroke();
    }
  }, 512, 512);
  marbleTex.anisotropy = aniso;
  MARBLE_MAT.map = marbleTex;
  MARBLE_MAT.needsUpdate = true;

  // White paint ceiling — near-white base with a faint stipple (sausklaar,
  // gerold).
  const ceilingTex = makeTexture((ctx, w, h) => {
    noiseFill(ctx, w, h, '#fafaf7', 6);
    for (let i = 0; i < 80; i++) {
      ctx.fillStyle = `rgba(220, 220, 215, ${0.05 + Math.random() * 0.08})`;
      ctx.beginPath();
      ctx.arc(Math.random() * w, Math.random() * h, 6 + Math.random() * 20, 0, Math.PI * 2);
      ctx.fill();
    }
  }, 512, 512, 3, 3);
  ceilingTex.anisotropy = aniso;
  CEIL_MAT.map = ceilingTex;
  CEIL_MAT.emissiveMap = ceilingTex;
  CEIL_MAT.needsUpdate = true;

  // Bathroom/toilet floor tile — 60x60 light grey with a thin grout line
  // (canvas = 1.2 x 1.2 m at the tegel cadence).
  const tileTex = makeTexture((ctx, w, h) => {
    ctx.fillStyle = '#8a8a86';
    ctx.fillRect(0, 0, w, h);
    const cols = 2, rows = 2;
    const tw = w / cols, th = h / rows;
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const shade = 214 + Math.floor((Math.random() - 0.5) * 12);
        ctx.fillStyle = `rgb(${shade},${shade - 2},${shade - 7})`;
        ctx.fillRect(c * tw + 1.5, r * th + 1.5, tw - 3, th - 3);
        for (let i = 0; i < 40; i++) {
          ctx.fillStyle = `rgba(90,86,80,${0.03 + Math.random() * 0.06})`;
          ctx.fillRect(c * tw + Math.random() * tw, r * th + Math.random() * th, 2, 2);
        }
      }
    }
  }, 256, 256, 1, 1);
  tileTex.anisotropy = aniso;
  TILE_MAT.map = tileTex;
  TILE_MAT.needsUpdate = true;

  // Wall tile — 30x60 large format, warm off-white, laid horizontally.
  // Canvas = 1.2 m wide x 1.2 m high (2 x 4 tiles); builders scale the repeat.
  const wallTileTex = makeTexture((ctx, w, h) => {
    ctx.fillStyle = '#b9b6b0';
    ctx.fillRect(0, 0, w, h);
    const cols = 2, rows = 4;
    const tw = w / cols, th = h / rows;
    for (let r = 0; r < rows; r++) {
      const off = (r % 2) * tw / 2;       // halfsteensverband
      for (let c = -1; c < cols; c++) {
        const shade = 232 + Math.floor((Math.random() - 0.5) * 8);
        ctx.fillStyle = `rgb(${shade},${shade - 2},${shade - 6})`;
        ctx.fillRect(c * tw + off + 1.2, r * th + 1.2, tw - 2.4, th - 2.4);
      }
    }
  }, 512, 512, 1, 1);
  wallTileTex.anisotropy = aniso;
  WALL_TILE_MAT.map = wallTileTex;
  WALL_TILE_MAT.needsUpdate = true;

  // Outdoor balkontegels — 50x50 light grey concrete on tegeldragers
  const stoneTileTex = makeTexture((ctx, w, h) => {
    ctx.fillStyle = '#6a6660';
    ctx.fillRect(0, 0, w, h);
    const cols = 3, rows = 3;
    const tw = w / cols, th = h / rows;
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const shade = 176 + Math.floor((Math.random() - 0.5) * 22);
        ctx.fillStyle = `rgb(${shade},${shade - 4},${shade - 12})`;
        ctx.fillRect(c * tw + 2, r * th + 2, tw - 4, th - 4);
        for (let i = 0; i < 30; i++) {
          ctx.fillStyle = `rgba(40,32,22,${0.05 + Math.random() * 0.16})`;
          ctx.fillRect(c * tw + Math.random() * tw, r * th + Math.random() * th, 2, 2);
        }
      }
    }
  }, 256, 256, 1, 1);
  stoneTileTex.anisotropy = aniso;
  STONE_TILE_MAT.map = stoneTileTex;
  STONE_TILE_MAT.needsUpdate = true;

  // Corridor carpet — gemêleerd lichtgrijs
  const carpetTex = makeTexture((ctx, w, h) => {
    noiseFill(ctx, w, h, '#b6b5b0', 46);
    for (let i = 0; i < 600; i++) {
      ctx.fillStyle = `rgba(${60 + Math.random() * 60 | 0},${60 + Math.random() * 60 | 0},${60 + Math.random() * 60 | 0},0.18)`;
      ctx.fillRect(Math.random() * w, Math.random() * h, 1 + Math.random() * 2, 1 + Math.random() * 2);
    }
  }, 256, 256, 1, 1);
  carpetTex.anisotropy = aniso;
  CARPET_MAT.map = carpetTex;
  CARPET_MAT.needsUpdate = true;

  // Gevelbekleding: verticale Basralocus delen (onbehandeld, vergrijzend
  // bruin) met zwart aluminium voegprofiel. Canvas = 1.0 x 1.0 m.
  const claddingTex = makeTexture((ctx, w, h) => {
    ctx.fillStyle = '#15130f';
    ctx.fillRect(0, 0, w, h);
    const slat = 0.082, gap = 0.012;           // m
    const n = Math.round(1 / (slat + gap));
    const pw = w / n;
    const tones = ['#9d7f60', '#8f7458', '#a88a6a', '#86694d', '#997a5c', '#8b7057'];
    for (let i = 0; i < n; i++) {
      ctx.fillStyle = tones[(i * 5) % tones.length];
      const x0 = i * pw, sw = pw * (slat / (slat + gap));
      ctx.fillRect(x0, 0, sw, h);
      for (let g = 0; g < 12; g++) {            // vertical grain streaks
        ctx.strokeStyle = `rgba(40, 28, 16, ${0.05 + Math.random() * 0.10})`;
        ctx.lineWidth = 0.6 + Math.random() * 1.2;
        const gx = x0 + Math.random() * sw;
        ctx.beginPath(); ctx.moveTo(gx, 0); ctx.lineTo(gx + (Math.random() - 0.5) * 3, h); ctx.stroke();
      }
    }
  }, 512, 512, 1, 1);
  claddingTex.anisotropy = aniso;
  CLADDING_MAT.map = claddingTex;
  CLADDING_MAT.needsUpdate = true;

  // Algemene ruimten: limewash verfsysteem, betonlook
  const limewashTex = makeTexture((ctx, w, h) => {
    noiseFill(ctx, w, h, '#b9b5ae', 18);
    for (let i = 0; i < 90; i++) {
      ctx.fillStyle = `rgba(${150 + Math.random() * 40 | 0},${146 + Math.random() * 40 | 0},${140 + Math.random() * 36 | 0},${0.06 + Math.random() * 0.10})`;
      ctx.beginPath();
      ctx.ellipse(Math.random() * w, Math.random() * h, 40 + Math.random() * 120, 20 + Math.random() * 70,
                  Math.random() * Math.PI, 0, Math.PI * 2);
      ctx.fill();
    }
  }, 512, 512, 2, 1);
  limewashTex.anisotropy = aniso;
  LIMEWASH_MAT.map = limewashTex;
  LIMEWASH_MAT.needsUpdate = true;

  // Panelenplafond met houten lamellen (corridor + balkonplafonds): narrow
  // strips with dark shadow gaps. Canvas = 1.0 x 1.0 m, strips along U.
  const lamelTex = makeTexture((ctx, w, h) => {
    ctx.fillStyle = '#1a1612';
    ctx.fillRect(0, 0, w, h);
    const n = 14, ph = h / n;
    const tones = ['#b8916a', '#ad8760', '#c09a72', '#a67f5a'];
    for (let i = 0; i < n; i++) {
      ctx.fillStyle = tones[(i * 3) % tones.length];
      ctx.fillRect(0, i * ph + ph * 0.18, w, ph * 0.64);
    }
  }, 512, 512, 1, 1);
  lamelTex.anisotropy = aniso;
  LAMEL_CEIL_MAT.map = lamelTex;
  LAMEL_CEIL_MAT.needsUpdate = true;

  // Sky cyclorama — wraps the outside world beyond the balconies
  skyTex = makeTexture((ctx, w, h) => {
    const grad = ctx.createLinearGradient(0, 0, 0, h);
    grad.addColorStop(0,   '#a8c6e6');
    grad.addColorStop(0.55,'#cad7d8');
    grad.addColorStop(0.78,'#94a482');
    grad.addColorStop(1,   '#5a6b48');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, w, h);
    // far tree silhouettes
    for (let i = 0; i < 90; i++) {
      const x = Math.random() * w;
      const baseY = h * (0.58 + Math.random() * 0.22);
      const treeH = 18 + Math.random() * 50;
      const treeW = 12 + Math.random() * 24;
      ctx.fillStyle = `rgba(60,80,58,${0.55 + Math.random() * 0.3})`;
      ctx.beginPath();
      ctx.moveTo(x, baseY - treeH);
      ctx.lineTo(x - treeW / 2, baseY);
      ctx.lineTo(x + treeW / 2, baseY);
      ctx.closePath();
      ctx.fill();
    }
    // clouds
    for (let i = 0; i < 18; i++) {
      const cx = Math.random() * w;
      const cy = h * (0.06 + Math.random() * 0.30);
      const rx = 40 + Math.random() * 120;
      const ry = 6 + Math.random() * 14;
      ctx.fillStyle = `rgba(255,255,255,${0.18 + Math.random() * 0.20})`;
      ctx.beginPath();
      ctx.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2);
      ctx.fill();
    }
  }, 2048, 512, 1, 1);
  skyTex.wrapS = THREE.RepeatWrapping;
  skyTex.wrapT = THREE.ClampToEdgeWrapping;
  skyTex.anisotropy = aniso;

  // Floor-finish library (depends on FLOOR_MAT's plank map existing).
  buildFloorFinishes(aniso);
}

/* --- floor-finish materials (built from setupTextures) --------------- */
/* Paint staggered oak-lamel strips covering the WHOLE canvas (rows are filled
 * from a negative offset so the stagger never leaves unpainted black cells).
 * Strips run along x; at the hout tile cadence of 2.0 x 2.5 m one strip is
 * about 1.0 m long and 0.18 m wide. */
export function drawLamelStrips(ctx, w, h, palette, grainRGB, seamRGBA) {
  const rows = 14, rowH = h / rows, segLen = w / 2;
  for (let r = 0; r < rows; r++) {
    const y = r * rowH;
    const stagger = ((r * 0.37 + 0.13) % 1) * segLen;
    let i = 0;
    for (let x0 = stagger - segLen; x0 < w; x0 += segLen, i++) {
      ctx.fillStyle = palette[(r * 7 + i * 13) % palette.length];
      ctx.fillRect(x0, y, segLen + 1, rowH);
      // Lengthwise grain — low-contrast streaks along the strip
      for (let g = 0; g < 5; g++) {
        ctx.strokeStyle = `rgba(${grainRGB}, ${0.05 + Math.random() * 0.08})`;
        ctx.lineWidth = 0.5 + Math.random() * 0.8;
        const gy = y + (0.15 + 0.7 * Math.random()) * rowH;
        ctx.beginPath();
        ctx.moveTo(x0, gy);
        ctx.bezierCurveTo(x0 + segLen * 0.33, gy + (Math.random() - 0.5) * 3,
                          x0 + segLen * 0.66, gy + (Math.random() - 0.5) * 3,
                          x0 + segLen, gy + (Math.random() - 0.5) * 2);
        ctx.stroke();
      }
      // Butt-joint seam at the strip end
      ctx.fillStyle = seamRGBA;
      ctx.fillRect(Math.round(x0) - 0.5, y, 1, rowH);
    }
    // Long seam between rows
    ctx.fillStyle = seamRGBA;
    ctx.fillRect(0, Math.round(y + rowH) - 0.5, w, 1);
  }
}

export function makePlankMat(palette, grainRGB, seamRGBA, rough = 0.55) {
  const tex = makeTexture((ctx, w, h) =>
    drawLamelStrips(ctx, w, h, palette, grainRGB, seamRGBA), 1024, 1024);
  tex.anisotropy = S.texAniso;
  return new THREE.MeshStandardMaterial({ map: tex, roughness: rough, metalness: 0.04 });
}

export function makeConcreteMat() {
  const tex = makeTexture((ctx, w, h) => {
    noiseFill(ctx, w, h, '#b8b6b1', 26);
    for (let i = 0; i < 60; i++) {
      ctx.fillStyle = `rgba(110,108,104,${0.04 + Math.random() * 0.06})`;
      ctx.beginPath();
      ctx.arc(Math.random() * w, Math.random() * h, 30 + Math.random() * 90, 0, Math.PI * 2);
      ctx.fill();
    }
  }, 512, 512);
  tex.anisotropy = S.texAniso;
  return new THREE.MeshStandardMaterial({ map: tex, roughness: 0.85, metalness: 0.02 });
}

// Built once, after the base textures exist. Reuses FLOOR_MAT / TILE_MAT /
// STONE_TILE_MAT / CARPET_MAT for the naturel/tile/stone/carpet options.
export function buildFloorFinishes(aniso) {
  S.texAniso = aniso;
  const diagMat = FLOOR_MAT.clone();
  diagMat.map = FLOOR_MAT.map.clone();
  diagMat.map.center.set(0.5, 0.5);
  diagMat.map.rotation = Math.PI / 4;
  diagMat.map.needsUpdate = true;
  S.FLOOR_FINISHES = [
    { id: 'naturel_eiken', name: 'Eiken lamel',       mat: FLOOR_MAT },
    { id: 'licht_eiken',   name: 'Licht eiken',       mat: makePlankMat(
        ['#efe0c6', '#e8d6b8', '#f1e4cd', '#e3d3b0', '#ece0c2'], '150, 120, 80', 'rgba(120,95,60,0.4)') },
    { id: 'walnoot',       name: 'Walnoot',           mat: makePlankMat(
        ['#6b4a2f', '#5b3d27', '#73503a', '#4a3320', '#624a32'], '30, 18, 8', 'rgba(18,10,4,0.6)') },
    { id: 'grijs_eiken',   name: 'Grijs eiken',       mat: makePlankMat(
        ['#cfcabf', '#c3beb3', '#d6d1c7', '#bbb6ab', '#c8c3b8'], '90, 88, 82', 'rgba(70,68,62,0.4)') },
    { id: 'diagonaal',     name: 'Diagonale planken', mat: diagMat },
    { id: 'beton',         name: 'Beton',             mat: makeConcreteMat() },
    { id: 'tegel',         name: 'Tegel 60x60',       mat: TILE_MAT },
    { id: 'natuursteen',   name: 'Balkontegel',       mat: STONE_TILE_MAT },
    { id: 'tapijt',        name: 'Tapijt',            mat: CARPET_MAT },
  ];
}
