/**
 * Report section — verdict hero card, risk meter, detail grid.
 * Now includes pre-migration risk assessment card when available.
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

    // Pre-migration risk assessment card
    const riskData = State.getResult('risk');
    const riskCard = riskData ? _renderRiskCard(riskData) : '';

    el.innerHTML = `
      ${riskCard}

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

      ${data.verdict !== 'BLOCKED' ? `
      <!-- Apply & Create PR -->
      <div class="result-card mt-6 text-center" id="pr-action-report">
        ${data.verdict === 'RISKY' ? '<p class="text-risky text-sm mb-3">This migration has risks. Review the drifts above before proceeding.</p>' : ''}
        <button id="btn-create-pr-report" class="px-6 py-3 rounded-lg font-semibold text-lg transition-all
          ${data.verdict === 'SAFE' ? 'bg-safe/20 text-safe hover:bg-safe/30 border border-safe/30' : 'bg-risky/20 text-risky hover:bg-risky/30 border border-risky/30'}">
          ${data.verdict === 'SAFE' ? 'Apply & Create PR' : 'Confirm & Create PR'}
        </button>
      </div>` : ''}
    `;

    // Wire up PR button click
    const prBtn = document.getElementById('btn-create-pr-report');
    if (prBtn) {
      prBtn.addEventListener('click', () => createPR());
    }
  }

  async function createPR() {
    const sid = State.getSession();
    if (!sid) return;

    const reportData = State.getResult('report');
    if (reportData && reportData.verdict === 'RISKY') {
      if (!confirm('This migration has risks. Are you sure you want to create a PR?')) return;
    }

    // Disable both report and diff buttons
    const reportBtn = document.getElementById('btn-create-pr-report');
    const diffBtn = document.getElementById('btn-create-pr-diff');
    if (reportBtn) { reportBtn.disabled = true; reportBtn.textContent = 'Creating PR...'; }
    if (diffBtn) { diffBtn.disabled = true; diffBtn.textContent = 'Creating PR...'; }

    try {
      const result = await API.createPR(sid);
      const container = document.getElementById('pr-action-report');
      const diffContainer = document.getElementById('pr-action-diff');

      if (result.status === 'created' && result.pr_url) {
        const successHtml = `
          <div class="p-4 rounded-lg bg-safe/10 border border-safe/30">
            <p class="text-safe font-semibold mb-2">PR Created Successfully</p>
            <a href="${_esc(result.pr_url)}" target="_blank" rel="noopener"
               class="text-accent-light underline hover:text-white">${_esc(result.pr_url)}</a>
            <p class="text-gray-500 text-xs mt-2">Branch: ${_esc(result.branch)}</p>
          </div>`;
        if (container) container.innerHTML = successHtml;
        if (diffContainer) diffContainer.innerHTML = successHtml;
        Toast.success('PR created successfully!');
      } else if (result.status === 'partial') {
        const partialHtml = `
          <div class="p-4 rounded-lg bg-risky/10 border border-risky/30">
            <p class="text-risky font-semibold mb-2">Branch Pushed — PR Creation Failed</p>
            <p class="text-gray-400 text-sm">${_esc(result.message)}</p>
            <p class="text-gray-500 text-xs mt-2">Branch: <code>${_esc(result.branch)}</code></p>
          </div>`;
        if (container) container.innerHTML = partialHtml;
        if (diffContainer) diffContainer.innerHTML = partialHtml;
        Toast.info('Branch pushed, but PR creation failed. Create it manually.');
      }
    } catch (err) {
      Toast.error(err.message || 'Failed to create PR');
      // Re-enable buttons for retry
      const reportBtn = document.getElementById('btn-create-pr-report');
      const diffBtn = document.getElementById('btn-create-pr-diff');
      if (reportBtn) { reportBtn.disabled = false; reportBtn.textContent = 'Retry Create PR'; }
      if (diffBtn) { diffBtn.disabled = false; diffBtn.textContent = 'Retry Create PR'; }
    }
  }

  function _renderRiskCard(risk) {
    const levelColors = {
      low:     'border-safe/30 bg-safe/5',
      medium:  'border-risky/30 bg-risky/5',
      high:    'border-risky/50 bg-risky/10',
      blocked: 'border-blocked/30 bg-blocked/5',
    };
    const levelBadge = {
      low:     'badge-green',
      medium:  'badge-yellow',
      high:    'badge-yellow',
      blocked: 'badge-red',
    };

    const level = risk.risk_level || 'medium';
    const score = risk.risk_score != null ? (risk.risk_score * 100).toFixed(0) : '?';

    let warningsHtml = '';
    const warnings = risk.warnings || [];
    if (warnings.length > 0) {
      warningsHtml = warnings.map(w => {
        const icon = w.severity === 'critical' ? '🔴' : '🟡';
        const fn = _esc(w.function || 'unknown');
        const msg = _esc(w.message || '');
        return `<div class="text-sm text-gray-300">${icon} <strong>${fn}</strong> — ${msg}</div>`;
      }).join('');
    } else {
      warningsHtml = '<p class="text-sm text-gray-500">No warnings — clean history.</p>';
    }

    return `
      <div class="result-card mb-6 ${levelColors[level] || ''}">
        <div class="flex items-center justify-between mb-3">
          <h3 class="text-sm text-gray-500">Pre-Migration Risk Assessment</h3>
          <span class="badge ${levelBadge[level] || 'badge-gray'}">${level.toUpperCase()} ${score}%</span>
        </div>
        <div class="grid md:grid-cols-3 gap-3 mb-3 text-sm">
          <div><span class="text-gray-500">Known drifts:</span> <span class="text-white">${risk.known_drift_count ?? 0}</span></div>
          <div><span class="text-gray-500">Past runs:</span> <span class="text-white">${risk.past_run_count ?? 0}</span></div>
          <div><span class="text-gray-500">Worst verdict:</span> <span class="text-white">${risk.worst_historical_verdict || 'none'}</span></div>
        </div>
        <div class="space-y-1">${warningsHtml}</div>
      </div>
    `;
  }

  function _esc(str) {
    const d = document.createElement('div');
    d.textContent = str || '';
    return d.innerHTML;
  }

  return { createPR };
})();
