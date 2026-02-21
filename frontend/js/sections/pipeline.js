/**
 * Pipeline section — run button + SSE-driven animated stage stepper.
 */
const PipelineSection = (() => {
  const STAGES = ['ingest','mining','dead_code','testgen','baseline','migration','validation','report'];

  // Map backend current_stage values to stepper indices
  const STAGE_MAP = {
    'starting':              0,
    'ingested':              0,
    'workflow_mined':        1,
    'dead_code_detected':    2,
    'testgen_complete':      3,
    'baseline_complete':     4,
    'migration_complete':    5,
    'migrated':              5,
    'validated':             6,
    'validation_complete':   6,
    'report_complete':       7,
    'complete':              7,
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

    const statusEl = document.getElementById('pipeline-status');
    let currentIdx = 0;
    activateStep(0);
    statusEl.textContent = 'Pipeline starting...';

    try {
      // Fire the non-blocking /run endpoint
      await API.runPipeline(sid);

      // Connect to SSE stream for real-time progress
      const evtSource = new EventSource(`/stream/${sid}`);
      await new Promise((resolve, reject) => {
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

          if (data.error) {
            evtSource.close();
            errorStep(currentIdx);
            statusEl.textContent = `Error: ${data.error}`;
            Toast.error(`Pipeline error: ${data.error}`);
            reject(new Error(data.error));
          }
          if (data.done && !data.error) {
            evtSource.close();
            for (let i = 0; i < STAGES.length; i++) completeStep(i);
            statusEl.textContent = 'Pipeline complete!';
            Toast.success('Pipeline finished successfully');
            resolve();
          }
        };

        evtSource.onerror = () => {
          // SSE connection lost — fall back to polling
          evtSource.close();
          pollUntilDone(sid, currentIdx, statusEl).then(resolve).catch(reject);
        };
      });

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
      ['graph',    API.getGraph],
      ['tests',    API.getTests],
      ['baseline', API.getBaseline],
      ['patch',    API.getPatch],
      ['validation', API.getValidation],
      ['report',   API.getReport],
      ['deadCode', API.getDeadCode],
    ];
    const results = await Promise.allSettled(fetchers.map(([k, fn]) => fn(sid)));
    fetchers.forEach(([key], i) => {
      if (results[i].status === 'fulfilled') {
        State.setResult(key, results[i].value);
      }
    });
  }

  function resetStepper() {
    document.querySelectorAll('.step').forEach(s => s.classList.remove('active','done','error'));
    document.querySelectorAll('.step-line').forEach(l => l.classList.remove('done'));
  }

  function activateStep(idx) {
    const steps = document.querySelectorAll('.step');
    if (steps[idx]) steps[idx].classList.add('active');
  }

  function completeStep(idx) {
    const steps = document.querySelectorAll('.step');
    const lines = document.querySelectorAll('.step-line');
    if (steps[idx]) {
      steps[idx].classList.remove('active');
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

  return { init };
})();
