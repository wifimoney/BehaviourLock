/**
 * API client — thin fetch wrapper for all BehaviourLock endpoints.
 */
const API = (() => {
  const BASE = '';  // same origin

  async function _fetch(path, opts = {}) {
    const res = await fetch(`${BASE}${path}`, {
      headers: { 'Content-Type': 'application/json', ...opts.headers },
      ...opts,
    });
    if (!res.ok) {
      const body = await res.json().catch(() => ({ detail: res.statusText }));
      throw new Error(body.detail || `HTTP ${res.status}`);
    }
    return res.json();
  }

  return {
    health()          { return _fetch('/health'); },

    // Ingest
    ingestPath(repoPath, targetModule) {
      return _fetch('/ingest/path', {
        method: 'POST',
        body: JSON.stringify({ repo_path: repoPath, target_module: targetModule || null }),
      });
    },
    async ingestUpload(file) {
      const form = new FormData();
      form.append('file', file);
      const res = await fetch(`${BASE}/ingest/upload`, { method: 'POST', body: form });
      if (!res.ok) {
        const body = await res.json().catch(() => ({ detail: res.statusText }));
        throw new Error(body.detail || `HTTP ${res.status}`);
      }
      return res.json();
    },

    // Demo
    seedDemo() {
      const form = new FormData();
      // Use the sample_legacy dir bundled with the project
      form.append('repo_path', './sample_legacy');
      return fetch(`${BASE}/demo/seed`, { method: 'POST', body: form })
        .then(r => { if (!r.ok) throw new Error(`HTTP ${r.status}`); return r.json(); });
    },

    // Pipeline
    runPipeline(sessionId, targetModule) {
      const qs = targetModule ? `?target_module=${encodeURIComponent(targetModule)}` : '';
      return _fetch(`/run/${sessionId}${qs}`, { method: 'POST' });
    },

    // Results
    getStatus(sid)     { return _fetch(`/status/${sid}`); },
    getGraph(sid)      { return _fetch(`/graph/${sid}`); },
    getTests(sid)      { return _fetch(`/tests/${sid}`); },
    getBaseline(sid)   { return _fetch(`/baseline/${sid}`); },
    getPatch(sid)      { return _fetch(`/patch/${sid}`); },
    getValidation(sid) { return _fetch(`/validation/${sid}`); },
    getReport(sid)     { return _fetch(`/report/${sid}`); },
    getDeadCode(sid)   { return _fetch(`/dead-code/${sid}`); },
  };
})();
