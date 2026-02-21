/**
 * Dead Code section — flagged unreachable, zero-caller, and commented-out blocks.
 */
const DeadCodeSection = (() => {
  State.on('result:deadCode', render);

  function render(data) {
    if (!data) return;
    const el = document.getElementById('sec-dead-code');

    const kindBadge = (kind) => {
      const map = {
        zero_callers:    ['badge-yellow', 'Zero Callers'],
        unreachable:     ['badge-red',    'Unreachable'],
        commented_block: ['badge-gray',   'Commented Out'],
      };
      const [cls, label] = map[kind] || ['badge-gray', kind];
      return `<span class="badge ${cls}">${label}</span>`;
    };

    el.innerHTML = `
      <!-- Summary -->
      <div class="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        <div class="result-card text-center">
          <div class="text-3xl font-bold text-white">${data.total}</div>
          <div class="text-sm text-gray-500">Total Issues</div>
        </div>
        <div class="result-card text-center">
          <div class="text-3xl font-bold text-risky">${data.zero_caller_count}</div>
          <div class="text-sm text-gray-500">Zero Callers</div>
        </div>
        <div class="result-card text-center">
          <div class="text-3xl font-bold text-blocked">${data.unreachable_count}</div>
          <div class="text-sm text-gray-500">Unreachable</div>
        </div>
        <div class="result-card text-center">
          <div class="text-3xl font-bold text-gray-400">${data.commented_block_count}</div>
          <div class="text-sm text-gray-500">Commented Blocks</div>
        </div>
      </div>

      <!-- Items Table -->
      <div class="result-card">
        <table class="data-table">
          <thead>
            <tr>
              <th>Name</th>
              <th>Module</th>
              <th>Line</th>
              <th>Kind</th>
              <th>Detail</th>
            </tr>
          </thead>
          <tbody>
            ${data.items.map(item => `
              <tr>
                <td class="font-mono text-white text-xs">${esc(item.name)}</td>
                <td class="text-gray-400 text-xs">${esc(item.module)}</td>
                <td class="text-gray-500 text-xs">${item.lineno}</td>
                <td>${kindBadge(item.kind)}</td>
                <td class="text-gray-400 text-xs">${esc(item.detail)}</td>
              </tr>
              ${item.source_snippet ? `
              <tr>
                <td colspan="5" class="py-0 px-4">
                  <pre class="text-xs text-gray-500 bg-bg rounded p-2 my-1 overflow-x-auto">${esc(item.source_snippet)}</pre>
                </td>
              </tr>` : ''}
            `).join('')}
          </tbody>
        </table>
        ${data.items.length === 0 ? '<p class="text-center text-gray-500 py-8">No dead code detected</p>' : ''}
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
