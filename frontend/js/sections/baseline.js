/**
 * Baseline section — pass/fail results table + snapshot hash.
 */
const BaselineSection = (() => {
  State.on('result:baseline', render);

  function render(data) {
    if (!data) return;
    const el = document.getElementById('sec-baseline');
    const passRate = data.total ? (data.passed / data.total * 100) : 0;
    const barColor = passRate === 100 ? 'bg-safe' : passRate >= 80 ? 'bg-risky' : 'bg-blocked';

    el.innerHTML = `
      <!-- Summary -->
      <div class="result-card mb-6">
        <div class="flex items-center justify-between flex-wrap gap-4 mb-3">
          <div>
            <span class="text-2xl font-bold text-white">${data.passed}/${data.total}</span>
            <span class="text-sm text-gray-500 ml-2">tests passed</span>
          </div>
          <div class="flex items-center gap-2">
            <span class="text-xs text-gray-500">Snapshot hash:</span>
            <code class="text-xs bg-bg rounded px-2 py-1 text-accent-light font-mono cursor-pointer"
                  onclick="navigator.clipboard.writeText('${esc(data.snapshot_hash)}');this.textContent='Copied!';setTimeout(()=>this.textContent='${esc(data.snapshot_hash.substring(0,16))}...',1500)"
            >${esc(data.snapshot_hash.substring(0, 16))}...</code>
          </div>
        </div>
        <div class="progress-bar">
          <div class="progress-fill ${barColor}" style="width:${passRate}%"></div>
        </div>
      </div>

      <!-- Results Table -->
      <div class="result-card">
        <table class="data-table">
          <thead>
            <tr>
              <th>Status</th>
              <th>Test Name</th>
              <th>Duration</th>
              <th>Output</th>
            </tr>
          </thead>
          <tbody>
            ${data.results.map(r => `
              <tr>
                <td>
                  ${r.passed
                    ? '<span class="badge badge-green">PASS</span>'
                    : '<span class="badge badge-red">FAIL</span>'}
                </td>
                <td class="font-mono text-white text-xs">${esc(r.test_name)}</td>
                <td class="text-gray-400 text-xs">${r.duration_ms.toFixed(1)}ms</td>
                <td>
                  ${r.output ? `
                  <details>
                    <summary class="text-xs text-gray-500 cursor-pointer">view</summary>
                    <pre class="text-xs text-gray-400 bg-bg rounded p-2 mt-1 max-h-40 overflow-auto whitespace-pre-wrap">${esc(r.output)}</pre>
                  </details>` : '<span class="text-gray-600 text-xs">-</span>'}
                </td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      </div>
    `;
  }

  function esc(s) {
    const d = document.createElement('div');
    d.textContent = s || '';
    return d.innerHTML;
  }

  return {};
})();
