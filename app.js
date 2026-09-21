'use strict';

const LABELS = [
    'Notice_Requirement',
    'Right_to_Correct',
    'Right_to_Delete',
    'Right_to_Know',
    'Right_to_Limit_Sensitive',
    'Right_to_Opt_Out',
];

const SPLIT_NAMES = { train: 'Train', val: 'Validation', test: 'Test' };

const BADGE = {
    Notice_Requirement: 'bg-primary',
    Right_to_Correct: 'bg-success',
    Right_to_Delete: 'bg-danger',
    Right_to_Know: 'bg-warning text-dark',
    Right_to_Limit_Sensitive: 'bg-info text-dark',
    Right_to_Opt_Out: 'bg-secondary',
};

const PAGE_SIZE = 20;

const state = {
    active: null,
    cache: {},
    pages: { train: 1, val: 1, test: 1 },
    filters: { train: '', val: '', test: '' },
    charts: {},
};

const LABEL_COLOR = {
    Notice_Requirement: '#0d6efd',
    Right_to_Correct: '#198754',
    Right_to_Delete: '#dc3545',
    Right_to_Know: '#ffc107',
    Right_to_Limit_Sensitive: '#0dcaf0',
    Right_to_Opt_Out: '#6c757d',
};

function el(id) {
    return document.getElementById(id);
}

function esc(s) {
    const div = document.createElement('div');
    div.textContent = String(s);
    return div.innerHTML;
}

function badgeHtml(label) {
    return `<span class="badge ${BADGE[label] || 'bg-dark'} me-1">${esc(label)}</span>`;
}

async function fetchSplit(name) {
    if (!state.cache[name]) {
        const res = await fetch(`data/${name}.json`);
        if (!res.ok) throw new Error(`Could not load data/${name}.json (HTTP ${res.status})`);
        state.cache[name] = await res.json();
    }
    return state.cache[name];
}

function filteredRows(name) {
    const rows = state.cache[name];
    const q = state.filters[name].trim().toLowerCase();
    if (!q) return rows;
    return rows.filter((r) =>
        r.text.toLowerCase().includes(q) ||
        r.doc_id.toLowerCase().includes(q) ||
        r.labels.join(' ').toLowerCase().includes(q)
    );
}

function labelCounts(rows) {
    const counts = {};
    for (const label of LABELS) counts[label] = 0;
    for (const r of rows) for (const label of r.labels) counts[label] += 1;
    return counts;
}

function renderLabelDist(name) {
    const rows = filteredRows(name);
    const counts = labelCounts(rows);
    const max = Math.max(1, ...Object.values(counts));
    el('dist-body').innerHTML = LABELS.map((label) => {
        const n = counts[label];
        const pct = Math.round((n / max) * 100);
        return `
        <div class="mb-2">
          <div class="d-flex justify-content-between small mb-1">
            <span class="text-truncate me-2">${esc(label)}</span>
            <span class="text-muted">${n.toLocaleString()}</span>
          </div>
          <div class="progress" style="height: 8px;">
            <div class="progress-bar ${BADGE[label].replace(' text-dark', '').replace('bg-warning', 'bg-warning')}"
                 role="progressbar" style="width: ${pct}%" title="${esc(label)}: ${n}"></div>
          </div>
        </div>`;
    }).join('');
}

function renderChart(name) {
    const canvas = el('dist-chart');
    const emptyEl = el('dist-chart-empty');
    if (typeof Chart === 'undefined') {
        if (emptyEl) emptyEl.classList.remove('d-none');
        return;
    }
    if (state.charts[name]) state.charts[name].destroy();
    const counts = labelCounts(filteredRows(name));
    const values = LABELS.map((l) => counts[l]);
    state.charts[name] = new Chart(canvas.getContext('2d'), {
        type: 'doughnut',
        data: {
            labels: LABELS.map((l) => `${l} (${counts[l].toLocaleString()})`),
            datasets: [{
                data: values,
                backgroundColor: LABELS.map((l) => LABEL_COLOR[l]),
                borderColor: '#fff',
                borderWidth: 1,
            }],
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: { position: 'right', labels: { boxWidth: 12, font: { size: 11 } } },
                tooltip: { callbacks: { label: (ctx) => ` ${ctx.label}: ${ctx.parsed.toLocaleString()}` } },
            },
        },
    });
}

const MODEL_BAR = {
    labels: ['LegalBERT', 'RoBERTa-large', 'Flan-T5-base'],
    values: [0.7627, 0.7777, 0.7677],
};

const SPLIT_DECISIONS = {
    train: [5016, 167, 248, 555, 96, 408],
    val: [1321, 41, 62, 110, 11, 88],
    test: [1362, 45, 76, 187, 16, 101],
};

const SPLIT_TOTALS = { train: 6490, val: 1633, test: 1787 };

const PRF = [
    { model: 'LegalBERT', p: 0.7779, r: 0.7596, f1: 0.7627 },
    { model: 'RoBERTa-large', p: 0.8220, r: 0.7542, f1: 0.7777 },
    { model: 'Flan-T5-base', p: 0.8479, r: 0.7248, f1: 0.7677 },
];

function renderModelChart() {
    const canvas = el('model-chart');
    if (!canvas || typeof Chart === 'undefined') return;
    new Chart(canvas.getContext('2d'), {
        type: 'bar',
        data: {
            labels: MODEL_BAR.labels,
            datasets: [{
                label: 'Macro F1 (test split)',
                data: MODEL_BAR.values,
                backgroundColor: ['#1b4d89', '#198754', '#0d6efd'],
                borderRadius: 4,
                maxBarThickness: 42,
            }],
        },
        options: {
            indexAxis: 'y',
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: { display: false },
                tooltip: { callbacks: { label: (ctx) => ` Macro F1: ${ctx.parsed.x.toFixed(4)}` } },
            },
            scales: {
                x: { min: 0.6, max: 0.8, grid: { color: '#e9edf2' } },
                y: { grid: { display: false } },
            },
        },
    });
}

function renderSplitShareChart() {
    const canvas = el('split-share-chart');
    if (!canvas || typeof Chart === 'undefined') return;
    const shares = LABELS.map((label, i) => {
        const row = {};
        for (const k of ['train', 'val', 'test']) row[k] = +((SPLIT_DECISIONS[k][i] / SPLIT_TOTALS[k]) * 100).toFixed(1);
        return row;
    });
    new Chart(canvas.getContext('2d'), {
        type: 'bar',
        data: {
            labels: LABELS,
            datasets: ['train', 'val', 'test'].map((k, di) => ({
                label: SPLIT_NAMES[k],
                data: shares.map((row) => row[k]),
                backgroundColor: di === 0 ? '#1b4d89' : di === 1 ? '#9aa7b8' : '#198754',
                borderRadius: 3,
                maxBarThickness: 16,
            })),
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: { position: 'top', labels: { boxWidth: 12, font: { size: 11 } } },
                tooltip: { callbacks: { label: (ctx) => ` ${SPLIT_NAMES[ctx.dataset.label]} share: ${ctx.parsed.y.toFixed(1)}%` } },
            },
            scales: {
                x: { ticks: { maxRotation: 45, minRotation: 0, font: { size: 9 } }, grid: { display: false } },
                y: { title: { display: true, text: '% of label decisions', font: { size: 11 } }, min: 0, grid: { color: '#e9edf2' } },
            },
        },
    });
}

function renderPRFChart() {
    const canvas = el('prf-chart');
    if (!canvas || typeof Chart === 'undefined') return;
    new Chart(canvas.getContext('2d'), {
        type: 'bar',
        data: {
            labels: PRF.map((m) => m.model),
            datasets: [
                { label: 'Precision', data: PRF.map((m) => m.p), backgroundColor: '#1b4d89', borderRadius: 3, maxBarThickness: 18 },
                { label: 'Recall', data: PRF.map((m) => m.r), backgroundColor: '#0d6efd', borderRadius: 3, maxBarThickness: 18 },
                { label: 'F1', data: PRF.map((m) => m.f1), backgroundColor: '#198754', borderRadius: 3, maxBarThickness: 18 },
            ],
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: { position: 'top', labels: { boxWidth: 12, font: { size: 11 } } },
                tooltip: { callbacks: { label: (ctx) => ` ${ctx.dataset.label}: ${ctx.parsed.y.toFixed(4)}` } },
            },
            scales: {
                y: { min: 0.6, max: 0.9, title: { display: true, text: 'macro score', font: { size: 11 } }, grid: { color: '#e9edf2' } },
                x: { grid: { display: false } },
            },
        },
    });
}

function renderTable(name) {
    const rows = filteredRows(name);
    const totalPages = Math.max(1, Math.ceil(rows.length / PAGE_SIZE));
    if (state.pages[name] > totalPages) state.pages[name] = totalPages;

    const start = (state.pages[name] - 1) * PAGE_SIZE;
    const pageRows = rows.slice(start, start + PAGE_SIZE);

    el('table-body').innerHTML = pageRows.map((r, i) => {
        const badges = r.labels.length ? r.labels.map(badgeHtml).join('') :
            '<span class="text-muted small">(none)</span>';
        return `
        <tr>
          <td class="text-muted align-top">${start + i + 1}</td>
          <td class="align-top">
            <div class="text-truncate sample-text" style="max-width: 420px; cursor: zoom-in;"
                 data-full="${esc(r.text)}" title="Click to expand">
              ${esc(r.text)}
            </div>
          </td>
          <td class="align-top"><code class="small">${esc(r.doc_id)}</code></td>
          <td class="align-top">${badges}</td>
        </tr>`;
    }).join('');

    el('page-info').textContent = `Showing ${rows.length ? start + 1 : 0}–${Math.min(start + PAGE_SIZE, rows.length)} of ${rows.length.toLocaleString()} spans`;
    el('prev-btn').disabled = state.pages[name] <= 1;
    el('next-btn').disabled = state.pages[name] >= totalPages;
    el('page-pos').textContent = `Page ${state.pages[name]} of ${totalPages}`;
    el('total-pos').textContent = rows.length.toLocaleString();
}

function renderSplitHeader(name) {
    const rows = state.cache[name];
    const docs = new Set(rows.map((r) => r.doc_id)).size;
    const multi = rows.filter((r) => r.labels.length > 1).length;

    el('split-title').textContent = `${SPLIT_NAMES[name]} set`;
    el('split-copy').innerHTML =
        `The <strong>${SPLIT_NAMES[name]}</strong> split: ${rows.length.toLocaleString()} spans from ` +
        `<strong>${docs.toLocaleString()}</strong> unique documents (${multi.toLocaleString()} multi-label spans). ` +
        `Filtered and paged from the JSON extracted from the notebook.`;

    el('stat-span').textContent = rows.length.toLocaleString();
    el('stat-doc').textContent = docs.toLocaleString();
    el('stat-multi').textContent = multi.toLocaleString();
}

async function showSplit(name) {
    state.active = name;
    document.querySelectorAll('.tab-split').forEach((b) => b.classList.toggle('active', b.dataset.split === name));

    const content = el('split-content');
    content.innerHTML = `
      <div class="d-none" id="split-loading">
        <div class="text-center text-muted py-5">
          <div class="spinner-border text-primary mb-3" role="status"></div>
          <div>Loading ${SPLIT_NAMES[name].toLowerCase()} split…</div>
        </div>
      </div>
      <div id="split-ready"></div>`;

    try {
        await fetchSplit(name);
    } catch (err) {
        content.innerHTML = `
          <div class="alert alert-warning mb-0">
            <strong>Could not load <code>data/${name}.json</code>.</strong>
            <div class="mt-1">${esc(err.message)}</div>
            <div class="mt-2">Fetch requires serving over HTTP. Run
            <code>python -m http.server 8000</code> in this folder, then open
            <code>http://localhost:8000/</code>.</div>
          </div>`;
        return;
    }

    el('split-loading').classList.remove('d-none');
    el('split-ready').innerHTML = `
      <div class="mb-3">
        <h5 class="mb-1" id="split-title"></h5>
        <p class="text-muted mb-0" id="split-copy"></p>
      </div>

      <div class="row g-3 mb-3">
        <div class="col-4">
          <div class="card text-center h-100">
            <div class="card-body py-3">
              <div class="fs-4 fw-bold" id="stat-span">0</div>
              <div class="text-muted small">Spans</div>
            </div>
          </div>
        </div>
        <div class="col-4">
          <div class="card text-center h-100">
            <div class="card-body py-3">
              <div class="fs-4 fw-bold" id="stat-doc">0</div>
              <div class="text-muted small">Documents</div>
            </div>
          </div>
        </div>
        <div class="col-4">
          <div class="card text-center h-100">
            <div class="card-body py-3">
              <div class="fs-4 fw-bold" id="stat-multi">0</div>
              <div class="text-muted small">Multi-label spans</div>
            </div>
          </div>
        </div>
      </div>

      <div class="card mb-3">
        <div class="card-header">Label distribution <span class="text-muted fw-normal">(matching current filter)</span></div>
        <div class="card-body py-3 row g-4 align-items-center">
          <div class="col-md-5">
            <div class="position-relative" style="height: 260px;">
              <canvas id="dist-chart"></canvas>
              <div id="dist-chart-empty" class="d-none position-absolute top-0 start-0 w-100 h-100 d-flex align-items-center justify-content-center text-muted small">
                Chart.js not loaded; showing bar list only.
              </div>
            </div>
          </div>
          <div class="col-md-7" id="dist-body"></div>
        </div>
      </div>

      <div class="card">
        <div class="card-header d-flex flex-wrap justify-content-between align-items-center gap-2">
          <div class="d-flex align-items-center gap-2">
            <input type="search" id="filter-input" class="form-control form-control-sm" style="max-width: 320px;"
                   placeholder="Filter by text, doc, or label…">
            <span class="small text-muted" id="total-pos"></span>
          </div>
          <div class="d-flex align-items-center gap-2">
            <span class="small text-muted" id="page-pos"></span>
            <button id="prev-btn" class="btn btn-sm btn-outline-secondary">Prev</button>
            <button id="next-btn" class="btn btn-sm btn-outline-secondary">Next</button>
          </div>
        </div>
        <div class="table-responsive">
          <table class="table table-sm table-hover align-middle mb-0">
            <thead>
              <tr>
                <th style="width: 60px;">#</th>
                <th>Text span</th>
                <th style="width: 140px;">Document</th>
                <th style="width: 300px;">CPRA labels</th>
              </tr>
            </thead>
            <tbody id="table-body"></tbody>
          </table>
        </div>
        <div class="card-footer py-1 d-flex justify-content-between align-items-center small text-muted">
          <span id="page-info"></span>
          <span>${SPLIT_NAMES[name]} set</span>
        </div>
      </div>`;

    el('split-loading').classList.add('d-none');

    renderSplitHeader(name);
    renderLabelDist(name);
    renderChart(name);
    renderTable(name);

    el('filter-input').addEventListener('input', (e) => {
        state.filters[name] = e.target.value;
        state.pages[name] = 1;
        renderLabelDist(name);
        renderChart(name);
        renderTable(name);
    });
    el('prev-btn').addEventListener('click', () => {
        if (state.pages[name] > 1) { state.pages[name] -= 1; renderTable(name); }
    });
    el('next-btn').addEventListener('click', () => {
        const totalPages = Math.ceil(filteredRows(name).length / PAGE_SIZE);
        if (state.pages[name] < totalPages) { state.pages[name] += 1; renderTable(name); }
    });

    el('table-body').addEventListener('click', (e) => {
        const div = e.target.closest('.sample-text');
        if (!div) return;
        if (div.dataset.full === div.textContent) {
            div.textContent = div.dataset.full.slice(0, 120) + (div.dataset.full.length > 120 ? '…' : '');
            div.classList.add('text-truncate');
            div.title = 'Click to expand';
        } else {
            div.classList.remove('text-truncate');
            div.classList.add('text-wrap');
            div.textContent = div.dataset.full;
            div.title = 'Click to collapse';
        }
    });
}

function limeWordsHtml(lime) {
    if (!lime) return '';
    const max = Math.max(0.01, ...Object.values(lime).flat().map((w) => Math.abs(w.weight)));
    const groups = Object.entries(lime).map(([label, words]) => [
        label,
        words.filter((w) => w.weight !== 0).slice(0, 4),
    ]).filter(([, ws]) => ws.length);
    if (!groups.length) {
        return `
          <div class="small text-muted border-top pt-2">
            The model was already certain here; it kept predicting <em>Notice_Requirement</em> at
            probability&nbsp;1.0 no matter which words it was shown. With no uncertainty, LIME's
            numeric strength list collapses to all-zero, so there is nothing for the word bars to show.
            That's the model being confident, not an error.
          </div>`;
    }
    return `
      <div class="small border-top pt-2">
        <div class="fw-semibold mb-1">Words that mattered for each right:</div>
        <div class="d-flex align-items-center gap-2 text-muted mb-2">
          <span class="d-inline-block" style="width:14px;height:8px;border-radius:2px;background:#198754;"></span> word
          pushes <b class="text-success">&nbsp;toward&nbsp;</b> the right &nbsp;·&nbsp;
          <span class="d-inline-block" style="width:14px;height:8px;border-radius:2px;background:#dc3545;"></span> pushes <b class="text-danger">&nbsp;away&nbsp;</b>
          &nbsp;·&nbsp; longer bar = bigger effect
        </div>
        ${groups.map(([label, ws]) => `
          <div class="mb-2">
            <div class="badge bg-light text-muted mb-1">${esc(label)}</div>
            ${ws.map((w) => `
              <div class="d-flex align-items-center gap-2 mb-1">
                <span class="text-truncate small" style="width:120px;">${esc(w.word)}</span>
                <div class="flex-grow-1 bg-light rounded" style="height:10px;">
                  <div class="rounded ${w.weight >= 0 ? 'bg-success' : 'bg-danger'}"
                       title="${esc(w.word)} ${w.weight >= 0 ? '+' : ''}${w.weight.toFixed(4)}"
                       style="height:10px; width:${Math.round((Math.abs(w.weight) / max) * 100)}%;"></div>
                </div>
                <span class="${w.weight >= 0 ? 'text-success' : 'text-danger'} small" style="width:56px; text-align:right;">${w.weight >= 0 ? '+' : ''}${w.weight.toFixed(3)}</span>
              </div>`).join('')}
          </div>`).join('')}
      </div>`;
}

async function loadExplainability() {
    const shapPlots = [
        {
            file: 'explainability/shap_legalbert.html',
            title: 'LegalBERT, asked about Right_to_Delete',
            badge: 'Test sample 1',
            note: 'The sample is an address block, and Right_to_Delete never appears in it. Every word votes slightly <em>against</em> the label; the model is correctly staying quiet rather than inventing a right.',
        },
        {
            file: 'explainability/shap_roberta.html',
            title: 'RoBERTa-large, asked about Right_to_Opt_Out',
            badge: 'Test sample 2',
            note: 'Same test sentence, different question. Here a few words tilt the vote; most stay near zero. The joined span separators render as line breaks in the source text.',
        },
    ];

    el('shap-cards').innerHTML = shapPlots.map((p, i) => `
        <div class="col-lg-6">
          <div class="card h-100">
            <div class="card-header py-2 d-flex flex-wrap justify-content-between align-items-center gap-2">
              <span class="small fw-semibold">${esc(p.title)}</span>
              <span class="badge bg-light text-muted">${esc(p.badge)}</span>
            </div>
            <div class="card-body p-3">
              <div id="shap-plot-${i}" class="shap-plot rounded p-2 mb-2" style="overflow:auto; max-height:320px; background:#fff; border:1px solid #dee2e6;">
                <div class="text-muted small d-flex align-items-center gap-2"><div class="spinner-border spinner-border-sm"></div> Loading SHAP plot…</div>
              </div>
              <div class="small text-muted">${p.note}</div>
            </div>
          </div>
        </div>`).join('');

    for (let i = 0; i < shapPlots.length; i++) {
        try {
            const res = await fetch(shapPlots[i].file);
            if (!res.ok) throw new Error('HTTP ' + res.status);
            el(`shap-plot-${i}`).innerHTML = await res.text();
        } catch (err) {
            el(`shap-plot-${i}`).innerHTML = `<span class="text-muted small">Could not load ${esc(shapPlots[i].file)}: ${esc(err.message)}</span>`;
        }
    }

    try {
        const res = await fetch('explainability/lime_samples.json');
        if (!res.ok) throw new Error('HTTP ' + res.status);
        const samples = await res.json();
        el('lime-cards').innerHTML = samples.map((s) => `
            <div class="col-md-4">
              <div class="card h-100">
                <div class="card-header py-2 d-flex justify-content-between align-items-center gap-2">
                  <span class="small fw-semibold">LIME sample ${esc(String(s.index))}</span>
                  <span class="text-muted small">${esc(s.doc_id)}</span>
                </div>
                <div class="card-body">
                  <p class="small text-muted mb-2">${esc(s.text)}</p>
                  <div class="mb-2">${s.labels.map(badgeHtml).join(' ')}</div>
                  <div class="small text-muted mb-2">What the human annotators marked as true for this span. LIME asked Flan-T5-base about these same three test spans (notebook BLOCK 26).</div>
                  ${limeWordsHtml(s.lime)}
                </div>
              </div>
            </div>`).join('');
    } catch (err) {
        el('lime-cards').innerHTML = `<div class="col-12 text-muted small">Could not load LIME samples: ${esc(err.message)}</div>`;
    }
}

document.addEventListener('DOMContentLoaded', () => {
    document.querySelectorAll('.tab-split').forEach((btn) => {
        btn.addEventListener('click', () => showSplit(btn.dataset.split));
    });
    if (el('shap-cards') && el('lime-cards')) loadExplainability();
    renderModelChart();
    renderSplitShareChart();
    renderPRFChart();
});