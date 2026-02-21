/**
 * Ingest section — path input, zip upload, demo button.
 */
const IngestSection = (() => {
  function init() {
    // Ingest from path
    document.getElementById('btn-ingest-path').addEventListener('click', async () => {
      const path = document.getElementById('ingest-path').value.trim();
      if (!path) { Toast.error('Enter a repository path'); return; }
      const mod = document.getElementById('ingest-module').value.trim();
      try {
        const res = await API.ingestPath(path, mod);
        State.setSession(res.session_id);
        Toast.success(`Session created: ${res.session_id}`);
        Tabs.enable('pipeline');
        Tabs.switchTo('pipeline');
      } catch (e) {
        Toast.error(`Ingest failed: ${e.message}`);
      }
    });

    // Zip upload
    const dropZone = document.getElementById('drop-zone');
    const fileInput = document.getElementById('file-input');

    dropZone.addEventListener('click', () => fileInput.click());
    dropZone.addEventListener('dragover', (e) => { e.preventDefault(); dropZone.classList.add('drop-active'); });
    dropZone.addEventListener('dragleave', () => dropZone.classList.remove('drop-active'));
    dropZone.addEventListener('drop', (e) => {
      e.preventDefault();
      dropZone.classList.remove('drop-active');
      const file = e.dataTransfer.files[0];
      if (file) uploadFile(file);
    });
    fileInput.addEventListener('change', () => {
      if (fileInput.files[0]) uploadFile(fileInput.files[0]);
    });

    // Demo button
    document.getElementById('btn-demo').addEventListener('click', async () => {
      const btn = document.getElementById('btn-demo');
      btn.disabled = true;
      btn.textContent = 'Loading...';
      try {
        const res = await API.seedDemo();
        State.setSession(res.session_id);
        Toast.success(`Demo loaded! Verdict: ${res.verdict}`);

        // Demo pre-runs the pipeline, so fetch all results
        await fetchAllResults(res.session_id);
        Tabs.enableAll();
        Tabs.switchTo('report');
      } catch (e) {
        Toast.error(`Demo failed: ${e.message}`);
      } finally {
        btn.disabled = false;
        btn.textContent = 'Load Demo Project';
      }
    });
  }

  async function uploadFile(file) {
    if (!file.name.endsWith('.zip')) { Toast.error('Only .zip files'); return; }
    const info = document.getElementById('upload-info');
    info.classList.remove('hidden');
    info.textContent = `Uploading ${file.name}...`;
    try {
      const res = await API.ingestUpload(file);
      State.setSession(res.session_id);
      info.textContent = `${file.name} (${(res.size_bytes / 1024).toFixed(1)} KB)`;
      Toast.success(`Uploaded! Session: ${res.session_id}`);
      Tabs.enable('pipeline');
      Tabs.switchTo('pipeline');
    } catch (e) {
      info.textContent = '';
      Toast.error(`Upload failed: ${e.message}`);
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

  return { init };
})();
