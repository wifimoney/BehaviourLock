/**
 * App init — health check, wire everything up.
 */
(async function main() {
  // Init components
  Tabs.init();
  IngestSection.init();
  PipelineSection.init();
  GraphSection.init();

  // Health check
  try {
    await API.health();
    document.getElementById('health-dot').classList.replace('bg-gray-600', 'bg-safe');
    document.getElementById('health-text').textContent = 'Connected';
  } catch {
    document.getElementById('health-dot').classList.replace('bg-gray-600', 'bg-blocked');
    document.getElementById('health-text').textContent = 'Disconnected';
  }

  // Show session badge when session is set
  State.on('session', (id) => {
    const badge = document.getElementById('session-badge');
    badge.textContent = `session: ${id}`;
    badge.classList.remove('hidden');
  });
})();
