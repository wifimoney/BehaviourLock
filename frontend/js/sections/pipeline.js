/**
 * Pipeline section — run button + SSE-driven animated stage stepper.
 * Now includes Risk Check (step 6) with warning banner and override flow.
 */
const PipelineSection = (() => {
  const STAGES = ['ingest','mining','dead_code','testgen','baseline','risk_check','migration','validation','report'];

  // Map backend current_stage values to stepper indices (9 steps)
  const STAGE_MAP = {
    'starting':              0,
    'ingested':              0,
    'workflow_mined':        1,
    'dead_code_detected':    2,
    'testgen_complete':      3,
    'baseline_complete':     4,
    'risk_analyzed':         5,
    'risk_blocked':          5,
    'risk_overridden':       5,
    'migration_complete':    6,
    'migrated':              6,
    'validated':             7,
    'validation_complete':   7,
    'report_complete':       8,
    'complete':              8,
  };

  function init() {
    document.getElementById('btn-run-pipeline').addEventListener('click', runPipeline);
  }

  async function runPipeline() {
    const sid = State.getSession();
    if (!sid) { Toast.error('No session — ingest a repo first'); return; }
    if (State.isPipelineRunning()) return;

    const btn = document.getElementById('btn-run-pipeline');
    btn.disabled = true;
    btn.textContent = 'Running...';
    State.setPipelineRunning(true);
    resetStepper();
    hideRiskBanner();

    const statusEl = document.getElementById('pipeline-status');
    let currentIdx = 0;
    activateStep(0);
    statusEl.textContent = 'Pipeline starting...';

    try {
      // Fire the non-blocking /run endpoint
      await API.runPipeline(sid);

      // Connect to SSE stream for real-time progress
      const evtSource = new EventSource(`/stream/${sid}`);
      const result = await new Promise((resolve, reject) => {
        evtSource.onmessage = (event) => {
          let data;
          try { data = JSON.parse(event.data); } catch { return; }

          const stage = data.stage || '';
          const newIdx = STAGE_MAP[stage];

          if (newIdx !== undefined && newIdx > currentIdx) {
            // Complete all steps up to the new index
            for (let i = currentIdx; i < newIdx; i++) completeStep(i);
            currentIdx = newIdx;
            activateStep(currentIdx);
          }

          statusEl.textContent = `Stage: ${stage.replace(/_/g, ' ')}...`;

          // Handle risk assessment from SSE
          if (data.risk) {
            State.setResult('risk', data.risk);
            showRiskBanner(data.risk);

            if (data.risk.blocked) {
              evtSource.close();
              warningStep(currentIdx);
              statusEl.textContent = 'Pipeline paused — risk threshold exceeded. Override to continue.';
              Toast.info('Risk gate blocked migration. Review warnings and override if safe.');
              resolve({ blocked: true });
              return;
            }
          }

          // Handle live drift counts
          if (data.drifts) {
            showDriftBadge(data.drifts.total);
          }

          if (data.error) {
            evtSource.close();
            errorStep(currentIdx);
            statusEl.textContent = `Error: ${data.error}`;
            Toast.error(`Pipeline error: ${data.error}`);
            reject(new Error(data.error));
          }
          if (data.done && !data.error && !data.risk?.blocked) {
            evtSource.close();
            for (let i = 0; i < STAGES.length; i++) completeStep(i);
            statusEl.textContent = 'Pipeline complete!';
            Toast.success('Pipeline finished successfully');
            resolve({ blocked: false });
          }
        };

        evtSource.onerror = () => {
          // SSE connection lost — fall back to polling
          evtSource.close();
          pollUntilDone(sid, currentIdx, statusEl).then(() => resolve({ blocked: false })).catch(reject);
        };
      });

      if (result.blocked) {
        // Don't fetch results yet — pipeline is paused
        return;
      }

      // Fetch all results in parallel
      await fetchAllResults(sid);
      Tabs.enableAll();
      Tabs.switchTo('report');

    } catch (e) {
      if (e.message && !e.message.includes('Pipeline error')) {
        errorStep(currentIdx);
        statusEl.textContent = `Failed: ${e.message}`;
        Toast.error(`Pipeline failed: ${e.message}`);
      }
    } finally {
      State.setPipelineRunning(false);
      btn.disabled = false;
      btn.textContent = 'Run Pipeline';
    }
  }

  // Called when override button is clicked
  async function overrideRisk() {
    const sid = State.getSession();
    if (!sid) return;

    const btn = document.getElementById('btn-override-risk');
    if (btn) { btn.disabled = true; btn.textContent = 'Overriding...'; }

    const statusEl = document.getElementById('pipeline-status');
    State.setPipelineRunning(true);

    try {
      await API.overrideRisk(sid);

      // Mark risk step as done, continue stepper
      completeStep(5); // risk_check
      activateStep(6); // migration
      statusEl.textContent = 'Risk overridden — continuing migration...';
      Toast.success('Risk override accepted — pipeline resuming');
      hideRiskBanner();

      // Poll for remaining stages
      await pollUntilDone(sid, 6, statusEl);

      await fetchAllResults(sid);
      Tabs.enableAll();
      Tabs.switchTo('report');

    } catch (e) {
      statusEl.textContent = `Override failed: ${e.message}`;
      Toast.error(`Override failed: ${e.message}`);
    } finally {
      State.setPipelineRunning(false);
      const runBtn = document.getElementById('btn-run-pipeline');
      if (runBtn) { runBtn.disabled = false; runBtn.textContent = 'Run Pipeline'; }
    }
  }

  // Fallback polling if SSE isn't available
  async function pollUntilDone(sid, startIdx, statusEl) {
    let currentIdx = startIdx;
    while (true) {
      await new Promise(r => setTimeout(r, 2000));
      try {
        const status = await API.getStatus(sid);
        const newIdx = STAGE_MAP[status.current_stage];
        if (newIdx !== undefined && newIdx > currentIdx) {
          for (let i = currentIdx; i < newIdx; i++) completeStep(i);
          currentIdx = newIdx;
          activateStep(currentIdx);
        }
        statusEl.textContent = `Stage: ${status.current_stage.replace(/_/g, ' ')}...`;

        if (status.error) {
          errorStep(currentIdx);
          statusEl.textContent = `Error: ${status.error}`;
          throw new Error(status.error);
        }

        // Handle risk_blocked during polling
        if (status.current_stage === 'risk_blocked') {
          warningStep(currentIdx);
          statusEl.textContent = 'Pipeline paused — risk threshold exceeded.';
          // Fetch risk data
          try {
            const riskData = await API.getRisk(sid);
            State.setResult('risk', riskData);
            showRiskBanner({ ...riskData, blocked: true });
          } catch (_) {}
          return;
        }

        // Check if all stages are done
        const done = status.stages_done;
        if (done.report_ready) {
          for (let i = 0; i < STAGES.length; i++) completeStep(i);
          statusEl.textContent = 'Pipeline complete!';
          Toast.success('Pipeline finished successfully');
          return;
        }
      } catch (e) {
        if (e.message.includes('not found')) throw e;
        // Retry on transient errors
      }
    }
  }

  async function fetchAllResults(sid) {
    const fetchers = [
      ['graph',      API.getGraph],
      ['tests',      API.getTests],
      ['baseline',   API.getBaseline],
      ['risk',       API.getRisk],
      ['patch',      API.getPatch],
      ['validation', API.getValidation],
      ['report',     API.getReport],
      ['deadCode',   API.getDeadCode],
    ];
    const results = await Promise.allSettled(fetchers.map(([k, fn]) => fn(sid)));
    fetchers.forEach(([key], i) => {
      if (results[i].status === 'fulfilled') {
        State.setResult(key, results[i].value);
      }
    });
  }

  // ─── Risk banner ────────────────────────────────────────────────────────

  function showRiskBanner(risk) {
    const banner = document.getElementById('risk-banner');
    if (!banner) return;

    const levelColors = {
      low:     'border-safe/30 bg-safe/5',
      medium:  'border-risky/30 bg-risky/5',
      high:    'border-risky/50 bg-risky/10',
      blocked: 'border-blocked/30 bg-blocked/5',
    };
    const levelText = {
      low:     'text-safe',
      medium:  'text-risky',
      high:    'text-risky',
      blocked: 'text-blocked',
    };

    const level = risk.risk_level || 'medium';
    const colorClass = levelColors[level] || levelColors.medium;
    const textClass = levelText[level] || levelText.medium;
    const score = risk.risk_score != null ? (risk.risk_score * 100).toFixed(0) : '?';

    let warningHtml = '';
    if (risk.warnings && risk.warnings.length > 0) {
      warningHtml = risk.warnings.map(w => {
        const icon = w.severity === 'critical' ? '🔴' : '🟡';
        const seenTag = w.times_seen > 1 ? ` <span class="text-gray-500">(seen ${w.times_seen}x)</span>` : '';
        return `<div class="flex items-start gap-2 text-sm">
          <span>${icon}</span>
          <span><strong class="text-white">${_esc(w.function)}</strong> — ${_esc(w.message)}${seenTag}</span>
        </div>`;
      }).join('');
    }

    const overrideBtn = risk.blocked
      ? `<button id="btn-override-risk" class="mt-4 px-5 py-2 bg-risky/20 hover:bg-risky/30 text-risky text-sm font-medium rounded-lg border border-risky/30 transition-colors" onclick="PipelineSection.overrideRisk()">Override &amp; Continue</button>`
      : '';

    banner.className = `mt-6 rounded-xl border p-5 ${colorClass}`;
    banner.innerHTML = `
      <div class="flex items-center justify-between mb-3">
        <h3 class="font-semibold text-white">Pre-Migration Risk Assessment</h3>
        <span class="text-sm font-mono ${textClass}">${level.toUpperCase()} — ${score}%</span>
      </div>
      <div class="space-y-2">${warningHtml || '<p class="text-sm text-gray-400">No specific warnings found.</p>'}</div>
      ${overrideBtn}
    `;
    banner.classList.remove('hidden');
  }

  function hideRiskBanner() {
    const banner = document.getElementById('risk-banner');
    if (banner) { banner.classList.add('hidden'); banner.innerHTML = ''; }
  }

  // ─── Drift badge on validation step ─────────────────────────────────────

  function showDriftBadge(count) {
    const steps = document.querySelectorAll('.step');
    const validationStep = steps[7]; // index 7 = validation
    if (!validationStep) return;

    validationStep.style.position = 'relative';
    let badge = validationStep.querySelector('.drift-badge');
    if (!badge) {
      badge = document.createElement('span');
      badge.className = 'drift-badge';
      validationStep.appendChild(badge);
    }
    badge.textContent = count;
  }

  // ─── Stepper helpers ────────────────────────────────────────────────────

  function resetStepper() {
    document.querySelectorAll('.step').forEach(s => s.classList.remove('active','done','error','warning'));
    document.querySelectorAll('.step-line').forEach(l => l.classList.remove('done'));
    // Remove any drift badges
    document.querySelectorAll('.drift-badge').forEach(b => b.remove());
  }

  function activateStep(idx) {
    const steps = document.querySelectorAll('.step');
    if (steps[idx]) steps[idx].classList.add('active');
  }

  function completeStep(idx) {
    const steps = document.querySelectorAll('.step');
    const lines = document.querySelectorAll('.step-line');
    if (steps[idx]) {
      steps[idx].classList.remove('active', 'warning');
      steps[idx].classList.add('done');
    }
    if (lines[idx]) lines[idx].classList.add('done');
  }

  function errorStep(idx) {
    const steps = document.querySelectorAll('.step');
    if (steps[idx]) {
      steps[idx].classList.remove('active');
      steps[idx].classList.add('error');
    }
  }

  function warningStep(idx) {
    const steps = document.querySelectorAll('.step');
    if (steps[idx]) {
      steps[idx].classList.remove('active');
      steps[idx].classList.add('warning');
    }
  }

  function _esc(str) {
    const d = document.createElement('div');
    d.textContent = str || '';
    return d.innerHTML;
  }

  return { init, overrideRisk };
})();
