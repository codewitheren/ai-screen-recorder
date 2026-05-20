// assets.ts
//
// Injected visual and functional assets used during recording or replaying steps.

/**
 * An overlay cursor visualizer injected to track mouse movements and clicks.
 * Keeps standard actions visible directly to human audiences in video captures.
 */
export const VIRTUAL_CURSOR_SCRIPT = `
(() => {
  const install = () => {
    if (document.getElementById('__ai_cursor__')) return;
    const cursor = document.createElement('div');
    cursor.id = '__ai_cursor__';
    cursor.style.cssText = [
      'position:fixed',
      'top:0',
      'left:0',
      'width:20px',
      'height:20px',
      'border-radius:50%',
      'background:rgba(255,64,64,0.85)',
      'border:2px solid #fff',
      'box-shadow:0 0 8px rgba(0,0,0,0.5)',
      'pointer-events:none',
      'z-index:2147483647',
      'transform:translate(-50%,-50%)',
      'transition:transform 0.05s linear'
    ].join(';');
    document.documentElement.appendChild(cursor);
    window.addEventListener('mousemove', (e) => {
      cursor.style.left = e.clientX + 'px';
      cursor.style.top = e.clientY + 'px';
    }, { passive: true, capture: true });
  };
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', install, { once: true });
  } else {
    install();
  }
})();
`;
