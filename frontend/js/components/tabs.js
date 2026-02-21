/**
 * Tab navigation — show/hide sections.
 */
const Tabs = (() => {
  const ALL_TABS = ['ingest','pipeline','report','graph','dead-code','tests','baseline','diff','validation'];

  function init() {
    document.querySelectorAll('.tab-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        if (btn.disabled) return;
        switchTo(btn.dataset.tab);
      });
    });
  }

  function switchTo(tabId) {
    // Update buttons
    document.querySelectorAll('.tab-btn').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.tab === tabId);
    });
    // Update sections
    ALL_TABS.forEach(id => {
      const sec = document.getElementById(`sec-${id}`);
      if (sec) sec.classList.toggle('hidden', id !== tabId);
    });
    State.emit('tabSwitch', tabId);
  }

  function enable(tabId) {
    const btn = document.querySelector(`.tab-btn[data-tab="${tabId}"]`);
    if (btn) btn.disabled = false;
  }

  function enableAll() {
    ALL_TABS.forEach(enable);
  }

  return { init, switchTo, enable, enableAll };
})();
