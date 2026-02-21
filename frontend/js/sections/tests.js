/**
 * Tests section — generated test code viewer with coverage gap.
 */
const TestsSection = (() => {
  State.on('result:tests', render);

  function render(data) {
    if (!data) return;
    const el = document.getElementById('sec-tests');

    const coverageColor = data.coverage_pct >= 80 ? 'text-safe' : data.coverage_pct >= 50 ? 'text-risky' : 'text-blocked';
    const coverageBarColor = data.coverage_pct >= 80 ? 'bg-safe' : data.coverage_pct >= 50 ? 'bg-risky' : 'bg-blocked';

    el.innerHTML = `
      <!-- Header -->
      <div class="result-card mb-6">
        <div class="flex items-center justify-between flex-wrap gap-4">
          <div>
            <h2 class="text-lg font-semibold text-white">${data.total} Tests Generated</h2>
            <span class="text-sm text-gray-500">Target: ${esc(data.target_module)}</span>
          </div>
          <div class="text-right">
            <div class="flex items-baseline gap-2">
              <span class="text-2xl font-bold ${coverageColor}">${data.coverage_pct.toFixed(1)}%</span>
              <span class="text-sm text-gray-500">function coverage</span>
            </div>
            <div class="progress-bar w-48 mt-1">
              <div class="progress-fill ${coverageBarColor}" style="width:${data.coverage_pct}%"></div>
            </div>
          </div>
        </div>
        ${data.uncovered_functions?.length ? `
        <details class="mt-3">
          <summary class="text-sm text-gray-500 cursor-pointer hover:text-gray-300">
            ${data.uncovered_functions.length} uncovered function${data.uncovered_functions.length !== 1 ? 's' : ''}
          </summary>
          <div class="mt-2 flex flex-wrap gap-1">
            ${data.uncovered_functions.map(f => `<span class="badge badge-red">${esc(f)}</span>`).join('')}
          </div>
        </details>` : ''}
      </div>

      <!-- Test Cards -->
      <div class="space-y-3">
        ${data.tests.map((t, i) => `
          <div>
            <button class="accordion-header" onclick="this.classList.toggle('open');this.nextElementSibling.classList.toggle('hidden')">
              <div class="flex items-center gap-3">
                <span class="text-white font-mono text-sm">${esc(t.function_name)}</span>
                ${t.covers_side_effects ? '<span class="badge badge-yellow">side effects</span>' : ''}
              </div>
              <svg class="accordion-arrow" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7"/>
              </svg>
            </button>
            <div class="accordion-body hidden">
              <div class="code-block"><pre><code class="language-python">${esc(t.test_code)}</code></pre></div>
            </div>
          </div>
        `).join('')}
      </div>
    `;

    // Highlight code blocks
    el.querySelectorAll('pre code').forEach(block => hljs.highlightElement(block));
  }

  function esc(s) {
    const d = document.createElement('div');
    d.textContent = s || '';
    return d.innerHTML;
  }

  return {};
})();
