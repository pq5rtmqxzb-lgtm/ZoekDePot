let _toastTimer = null;
export function showToast(msg) {
  const el = document.getElementById('dpToast');
  if (!el) return;
  el.textContent = msg; el.classList.add('show');
  clearTimeout(_toastTimer);
  _toastTimer = setTimeout(() => el.classList.remove('show'), 1900);
}
