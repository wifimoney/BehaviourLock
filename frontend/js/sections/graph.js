/**
 * Graph section — Cytoscape.js call graph visualization.
 */
const GraphSection = (() => {
  let cy = null;

  function init() {
    document.getElementById('graph-zoom-in').addEventListener('click', () => cy && cy.zoom(cy.zoom() * 1.3));
    document.getElementById('graph-zoom-out').addEventListener('click', () => cy && cy.zoom(cy.zoom() / 1.3));
    document.getElementById('graph-fit').addEventListener('click', () => cy && cy.fit(undefined, 30));

    State.on('result:graph', render);
    // Re-render when tab is switched to graph (Cytoscape needs visible container)
    State.on('tabSwitch', tab => {
      if (tab === 'graph' && State.getResult('graph') && !cy) render(State.getResult('graph'));
      if (tab === 'graph' && cy) setTimeout(() => cy.resize(), 50);
    });
  }

  function render(data) {
    if (!data) return;
    const container = document.getElementById('cy-container');
    if (!container.offsetWidth) return; // not visible yet

    const NODE_COLORS = {
      entrypoint: '#22c55e',
      function:   '#6366f1',
      sideeffect: '#f59e0b',
      class:      '#8b5cf6',
    };
    const NODE_SHAPES = {
      entrypoint: 'hexagon',
      function:   'ellipse',
      sideeffect: 'diamond',
      class:      'round-rectangle',
    };
    const EDGE_STYLES = {
      direct:      'solid',
      conditional: 'dashed',
      loop:        'dotted',
    };

    const elements = [
      ...data.nodes.map(n => ({
        data: { ...n.data },
      })),
      ...data.edges.map(e => ({
        data: { ...e.data },
      })),
    ];

    cy = cytoscape({
      container,
      elements,
      style: [
        {
          selector: 'node',
          style: {
            'label': 'data(label)',
            'background-color': (ele) => NODE_COLORS[ele.data('node_type')] || '#6366f1',
            'shape': (ele) => NODE_SHAPES[ele.data('node_type')] || 'ellipse',
            'color': '#e5e7eb',
            'text-valign': 'bottom',
            'text-margin-y': 6,
            'font-size': 11,
            'width': 35,
            'height': 35,
            'border-width': 2,
            'border-color': '#1a1d2e',
          },
        },
        {
          selector: 'edge',
          style: {
            'width': 2,
            'line-color': '#4b5563',
            'target-arrow-color': '#4b5563',
            'target-arrow-shape': 'triangle',
            'curve-style': 'bezier',
            'line-style': (ele) => EDGE_STYLES[ele.data('call_type')] || 'solid',
            'arrow-scale': 0.8,
          },
        },
        {
          selector: 'node:selected',
          style: {
            'border-color': '#818cf8',
            'border-width': 3,
          },
        },
      ],
      layout: {
        name: 'dagre',
        rankDir: 'TB',
        nodeSep: 60,
        rankSep: 80,
        padding: 30,
      },
      minZoom: 0.2,
      maxZoom: 3,
    });

    cy.on('tap', 'node', (evt) => {
      const d = evt.target.data();
      const detail = document.getElementById('node-detail');
      const name = document.getElementById('node-detail-name');
      const body = document.getElementById('node-detail-body');
      detail.classList.remove('hidden');
      name.textContent = `${d.label} (${d.node_type})`;
      body.innerHTML = `
        <p><strong>Module:</strong> ${d.module}</p>
        <p><strong>Line:</strong> ${d.lineno}</p>
        ${d.side_effects?.length ? `<p><strong>Side effects:</strong> ${d.side_effects.join(', ')}</p>` : ''}
      `;
    });

    cy.on('tap', (evt) => {
      if (evt.target === cy) {
        document.getElementById('node-detail').classList.add('hidden');
      }
    });
  }

  return { init };
})();
