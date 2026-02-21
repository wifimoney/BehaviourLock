/**
 * Validation section — drift table + preservation gauge.
 */
const ValidationSection = (() => {
  State.on('result:validation', render);

  function render(data) {
    if (!data) return;
    const el = document.getElementById('sec-validation');
    const pct = data.behavior_preservation_pct;
    const pctColor = pct >= 98 ? 'text-safe' : pct >= 85 ? 'text-risky' : 'text-blocked';
    const pctStroke = pct >= 98 ? '#22c55e' : pct >= 85 ? '#f59e0b' : '#ef4444';

    // SVG gauge
    const radius = 60;
    const circumference = 2 * Math.PI * radius;
    const offset = circumference - (pct / 100) * circumference;

    el.innerHTML = `
      <!-- Preservation Gauge + Drift Counts -->
      <div class="grid md:grid-cols-3 gap-4 mb-6">
        <div class="result-card flex flex-col items-center justify-center">
          <svg width="160" height="160" class="mb-2">
            <circle cx="80" cy="80" r="${radius}" fill="none" stroke="#1f2937" stroke-width="10"/>
            <circle cx="80" cy="80" r="${radius}" fill="none" stroke="${pctStroke}" stroke-width="10"
                    stroke-dasharray="${circumference}" stroke-dashoffset="${offset}"
                    stroke-linecap="round" transform="rotate(-90 80 80)" class="gauge-ring"/>
            <text x="80" y="80" text-anchor="middle" dominant-baseline="central"
                  class="${pctColor}" fill="currentColor" font-size="28" font-weight="bold">${pct.toFixed(1)}%</text>
          </svg>
          <div class="text-sm text-gray-500">Behavior Preserved</div>
        </div>
        <div class="result-card flex flex-col items-center justify-center">
          <div class="text-4xl font-bold text-blocked">${data.critical_drift_count}</div>
          <div class="text-sm text-gray-500 mt-1">Critical Drifts</div>
        </div>
        <div class="result-card flex flex-col items-center justify-center">
          <div class="text-4xl font-bold text-risky">${data.non_critical_drift_count}</div>
          <div class="text-sm text-gray-500 mt-1">Non-Critical Drifts</div>
        </div>
      </div>

      <!-- Drift Table -->
      ${data.drifts.length ? `
      <div class="result-card">
        <h3 class="text-sm text-gray-500 mb-3">Drift Details</h3>
        <table class="data-table">
          <thead>
            <tr>
              <th>Severity</th>
              <th>Test</th>
              <th>Description</th>
              <th>Before/After</th>
            </tr>
          </thead>
          <tbody>
            ${data.drifts.map(d => `
              <tr>
                <td>
                  ${d.severity === 'critical'
                    ? '<span class="badge badge-red">Critical</span>'
                    : '<span class="badge badge-yellow">Non-Critical</span>'}
                </td>
                <td class="font-mono text-white text-xs">${esc(d.test_name)}</td>
                <td class="text-gray-400 text-xs">${esc(d.description)}</td>
                <td>
                  <details>
                    <summary class="text-xs text-gray-500 cursor-pointer">compare</summary>
                    <div class="mt-1 space-y-1">
                      <div>
                        <span class="text-xs text-gray-600">Before:</span>
                        <pre class="text-xs bg-bg rounded p-2 mt-0.5 overflow-auto max-h-32 whitespace-pre-wrap text-gray-400">${esc(d.before_output)}</pre>
                      </div>
                      <div>
                        <span class="text-xs text-gray-600">After:</span>
                        <pre class="text-xs bg-bg rounded p-2 mt-0.5 overflow-auto max-h-32 whitespace-pre-wrap text-gray-400">${esc(d.after_output)}</pre>
                      </div>
                    </div>
                  </details>
                </td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      </div>` : `
      <div class="result-card text-center py-8">
        <span class="text-safe text-lg font-semibold">No drifts detected</span>
        <p class="text-gray-500 text-sm mt-1">All test outputs match the baseline exactly.</p>
      </div>`}
    `;
  }

  function esc(s) {
    const d = document.createElement('div');
    d.textContent = s || '';
    return d.innerHTML;
  }

  return {};
})();
