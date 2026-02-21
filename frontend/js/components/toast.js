/**
 * Toast notifications.
 */
const Toast = (() => {
  const container = () => document.getElementById('toast-container');

  function show(message, type = 'info', duration = 4000) {
    const el = document.createElement('div');
    el.className = `toast toast-${type}`;
    el.textContent = message;
    container().appendChild(el);

    setTimeout(() => {
      el.style.animation = 'slide-out 0.3s ease-in forwards';
      setTimeout(() => el.remove(), 300);
    }, duration);
  }

  return {
    success: (msg) => show(msg, 'success'),
    error:   (msg) => show(msg, 'error', 6000),
    info:    (msg) => show(msg, 'info'),
  };
})();
