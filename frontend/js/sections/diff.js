/**
 * Diff section — diff2html migration diff viewer.
 */
const DiffSection = (() => {
  State.on('result:patch', render);

  function render(data) {
    if (!data) return;
    const el = document.getElementById('sec-diff');

    const lintBadge = data.lint_passed
      ? '<span class="badge badge-green">Lint Passed</span>'
      : '<span class="badge badge-red">Lint Failed</span>';

    el.innerHTML = `
      <!-- Lint Status -->
      <div class="result-card mb-4 flex items-center justify-between">
        <div class="flex items-center gap-3">
          <h2 class="text-lg font-semibold text-white">Migration Diff</h2>
          ${lintBadge}
        </div>
        <span class="text-sm text-gray-500">${data.changes.length} change${data.changes.length !== 1 ? 's' : ''}</span>
      </div>
      ${data.lint_errors?.length ? `
      <div class="result-card mb-4">
        <h3 class="text-sm text-gray-500 mb-2">Lint Errors</h3>
        <ul class="text-xs text-blocked space-y-1">
          ${data.lint_errors.map(e => `<li>${esc(e)}</li>`).join('')}
        </ul>
      </div>` : ''}

      <!-- Diff Viewer -->
      <div class="result-card mb-4">
        <div id="diff-viewer"></div>
      </div>

      <!-- Changes Breakdown -->
      <div class="result-card">
        <h3 class="text-sm text-gray-500 mb-3">Changes Breakdown</h3>
        <table class="data-table">
          <thead>
            <tr>
              <th>File</th>
              <th>Line</th>
              <th>Type</th>
              <th>Description</th>
              <th>Before/After</th>
            </tr>
          </thead>
          <tbody>
            ${data.changes.map(c => {
              const typeBadge = {
                syntax:    'badge-blue',
                api:       'badge-yellow',
                semantic:  'badge-red',
                dead_code: 'badge-gray',
              }[c.change_type] || 'badge-gray';
              return `
              <tr>
                <td class="font-mono text-white text-xs">${esc(c.file)}</td>
                <td class="text-gray-400 text-xs">${c.lineno}</td>
                <td><span class="badge ${typeBadge}">${c.change_type}</span></td>
                <td class="text-gray-400 text-xs">${esc(c.description)}</td>
                <td>
                  <details>
                    <summary class="text-xs text-gray-500 cursor-pointer">view</summary>
                    <div class="mt-1 space-y-1">
                      <pre class="text-xs bg-blocked/10 text-blocked rounded p-2 overflow-x-auto">- ${esc(c.before)}</pre>
                      <pre class="text-xs bg-safe/10 text-safe rounded p-2 overflow-x-auto">+ ${esc(c.after)}</pre>
                    </div>
                  </details>
                </td>
              </tr>`;
            }).join('')}
          </tbody>
        </table>
      </div>
    `;

    // Render diff2html
    if (data.unified_diff && typeof Diff2HtmlUI !== 'undefined') {
      try {
        const diffContainer = document.getElementById('diff-viewer');
        const config = {
          drawFileList: false,
          outputFormat: 'side-by-side',
          matching: 'lines',
          highlight: true,
        };
        const ui = new Diff2HtmlUI(diffContainer, data.unified_diff, config);
        ui.draw();
      } catch (e) {
        document.getElementById('diff-viewer').innerHTML =
          `<pre class="text-xs text-gray-400 bg-bg rounded p-4 overflow-auto">${esc(data.unified_diff)}</pre>`;
      }
    }
  }

  function esc(s) {
    const d = document.createElement('div');
    d.textContent = s || '';
    return d.innerHTML;
  }

  return {};
})();
