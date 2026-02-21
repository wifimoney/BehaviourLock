/**
 * Report section — verdict hero card, risk meter, detail grid.
 */
const ReportSection = (() => {
  State.on('result:report', render);

  function render(data) {
    if (!data) return;
    const el = document.getElementById('sec-report');
    const verdictClass = {
      SAFE: 'verdict-safe', RISKY: 'verdict-risky', BLOCKED: 'verdict-blocked'
    }[data.verdict] || 'verdict-risky';
    const verdictBg = {
      SAFE: 'bg-safe/5', RISKY: 'bg-risky/5', BLOCKED: 'bg-blocked/5'
    }[data.verdict] || '';

    const testCoverage = data.test_coverage_pct || 0;

    el.innerHTML = `
      <!-- Verdict Hero -->
      <div class="result-card text-center mb-6 ${verdictBg}">
        <div class="inline-block px-6 py-2 rounded-full text-2xl font-bold mb-3 ${verdictClass}">
          ${data.verdict}
        </div>
        <p class="text-gray-400 text-lg max-w-2xl mx-auto">${data.judge_summary}</p>
      </div>

      <!-- Risk Meter -->
      <div class="result-card mb-6">
        <div class="flex items-center justify-between mb-2">
          <span class="text-sm text-gray-400">Risk Score</span>
          <span class="text-sm font-mono ${data.risk_score < 0.3 ? 'text-safe' : data.risk_score < 0.7 ? 'text-risky' : 'text-blocked'}">
            ${(data.risk_score * 100).toFixed(0)}%
          </span>
        </div>
        <div class="risk-meter">
          <div class="risk-needle" style="left: ${data.risk_score * 100}%"></div>
        </div>
        <div class="flex justify-between text-xs text-gray-600 mt-1">
          <span>Safe</span><span>Risky</span><span>Blocked</span>
        </div>
      </div>

      <!-- Detail Grid -->
      <div class="grid md:grid-cols-2 gap-4">
        <div class="result-card">
          <h3 class="text-sm text-gray-500 mb-1">What Changed</h3>
          <p class="text-white">${data.what_changed}</p>
        </div>
        <div class="result-card">
          <h3 class="text-sm text-gray-500 mb-1">Why It Changed</h3>
          <p class="text-white">${data.why_it_changed}</p>
        </div>
        <div class="result-card">
          <h3 class="text-sm text-gray-500 mb-1">Behavior Preservation</h3>
          <div class="flex items-baseline gap-2">
            <span class="text-3xl font-bold ${data.behavior_preservation_pct >= 98 ? 'text-safe' : data.behavior_preservation_pct >= 85 ? 'text-risky' : 'text-blocked'}">
              ${data.behavior_preservation_pct.toFixed(1)}%
            </span>
            <span class="text-sm text-gray-500">preserved</span>
          </div>
          <div class="flex gap-4 mt-2 text-sm">
            <span class="text-blocked">${data.critical_drifts} critical</span>
            <span class="text-risky">${data.non_critical_drifts} non-critical</span>
          </div>
        </div>
        <div class="result-card">
          <h3 class="text-sm text-gray-500 mb-1">Test Coverage</h3>
          <div class="flex items-baseline gap-2 mb-2">
            <span class="text-3xl font-bold ${testCoverage >= 80 ? 'text-safe' : testCoverage >= 50 ? 'text-risky' : 'text-blocked'}">
              ${testCoverage.toFixed(1)}%
            </span>
            <span class="text-sm text-gray-500">functions covered</span>
          </div>
          <h3 class="text-sm text-gray-500 mb-1 mt-3">Rollback Command</h3>
          <code class="text-xs bg-bg rounded px-2 py-1 text-accent-light block overflow-x-auto">${data.rollback_command}</code>
        </div>
      </div>
    `;
  }

  return {};
})();
