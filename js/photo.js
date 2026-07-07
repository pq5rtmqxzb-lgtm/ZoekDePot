import { S } from './state.js';
import { showToast } from './toast.js';
import { toggleDesignPanel } from './panel.js';
import { toggleMeasure } from './measure.js';
import { cancelWalkTarget } from './walk.js';

/* ===== PHOTO MODE =====
 * "Foto" hides the HUD so you can frame a clean shot (walking and looking
 * stay live), then "Bewaar foto" downloads the canvas as a PNG. The renderer
 * runs without preserveDrawingBuffer, so the capture renders explicitly and
 * reads the canvas in the same task — otherwise the buffer may be cleared
 * and the PNG comes out black. */

export function photoModeOn() {
  return document.body.classList.contains('photo');
}

export function enterPhotoMode() {
  if (photoModeOn()) return;
  toggleDesignPanel(false);
  toggleMeasure(false);
  cancelWalkTarget();
  document.body.classList.add('photo');
  showToast(S.isMobile ? 'Zoek je plek en tik "Bewaar foto"'
                       : 'Loop naar je plek en klik "Bewaar foto"');
}

export function exitPhotoMode() {
  document.body.classList.remove('photo');
}

export function capturePhoto() {
  S.renderer.render(S.scene, S.camera);   // fresh frame in this same task
  S.renderer.domElement.toBlob(blob => {
    if (!blob) { showToast('Foto maken is niet gelukt'); return; }
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
    a.download = `ons-nieuwe-huis-${stamp}.png`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 5000);
    showToast('Foto opgeslagen');
  });
}
